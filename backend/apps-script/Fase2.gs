/* Fase 2: turnos, ventas y caja. Archivo aparte; se agrega a Codigo.gs sin modificarlo. */

const TZ = 'America/Mexico_City';

Object.assign(HOJAS, {
  productos_menu: ['id','nombre','precio','activo','orden'],
  turnos: ['id','fecha','abierto_por','hora_apertura','hora_cierre','estado','fondo_inicial','cerrado_por'],
  ventas: ['id','turno_id','producto_id','producto','cantidad','precio','total','hora','usuario','estado','motivo'],
  caja_movimientos: ['id','turno_id','tipo','concepto','monto','hora','usuario','estado'],
  caja_cierres: ['id','turno_id','esperado','contado','diferencia','nota','cerrado_por','hora']
});

/* ---------- utilidades ---------- */

function ahoraTxt_() {
  const d = new Date();
  return { fecha: Utilities.formatDate(d, TZ, 'yyyy-MM-dd'), hora: Utilities.formatDate(d, TZ, 'HH:mm:ss') };
}
function txt_(v, f) { return v instanceof Date ? Utilities.formatDate(v, TZ, f) : String(v); }
function num_(v) { const n = Number(v); return isNaN(n) ? 0 : n; }
function redondear_(n) { return Math.round(n * 100) / 100; }
function limpiar_(s) { return String(s || '').trim().replace(/^[=+\-@]+/, '').slice(0, 200); }
function suma_(arr, campo) { return redondear_(arr.reduce(function (a, x) { return a + num_(x[campo]); }, 0)); }

function filasRecientes_(nombreHoja, max) {
  const h = hoja_(nombreHoja);
  const n = h.getLastRow();
  if (n < 2) return [];
  const cols = HOJAS[nombreHoja];
  const ini = Math.max(2, n - max + 1);
  return h.getRange(ini, 1, n - ini + 1, cols.length).getValues().map(function (f, i) {
    const o = { _fila: ini + i };
    cols.forEach(function (c, j) { o[c] = f[j]; });
    return o;
  });
}

function turnoAbierto_() {
  return filas_('turnos').filter(function (t) { return t.estado === 'abierto'; })[0] || null;
}
function ventasDeTurno_(id) {
  return filasRecientes_('ventas', 3000).filter(function (v) { return v.turno_id === id; });
}
function movsDeTurno_(id) {
  return filasRecientes_('caja_movimientos', 1500).filter(function (m) {
    return m.turno_id === id && m.estado === 'activo';
  });
}

function resumenCaja_(t) {
  const ventas = ventasDeTurno_(t.id).filter(function (v) { return v.estado === 'activa'; });
  const movs = movsDeTurno_(t.id);
  const ingresos = suma_(movs.filter(function (m) { return m.tipo === 'ingreso'; }), 'monto');
  const gastos = suma_(movs.filter(function (m) { return m.tipo === 'gasto'; }), 'monto');
  const totalVentas = suma_(ventas, 'total');
  const fondo = num_(t.fondo_inicial);
  return {
    fondo: fondo, ventas: totalVentas, platillos: suma_(ventas, 'cantidad'),
    ingresos: ingresos, gastos: gastos,
    esperado: redondear_(fondo + totalVentas + ingresos - gastos),
    movimientos: movs
  };
}

/* ---------- menú y estado ---------- */

function menuListar_() {
  return filas_('productos_menu')
    .filter(function (p) { return esVerdadero_(p.activo); })
    .sort(function (a, b) { return num_(a.orden) - num_(b.orden); })
    .map(function (p) { return { id: p.id, nombre: p.nombre, precio: num_(p.precio) }; });
}

function turnosEstado_() {
  const t = turnoAbierto_();
  if (!t) return { abierto: false };
  return { abierto: true, id: t.id, fecha: txt_(t.fecha, 'yyyy-MM-dd'),
    desde: String(t.hora_apertura).slice(0, 5), fondo: num_(t.fondo_inicial), por: t.abierto_por };
}

/* ---------- turnos ---------- */

function turnosAbrir_(d, ctx) {
  const fondo = num_(d.fondo);
  if (fondo < 0 || fondo > 100000) throw err_('El fondo inicial no es válido');
  const id = conLock_(function () {
    if (turnoAbierto_()) throw err_('Ya hay un turno abierto');
    const a = ahoraTxt_();
    const nuevo = Utilities.getUuid();
    hoja_('turnos').appendRow([nuevo, a.fecha, ctx.usuario.nombre, a.hora, '', 'abierto', redondear_(fondo), '']);
    return nuevo;
  });
  auditar_(ctx.usuario.nombre, 'turno.abierto', 'turnos', id, 'fondo ' + redondear_(fondo));
  return { id: id };
}

function turnosCerrar_(d, ctx) {
  if (d.contado === undefined || d.contado === null || String(d.contado).trim() === '') {
    throw err_('Escribe el efectivo contado');
  }
  const contado = num_(d.contado);
  if (contado < 0 || contado > 1000000) throw err_('El efectivo contado no es válido');
  const r = conLock_(function () {
    const t = turnoAbierto_();
    if (!t) throw err_('No hay turno abierto');
    const res = resumenCaja_(t);
    const dif = redondear_(contado - res.esperado);
    const a = ahoraTxt_();
    const h = hoja_('turnos');
    h.getRange(t._fila, 5).setValue(a.hora);
    h.getRange(t._fila, 6).setValue('cerrado');
    h.getRange(t._fila, 8).setValue(ctx.usuario.nombre);
    hoja_('caja_cierres').appendRow([Utilities.getUuid(), t.id, res.esperado, redondear_(contado),
      dif, limpiar_(d.nota), ctx.usuario.nombre, a.hora]);
    return { esperado: res.esperado, contado: redondear_(contado), diferencia: dif,
      ventas: res.ventas, gastos: res.gastos };
  });
  auditar_(ctx.usuario.nombre, 'turno.cerrado', 'turnos', '', 'diferencia ' + r.diferencia);
  return r;
}

/* ---------- ventas ---------- */

function ventasRegistrar_(d, ctx) {
  const lineas = Array.isArray(d.lineas) ? d.lineas : [];
  if (!lineas.length || lineas.length > 30) throw err_('Elige al menos un platillo');
  const menu = {};
  menuListar_().forEach(function (p) { menu[p.id] = p; });
  const r = conLock_(function () {
    const t = turnoAbierto_();
    if (!t) throw err_('No hay turno abierto. Pide a la encargada que lo abra.');
    const a = ahoraTxt_();
    const filas = [];
    let total = 0;
    lineas.forEach(function (l) {
      const p = menu[l.producto_id];
      const c = Math.floor(num_(l.cantidad));
      if (!p) throw err_('Platillo no válido');
      if (c < 1 || c > 200) throw err_('Cantidad no válida');
      const importe = redondear_(p.precio * c);
      total += importe;
      filas.push([Utilities.getUuid(), t.id, p.id, p.nombre, c, p.precio, importe, a.hora, ctx.usuario.nombre, 'activa', '']);
    });
    const h = hoja_('ventas');
    h.getRange(h.getLastRow() + 1, 1, filas.length, filas[0].length).setValues(filas);
    return { total: redondear_(total), lineas: filas.length };
  });
  auditar_(ctx.usuario.nombre, 'venta.registrada', 'ventas', '', r.lineas + ' líneas, total ' + r.total);
  return r;
}

function ventasLista_() {
  const t = turnoAbierto_();
  if (!t) return { turno: false, ventas: [], total: 0, platillos: 0 };
  const todas = ventasDeTurno_(t.id);
  const activas = todas.filter(function (v) { return v.estado === 'activa'; });
  return {
    turno: true, total: suma_(activas, 'total'), platillos: suma_(activas, 'cantidad'),
    ventas: todas.reverse().map(function (v) {
      return { id: v.id, hora: String(v.hora).slice(0, 5), producto: v.producto, cantidad: num_(v.cantidad),
        total: num_(v.total), usuario: v.usuario, estado: v.estado };
    })
  };
}

function ventasAnular_(d, ctx) {
  const v = filasRecientes_('ventas', 3000).filter(function (x) { return x.id === d.id; })[0];
  if (!v) throw err_('Venta no encontrada');
  const motivo = limpiar_(d.motivo);
  if (motivo.length < 3) throw err_('Escribe el motivo de la anulación');
  conLock_(function () {
    const t = turnoAbierto_();
    if (!t || t.id !== v.turno_id) throw err_('Solo se pueden anular ventas del turno abierto');
    const actual = hoja_('ventas').getRange(v._fila, 10).getValue();
    if (actual !== 'activa') throw err_('Esa venta ya está anulada');
    hoja_('ventas').getRange(v._fila, 10, 1, 2).setValues([['anulada', motivo]]);
  });
  auditar_(ctx.usuario.nombre, 'venta.anulada', 'ventas', v.id, v.cantidad + 'x ' + v.producto + ' · ' + motivo);
  return { anulada: true };
}

/* ---------- caja ---------- */

function cajaRegistrar_(d, ctx) {
  const tipo = String(d.tipo);
  if (tipo !== 'gasto' && tipo !== 'ingreso') throw err_('Tipo no válido');
  const concepto = limpiar_(d.concepto);
  if (concepto.length < 3) throw err_('Escribe el concepto');
  const monto = redondear_(num_(d.monto));
  if (monto <= 0 || monto > 100000) throw err_('El monto no es válido');
  const id = conLock_(function () {
    const t = turnoAbierto_();
    if (!t) throw err_('No hay turno abierto');
    const nuevo = Utilities.getUuid();
    hoja_('caja_movimientos').appendRow([nuevo, t.id, tipo, concepto, monto, ahoraTxt_().hora, ctx.usuario.nombre, 'activo']);
    return nuevo;
  });
  auditar_(ctx.usuario.nombre, 'caja.' + tipo, 'caja_movimientos', id, concepto + ' · ' + monto);
  return { id: id };
}

function cajaAnular_(d, ctx) {
  const m = filasRecientes_('caja_movimientos', 1500).filter(function (x) { return x.id === d.id; })[0];
  if (!m) throw err_('Movimiento no encontrado');
  conLock_(function () {
    const t = turnoAbierto_();
    if (!t || t.id !== m.turno_id) throw err_('Solo se pueden anular movimientos del turno abierto');
    hoja_('caja_movimientos').getRange(m._fila, 8).setValue('anulado');
  });
  auditar_(ctx.usuario.nombre, 'caja.anulado', 'caja_movimientos', m.id, m.tipo + ' · ' + m.concepto + ' · ' + m.monto);
  return { anulado: true };
}

function cajaResumen_(d, ctx) {
  const t = turnoAbierto_();
  if (!t) {
    const c = filasRecientes_('caja_cierres', 5).pop();
    return { turno: false, ultimoCierre: c ? {
      esperado: num_(c.esperado), contado: num_(c.contado), diferencia: num_(c.diferencia), hora: String(c.hora).slice(0, 5)
    } : null };
  }
  const r = resumenCaja_(t);
  const salida = {
    turno: true, fondo: r.fondo, ventas: r.ventas, ingresos: r.ingresos, gastos: r.gastos,
    movimientos: r.movimientos.reverse().map(function (m) {
      return { id: m.id, hora: String(m.hora).slice(0, 5), tipo: m.tipo, concepto: m.concepto, monto: num_(m.monto) };
    })
  };
  // Conteo ciego: solo los socios ven el efectivo esperado antes del cierre
  if (ctx.rol === 'socio') salida.esperado = r.esperado;
  return salida;
}

/* ---------- inicio ---------- */

function resumenInicio_(d, ctx) {
  if (ctx.rol === 'cocina') return { tarjetas: [] };
  const hoy = ahoraTxt_().fecha;
  const ids = {};
  filas_('turnos').forEach(function (t) { if (txt_(t.fecha, 'yyyy-MM-dd') === hoy) ids[t.id] = true; });
  const ventas = filasRecientes_('ventas', 3000).filter(function (v) { return ids[v.turno_id] && v.estado === 'activa'; });
  const movs = filasRecientes_('caja_movimientos', 1500).filter(function (m) { return ids[m.turno_id] && m.estado === 'activo'; });
  const totalVentas = suma_(ventas, 'total');
  const platillos = suma_(ventas, 'cantidad');
  const gastosDia = suma_(movs.filter(function (m) { return m.tipo === 'gasto'; }), 'monto');
  if (ctx.rol === 'socio') {
    return { tarjetas: [
      { titulo: 'Ventas del día', valor: totalVentas, formato: 'moneda' },
      { titulo: 'Platillos vendidos', valor: platillos, formato: 'numero' },
      { titulo: 'Gastos del día', valor: gastosDia, formato: 'moneda' },
      { titulo: 'Utilidad estimada', valor: redondear_(totalVentas - gastosDia), formato: 'moneda' }
    ] };
  }
  const t = turnoAbierto_();
  return { tarjetas: [
    { titulo: 'Ventas del día', valor: totalVentas, formato: 'moneda' },
    { titulo: 'Platillos servidos', valor: platillos, formato: 'numero' },
    { titulo: 'Gastos del turno', valor: t ? resumenCaja_(t).gastos : null, formato: 'moneda' },
    { titulo: 'Pedidos pendientes', valor: 0, formato: 'numero' }
  ] };
}

/* ---------- registro en el router ---------- */

Object.assign(ACCIONES, {
  'menu.listar':     { fn: menuListar_ },
  'resumen.inicio':  { fn: resumenInicio_ },
  'turnos.estado':   { fn: turnosEstado_ },
  'turnos.abrir':    { permiso: 'turnos.operar',    fn: turnosAbrir_ },
  'turnos.cerrar':   { permiso: 'caja.cerrar',      fn: turnosCerrar_ },
  'ventas.registrar':{ permiso: 'ventas.registrar', fn: ventasRegistrar_ },
  'ventas.lista':    { permiso: 'ventas.ver',       fn: ventasLista_ },
  'ventas.anular':   { permiso: 'ventas.anular',    fn: ventasAnular_ },
  'caja.registrar':  { permiso: 'caja.operar',      fn: cajaRegistrar_ },
  'caja.anular':     { permiso: 'caja.operar',      fn: cajaAnular_ },
  'caja.resumen':    { permiso: 'caja.operar',      fn: cajaResumen_ }
});

/* ---------- preparación (ejecutar UNA vez) ---------- */

function prepararFase2() {
  configurarHojas();
  const ss = abrirHoja_();
  [['turnos', 'B:B'], ['turnos', 'D:E'], ['ventas', 'H:H'], ['caja_movimientos', 'F:F'], ['caja_cierres', 'H:H']]
    .forEach(function (x) { ss.getSheetByName(x[0]).getRange(x[1]).setNumberFormat('@'); });

  const m = ss.getSheetByName('productos_menu');
  if (m.getLastRow() < 2) {
    m.getRange(2, 1, 5, 5).setValues([
      [Utilities.getUuid(), 'Comida completa', 45, true, 1],
      [Utilities.getUuid(), 'Verdura y ensalada', 20, true, 2],
      [Utilities.getUuid(), 'Sopa', 15, true, 3],
      [Utilities.getUuid(), 'Bebida', 10, true, 4],
      [Utilities.getUuid(), 'Postre', 12, true, 5]
    ]);
  }

  const rp = ss.getSheetByName('roles_permisos');
  const existentes = rp.getLastRow() > 1
    ? rp.getRange(2, 1, rp.getLastRow() - 1, 2).getValues().map(function (r) { return r[0] + '|' + r[1]; })
    : [];
  [['encargada', 'ventas.anular']].forEach(function (p) {
    if (existentes.indexOf(p[0] + '|' + p[1]) === -1) rp.appendRow(p);
  });
  SpreadsheetApp.flush();
  Logger.log('Fase 2 lista: hojas creadas, menú de ejemplo cargado y permisos agregados.');
}
