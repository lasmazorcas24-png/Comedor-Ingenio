/* Fase 3: producción (corte, uso, merma) y control de diferencia en kilos. Archivo aparte. */

HOJAS.productos_menu = ['id','nombre','precio','activo','orden','porcion_kg'];
HOJAS.produccion = ['id','turno_id','tipo','producto_id','producto','kg','hora','usuario','estado','nota'];

function configValor_(clave, defecto) {
  const f = filas_('config').filter(function (x) { return x.clave === clave; })[0];
  return f && f.valor !== '' ? f.valor : defecto;
}

function produccionDeTurno_(id) {
  return filasRecientes_('produccion', 3000).filter(function (r) {
    return r.turno_id === id && r.estado === 'activo';
  });
}

function produccionProductos_() {
  return filas_('productos_menu')
    .filter(function (p) { return esVerdadero_(p.activo) && num_(p.porcion_kg) > 0; })
    .sort(function (a, b) { return num_(a.orden) - num_(b.orden); })
    .map(function (p) { return { id: p.id, nombre: p.nombre }; });
}

function produccionRegistrar_(d, ctx) {
  const tipo = String(d.tipo);
  if (['corte', 'uso', 'merma'].indexOf(tipo) === -1) throw err_('Tipo no válido');
  const kg = redondear_(num_(d.kg));
  if (kg <= 0 || kg > 500) throw err_('Los kilos no son válidos');
  const p = produccionProductos_().filter(function (x) { return x.id === d.producto_id; })[0];
  if (!p) throw err_('Platillo no válido');
  const id = conLock_(function () {
    const t = turnoAbierto_();
    if (!t) throw err_('No hay turno abierto');
    const nuevo = Utilities.getUuid();
    hoja_('produccion').appendRow([nuevo, t.id, tipo, p.id, p.nombre, kg, ahoraTxt_().hora,
      ctx.usuario.nombre, 'activo', limpiar_(d.nota)]);
    return nuevo;
  });
  auditar_(ctx.usuario.nombre, 'produccion.' + tipo, 'produccion', id, p.nombre + ' · ' + kg + ' kg');
  return { id: id, kg: kg };
}

function produccionResumen_(d, ctx) {
  const t = turnoAbierto_();
  if (!t) return { turno: false };
  const reg = produccionDeTurno_(t.id);
  const ventas = ventasDeTurno_(t.id).filter(function (v) { return v.estado === 'activa'; });
  const porcion = {};
  filas_('productos_menu').forEach(function (p) { porcion[p.id] = num_(p.porcion_kg); });

  const mapa = {};
  function fila(id, nombre) {
    if (!mapa[id]) mapa[id] = { producto: nombre, corte: 0, uso: 0, merma: 0, ventasKg: 0 };
    return mapa[id];
  }
  reg.forEach(function (r) {
    const x = fila(r.producto_id, r.producto);
    x[r.tipo] = redondear_(x[r.tipo] + num_(r.kg));
  });
  ventas.forEach(function (v) {
    const k = num_(v.cantidad) * (porcion[v.producto_id] || 0);
    if (k > 0) { const x = fila(v.producto_id, v.producto); x.ventasKg = redondear_(x.ventasKg + k); }
  });
  const platillos = Object.keys(mapa).map(function (k) {
    const x = mapa[k];
    x.sobrante = redondear_(x.corte - x.uso - x.merma);
    x.diferencia = redondear_(x.uso - x.ventasKg);
    return x;
  });
  const tot = { corte: suma_(platillos, 'corte'), uso: suma_(platillos, 'uso'), merma: suma_(platillos, 'merma'),
    ventasKg: suma_(platillos, 'ventasKg') };
  tot.sobrante = redondear_(tot.corte - tot.uso - tot.merma);
  tot.diferencia = redondear_(tot.uso - tot.ventasKg);
  const tolerancia = num_(configValor_('tolerancia_dif_kg', 1.5));
  const estado = (tot.corte === 0 && tot.uso === 0 && tot.ventasKg === 0) ? 'sin_datos'
    : (Math.abs(tot.diferencia) <= tolerancia ? 'ok' : 'alerta');

  const salida = {
    turno: true, corte: tot.corte, uso: tot.uso, merma: tot.merma, sobrante: tot.sobrante, tolerancia: tolerancia,
    platillos: platillos,
    registros: reg.slice(-30).reverse().map(function (r) {
      return { id: r.id, hora: String(r.hora).slice(0, 5), tipo: r.tipo, producto: r.producto, kg: num_(r.kg), usuario: r.usuario };
    })
  };
  const veDif = ctx.rol !== 'cocina' || esVerdadero_(configValor_('cocina_ve_diferencia', true));
  if (veDif) {
    salida.ventasKg = tot.ventasKg; salida.diferencia = tot.diferencia; salida.estado = estado;
  } else {
    salida.platillos = platillos.map(function (x) {
      return { producto: x.producto, corte: x.corte, uso: x.uso, merma: x.merma, sobrante: x.sobrante };
    });
  }
  return salida;
}

function produccionAnular_(d, ctx) {
  const r = filasRecientes_('produccion', 3000).filter(function (x) { return x.id === d.id; })[0];
  if (!r) throw err_('Registro no encontrado');
  conLock_(function () {
    const t = turnoAbierto_();
    if (!t || t.id !== r.turno_id) throw err_('Solo se pueden anular registros del turno abierto');
    hoja_('produccion').getRange(r._fila, 9).setValue('anulado');
  });
  auditar_(ctx.usuario.nombre, 'produccion.anulada', 'produccion', r.id, r.tipo + ' · ' + r.producto + ' · ' + r.kg + ' kg');
  return { anulado: true };
}

Object.assign(ACCIONES, {
  'produccion.productos': { permiso: 'produccion.registrar', fn: produccionProductos_ },
  'produccion.registrar': { permiso: 'produccion.registrar', fn: produccionRegistrar_ },
  'produccion.resumen':   { permiso: 'produccion.ver',       fn: produccionResumen_ },
  'produccion.anular':    { permiso: 'produccion.ajustar',   fn: produccionAnular_ }
});

/* ---------- preparación (ejecutar UNA vez) ---------- */

function prepararFase3() {
  configurarHojas();
  const ss = abrirHoja_();
  ss.getSheetByName('produccion').getRange('G:G').setNumberFormat('@');

  // peso por porción (kg) de ejemplo; 0 = no se controla en kilos. Cámbialo en productos_menu.
  const m = ss.getSheetByName('productos_menu');
  const n = m.getLastRow();
  if (n > 1) {
    const rng = m.getRange(2, 1, n - 1, 6);
    const v = rng.getValues();
    const pesos = { 'comida completa': 0.35, 'verdura y ensalada': 0.2, 'sopa': 0.3, 'bebida': 0, 'postre': 0.1 };
    v.forEach(function (f) {
      if (f[5] === '') {
        const k = String(f[1]).toLowerCase();
        f[5] = pesos[k] !== undefined ? pesos[k] : 0;
      }
    });
    rng.setValues(v);
  }

  const rp = ss.getSheetByName('roles_permisos');
  const ex = rp.getLastRow() > 1
    ? rp.getRange(2, 1, rp.getLastRow() - 1, 2).getValues().map(function (r) { return r[0] + '|' + r[1]; })
    : [];
  if (ex.indexOf('encargada|produccion.ajustar') === -1) rp.appendRow(['encargada', 'produccion.ajustar']);

  const cf = ss.getSheetByName('config');
  const claves = cf.getLastRow() > 1
    ? cf.getRange(2, 1, cf.getLastRow() - 1, 1).getValues().map(function (r) { return r[0]; })
    : [];
  [['tolerancia_dif_kg', 1.5], ['cocina_ve_diferencia', true]].forEach(function (c) {
    if (claves.indexOf(c[0]) === -1) cf.appendRow(c);
  });
  SpreadsheetApp.flush();
  Logger.log('Fase 3 lista: hoja produccion, pesos por porción, permisos y configuración.');
}
