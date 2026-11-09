/* Fase 4: inventario, recetas y pedidos internos. Archivo aparte (requiere Fase2 y Fase3). */

Object.assign(HOJAS, {
  insumos: ['id','nombre','unidad','costo_actual','minimo','activo','orden'],
  inv_movimientos: ['id','fecha','hora','insumo_id','insumo','tipo','delta','costo_unit','usuario','estado','nota','origen_id'],
  recetas: ['id','producto_id','producto','rendimiento'],
  receta_ingredientes: ['id','receta_id','insumo_id','insumo','cantidad'],
  pedidos: ['id','fecha','hora','solicitante','estado','nota','resuelto_por','hora_resolucion','motivo'],
  pedidos_detalle: ['id','pedido_id','insumo_id','insumo','unidad','cantidad_solicitada','cantidad_aprobada']
});

/* ---------- inventario ---------- */

function redondear3_(n) { return Math.round(n * 1000) / 1000; }

function insumosActivos_() {
  return filas_('insumos').filter(function (i) { return esVerdadero_(i.activo); })
    .sort(function (a, b) { return num_(a.orden) - num_(b.orden); });
}

function existencias_() {
  const ex = {};
  filas_('inv_movimientos').forEach(function (m) {
    if (m.estado === 'activo') ex[m.insumo_id] = redondear3_((ex[m.insumo_id] || 0) + num_(m.delta));
  });
  return ex;
}

function nuevoMov_(i, tipo, delta, usuario, nota, origen) {
  const a = ahoraTxt_();
  return [Utilities.getUuid(), a.fecha, a.hora, i.id, i.nombre, tipo, redondear3_(delta),
    num_(i.costo_actual), usuario, 'activo', limpiar_(nota), origen || ''];
}
function agregarMovs_(rows) {
  if (!rows.length) return;
  const h = hoja_('inv_movimientos');
  h.getRange(h.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}
function guardarMovs_(rows) { conLock_(function () { agregarMovs_(rows); }); }

function inventarioLista_(d, ctx) {
  const ex = existencias_();
  const veCosto = ctx.rol === 'socio';
  const lista = insumosActivos_().map(function (i) {
    const e = ex[i.id] || 0, min = num_(i.minimo);
    const o = { id: i.id, nombre: i.nombre, unidad: i.unidad, existencia: e, minimo: min, bajo: min > 0 ? e <= min : e < 0 };
    if (veCosto) { o.costo = num_(i.costo_actual); o.valor = redondear_(e * o.costo); }
    return o;
  });
  lista.sort(function (a, b) { return (b.bajo ? 1 : 0) - (a.bajo ? 1 : 0) || a.nombre.localeCompare(b.nombre); });
  const salida = { insumos: lista, bajos: lista.filter(function (x) { return x.bajo; }).length };
  if (veCosto) salida.valorTotal = redondear_(lista.reduce(function (a, x) { return a + x.valor; }, 0));
  return salida;
}

function inventarioMovimiento_(d, ctx) {
  const tipo = String(d.tipo);
  const i = insumosActivos_().filter(function (x) { return x.id === d.insumo_id; })[0];
  if (!i) throw err_('Insumo no válido');
  const nota = limpiar_(d.nota);
  let delta;
  if (tipo === 'entrada' || tipo === 'salida') {
    const c = redondear3_(num_(d.cantidad));
    if (c <= 0 || c > 100000) throw err_('La cantidad no es válida');
    if (tipo === 'salida' && nota.length < 3) throw err_('Escribe el motivo de la salida');
    delta = tipo === 'entrada' ? c : -c;
    guardarMovs_([nuevoMov_(i, tipo, delta, ctx.usuario.nombre, nota, '')]);
  } else if (tipo === 'ajuste') {
    if (d.existencia_real === undefined || d.existencia_real === null || String(d.existencia_real).trim() === '') {
      throw err_('Escribe la existencia contada');
    }
    const real = redondear3_(num_(d.existencia_real));
    if (real < 0 || real > 1000000) throw err_('La existencia no es válida');
    if (nota.length < 3) throw err_('Escribe el motivo del ajuste');
    delta = conLock_(function () {
      const actual = existencias_()[i.id] || 0;
      const dif = redondear3_(real - actual);
      if (dif === 0) throw err_('La existencia ya coincide, no hay nada que ajustar');
      agregarMovs_([nuevoMov_(i, 'ajuste', dif, ctx.usuario.nombre, nota, '')]);
      return dif;
    });
  } else {
    throw err_('Tipo no válido');
  }
  auditar_(ctx.usuario.nombre, 'inventario.' + tipo, 'inv_movimientos', '', i.nombre + ' · ' + delta + ' ' + i.unidad + (nota ? ' · ' + nota : ''));
  return { existencia: existencias_()[i.id] || 0, unidad: i.unidad };
}

/* ---------- recetas ---------- */

function recetasMapa_() {
  const rs = filas_('recetas'), ing = filas_('receta_ingredientes'), m = {};
  rs.forEach(function (r) {
    m[r.producto_id] = { id: r.id, producto: r.producto, rendimiento: num_(r.rendimiento) || 1, ingredientes: [] };
  });
  ing.forEach(function (x) {
    const r = rs.filter(function (q) { return q.id === x.receta_id; })[0];
    if (r) m[r.producto_id].ingredientes.push({ insumo_id: x.insumo_id, insumo: x.insumo, cantidad: num_(x.cantidad) });
  });
  return m;
}

function recetasLista_() {
  const rec = recetasMapa_(), ins = {}, precios = {};
  filas_('insumos').forEach(function (i) { ins[i.id] = i; });
  filas_('productos_menu').forEach(function (p) { precios[p.id] = num_(p.precio); });
  return Object.keys(rec).map(function (pid) {
    const r = rec[pid];
    let costo = 0;
    const ing = r.ingredientes.map(function (x) {
      const i = ins[x.insumo_id], c = i ? num_(i.costo_actual) : 0;
      costo += c * x.cantidad;
      return { insumo: x.insumo, unidad: i ? i.unidad : '', cantidad: x.cantidad, costo: redondear_(c * x.cantidad) };
    });
    const cp = redondear_(costo / r.rendimiento), precio = precios[pid] || 0;
    return { producto: r.producto, rendimiento: r.rendimiento, costoLote: redondear_(costo), costoPorcion: cp,
      precio: precio, margen: redondear_(precio - cp),
      margenPct: precio > 0 ? Math.round((precio - cp) / precio * 1000) / 10 : 0, ingredientes: ing };
  });
}

/* Producción -> inventario: el corte (kg) descuenta insumos según la receta */
function consumirPorCorte_(productoId, kg, origenId, usuario) {
  const prod = filas_('productos_menu').filter(function (p) { return p.id === productoId; })[0];
  const porcionKg = prod ? num_(prod.porcion_kg) : 0;
  if (porcionKg <= 0) return 'sin_porcion';
  const rec = recetasMapa_()[productoId];
  if (!rec || !rec.ingredientes.length) return 'sin_receta';
  const lotes = (kg / porcionKg) / rec.rendimiento;
  const ins = {};
  insumosActivos_().forEach(function (i) { ins[i.id] = i; });
  const rows = [];
  rec.ingredientes.forEach(function (x) {
    if (ins[x.insumo_id]) rows.push(nuevoMov_(ins[x.insumo_id], 'consumo', -(x.cantidad * lotes), usuario, 'Corte: ' + rec.producto, origenId));
  });
  guardarMovs_(rows);
  return 'ok';
}

function anularMovsDeOrigen_(origen) {
  conLock_(function () {
    filas_('inv_movimientos').forEach(function (m) {
      if (m.origen_id === origen && m.estado === 'activo') hoja_('inv_movimientos').getRange(m._fila, 10).setValue('anulado');
    });
  });
}

/* Ventas de productos sin control en kg (ej. bebida): descuentan al vender */
function movimientosVenta_(lineas, usuario, signo, nota) {
  const prods = {}, ins = {}, rec = recetasMapa_(), rows = [];
  filas_('productos_menu').forEach(function (p) { prods[p.id] = p; });
  insumosActivos_().forEach(function (i) { ins[i.id] = i; });
  lineas.forEach(function (l) {
    const p = prods[l.producto_id];
    if (!p || num_(p.porcion_kg) > 0) return;
    const r = rec[p.id];
    if (!r) return;
    const c = Math.floor(num_(l.cantidad));
    r.ingredientes.forEach(function (x) {
      if (ins[x.insumo_id]) rows.push(nuevoMov_(ins[x.insumo_id], signo < 0 ? 'consumo' : 'ajuste',
        signo * (x.cantidad * c / r.rendimiento), usuario, nota + p.nombre, ''));
    });
  });
  guardarMovs_(rows);
}

/* ---------- pedidos internos ---------- */

function pedidosCatalogo_() {
  return insumosActivos_().map(function (i) { return { id: i.id, nombre: i.nombre, unidad: i.unidad }; });
}

function pedidosPendientes_() {
  return filasRecientes_('pedidos', 200).filter(function (p) { return p.estado === 'pendiente'; }).length;
}

function pedidosCrear_(d, ctx) {
  const lineas = Array.isArray(d.lineas) ? d.lineas : [];
  if (!lineas.length || lineas.length > 30) throw err_('Elige al menos un insumo');
  const ins = {};
  insumosActivos_().forEach(function (i) { ins[i.id] = i; });
  const id = Utilities.getUuid(), a = ahoraTxt_(), filas = [];
  lineas.forEach(function (l) {
    const i = ins[l.insumo_id], c = redondear3_(num_(l.cantidad));
    if (!i) throw err_('Insumo no válido');
    if (c <= 0 || c > 10000) throw err_('Cantidad no válida');
    filas.push([Utilities.getUuid(), id, i.id, i.nombre, i.unidad, c, '']);
  });
  conLock_(function () {
    hoja_('pedidos').appendRow([id, a.fecha, a.hora, ctx.usuario.nombre, 'pendiente', limpiar_(d.nota), '', '', '']);
    const h = hoja_('pedidos_detalle');
    h.getRange(h.getLastRow() + 1, 1, filas.length, filas[0].length).setValues(filas);
  });
  auditar_(ctx.usuario.nombre, 'pedido.creado', 'pedidos', id, filas.length + ' insumos');
  return { id: id };
}

function pedidosLista_() {
  const ps = filasRecientes_('pedidos', 60).reverse(), ids = {};
  ps.forEach(function (p) { ids[p.id] = true; });
  const det = filasRecientes_('pedidos_detalle', 1500).filter(function (x) { return ids[x.pedido_id]; });
  const orden = { pendiente: 0, aprobado: 1 };
  const lista = ps.map(function (p) {
    return {
      id: p.id, fecha: txt_(p.fecha, 'yyyy-MM-dd'), hora: String(p.hora).slice(0, 5), solicitante: p.solicitante,
      estado: p.estado, nota: p.nota, motivo: p.motivo, resuelto_por: p.resuelto_por,
      lineas: det.filter(function (x) { return x.pedido_id === p.id; }).map(function (x) {
        return { id: x.id, insumo: x.insumo, unidad: x.unidad, solicitada: num_(x.cantidad_solicitada),
          aprobada: x.cantidad_aprobada === '' ? null : num_(x.cantidad_aprobada) };
      })
    };
  });
  lista.sort(function (a, b) {
    return (orden[a.estado] === undefined ? 2 : orden[a.estado]) - (orden[b.estado] === undefined ? 2 : orden[b.estado]);
  });
  return {
    pedidos: lista.slice(0, 40),
    pendientes: lista.filter(function (p) { return p.estado === 'pendiente'; }).length,
    porRecibir: lista.filter(function (p) { return p.estado === 'aprobado'; }).length
  };
}

function pedidoPorId_(id) {
  const p = filasRecientes_('pedidos', 200).filter(function (x) { return x.id === id; })[0];
  if (!p) throw err_('Pedido no encontrado');
  return p;
}

function pedidosResolver_(d, ctx) {
  const p = pedidoPorId_(d.id);
  const decision = String(d.decision);
  if (decision !== 'aprobar' && decision !== 'rechazar') throw err_('Decisión no válida');
  const motivo = limpiar_(d.motivo);
  if (decision === 'rechazar' && motivo.length < 3) throw err_('Escribe el motivo del rechazo');
  const mods = {};
  (Array.isArray(d.lineas) ? d.lineas : []).forEach(function (l) { mods[l.detalle_id] = redondear3_(num_(l.cantidad)); });
  const a = ahoraTxt_();
  conLock_(function () {
    if (hoja_('pedidos').getRange(p._fila, 5).getValue() !== 'pendiente') throw err_('Ese pedido ya fue resuelto');
    const det = filasRecientes_('pedidos_detalle', 1500).filter(function (x) { return x.pedido_id === p.id; });
    const cant = det.map(function (x) {
      return decision === 'aprobar' ? (mods[x.id] !== undefined ? mods[x.id] : num_(x.cantidad_solicitada)) : 0;
    });
    if (cant.some(function (c) { return c < 0 || c > 10000; })) throw err_('Cantidad no válida');
    if (decision === 'aprobar' && cant.every(function (c) { return c === 0; })) {
      throw err_('Aprueba al menos un insumo o rechaza el pedido');
    }
    det.forEach(function (x, k) { hoja_('pedidos_detalle').getRange(x._fila, 7).setValue(cant[k]); });
    const hp = hoja_('pedidos');
    hp.getRange(p._fila, 5).setValue(decision === 'aprobar' ? 'aprobado' : 'rechazado');
    hp.getRange(p._fila, 7, 1, 3).setValues([[ctx.usuario.nombre, a.hora, motivo]]);
  });
  auditar_(ctx.usuario.nombre, 'pedido.' + (decision === 'aprobar' ? 'aprobado' : 'rechazado'), 'pedidos', p.id, p.solicitante + (motivo ? ' · ' + motivo : ''));
  return { estado: decision === 'aprobar' ? 'aprobado' : 'rechazado' };
}

function pedidosRecibir_(d, ctx) {
  const p = pedidoPorId_(d.id);
  const n = conLock_(function () {
    if (hoja_('pedidos').getRange(p._fila, 5).getValue() !== 'aprobado') throw err_('Solo se reciben pedidos aprobados');
    const ins = {}, rows = [];
    insumosActivos_().forEach(function (i) { ins[i.id] = i; });
    filasRecientes_('pedidos_detalle', 1500).filter(function (x) { return x.pedido_id === p.id; }).forEach(function (x) {
      const c = num_(x.cantidad_aprobada);
      if (c > 0 && ins[x.insumo_id]) rows.push(nuevoMov_(ins[x.insumo_id], 'entrada', c, ctx.usuario.nombre, 'Pedido recibido', p.id));
    });
    agregarMovs_(rows);
    hoja_('pedidos').getRange(p._fila, 5).setValue('recibido');
    return rows.length;
  });
  auditar_(ctx.usuario.nombre, 'pedido.recibido', 'pedidos', p.id, n + ' entradas al inventario');
  return { entradas: n };
}

/* ---------- enlaces con fases anteriores y registro en el router ---------- */

(function () {
  const regBase = ACCIONES['produccion.registrar'].fn;
  ACCIONES['produccion.registrar'].fn = function (d, ctx) {
    const r = regBase(d, ctx);
    if (String(d.tipo) === 'corte') {
      try { r.inventario = consumirPorCorte_(d.producto_id, r.kg, r.id, ctx.usuario.nombre); }
      catch (e) { console.error(e); r.inventario = 'error'; }
    }
    return r;
  };
  const anBase = ACCIONES['produccion.anular'].fn;
  ACCIONES['produccion.anular'].fn = function (d, ctx) {
    const reg = filasRecientes_('produccion', 3000).filter(function (x) { return x.id === d.id; })[0];
    const r = anBase(d, ctx);
    if (reg && reg.tipo === 'corte') anularMovsDeOrigen_(reg.id);
    return r;
  };
  const vBase = ACCIONES['ventas.registrar'].fn;
  ACCIONES['ventas.registrar'].fn = function (d, ctx) {
    const r = vBase(d, ctx);
    try { movimientosVenta_(d.lineas, ctx.usuario.nombre, -1, 'Venta: '); } catch (e) { console.error(e); }
    return r;
  };
  const vaBase = ACCIONES['ventas.anular'].fn;
  ACCIONES['ventas.anular'].fn = function (d, ctx) {
    const v = filasRecientes_('ventas', 3000).filter(function (x) { return x.id === d.id; })[0];
    const r = vaBase(d, ctx);
    if (v) {
      try { movimientosVenta_([{ producto_id: v.producto_id, cantidad: v.cantidad }], ctx.usuario.nombre, 1, 'Venta anulada: '); }
      catch (e) { console.error(e); }
    }
    return r;
  };
  const rBase = ACCIONES['resumen.inicio'].fn;
  ACCIONES['resumen.inicio'].fn = function (d, ctx) {
    const r = rBase(d, ctx), n = pedidosPendientes_();
    (r.tarjetas || []).forEach(function (t) { if (t.titulo === 'Pedidos pendientes') t.valor = n; });
    return r;
  };
})();

Object.assign(ACCIONES, {
  'inventario.lista':      { permiso: 'inventario.ver',      fn: inventarioLista_ },
  'inventario.movimiento': { permiso: 'inventario.ajustar',  fn: inventarioMovimiento_ },
  'recetas.lista':         { permiso: 'recetas.ver',         fn: recetasLista_ },
  'pedidos.catalogo':      { permiso: 'pedidos.solicitar',   fn: pedidosCatalogo_ },
  'pedidos.crear':         { permiso: 'pedidos.solicitar',   fn: pedidosCrear_ },
  'pedidos.lista':         { permiso: 'pedidos.ver',         fn: pedidosLista_ },
  'pedidos.resolver':      { permiso: 'pedidos.aprobar',     fn: pedidosResolver_ },
  'pedidos.recibir':       { permiso: 'pedidos.aprobar',     fn: pedidosRecibir_ }
});

/* ---------- preparación (ejecutar UNA vez) ---------- */

function prepararFase4() {
  configurarHojas();
  const ss = abrirHoja_();
  [['inv_movimientos', 'B:C'], ['pedidos', 'B:C'], ['pedidos', 'H:H']]
    .forEach(function (x) { ss.getSheetByName(x[0]).getRange(x[1]).setNumberFormat('@'); });

  const hi = ss.getSheetByName('insumos');
  if (hi.getLastRow() < 2) {
    // nombre, unidad, costo por unidad, mínimo, existencia inicial (ejemplos: cámbialos en la hoja)
    const ej = [['Pollo', 'kg', 95, 5, 20], ['Arroz', 'kg', 28, 5, 25], ['Frijol', 'kg', 32, 3, 10],
      ['Aceite', 'l', 45, 2, 8], ['Tortilla', 'kg', 24, 3, 10], ['Verdura', 'kg', 30, 4, 15],
      ['Gas LP', 'kg', 20, 10, 30], ['Refresco', 'pieza', 7, 24, 48]];
    hi.getRange(2, 1, ej.length, 7).setValues(ej.map(function (x, k) {
      return [Utilities.getUuid(), x[0], x[1], x[2], x[3], true, k + 1];
    }));
    SpreadsheetApp.flush();
    const nuevos = insumosActivos_();
    agregarMovs_(nuevos.map(function (i, k) { return nuevoMov_(i, 'entrada', ej[k][4], '(inicio)', 'Inventario inicial', ''); }));
  }

  const hr = ss.getSheetByName('recetas');
  if (hr.getLastRow() < 2) {
    const ins = {};
    insumosActivos_().forEach(function (i) { ins[String(i.nombre).toLowerCase()] = i; });
    const prods = {};
    filas_('productos_menu').forEach(function (p) { prods[String(p.nombre).toLowerCase()] = p; });
    // producto, rendimiento (porciones por lote), ingredientes [insumo, cantidad por lote]
    const rec = [
      ['Comida completa', 10, [['pollo', 2.5], ['arroz', 1.5], ['frijol', 1], ['aceite', 0.3], ['tortilla', 0.8]]],
      ['Verdura y ensalada', 10, [['verdura', 2], ['aceite', 0.1]]],
      ['Sopa', 10, [['verdura', 1.5], ['arroz', 0.3]]],
      ['Bebida', 1, [['refresco', 1]]]
    ];
    const filasR = [], filasI = [];
    rec.forEach(function (r) {
      const p = prods[r[0].toLowerCase()];
      if (!p) return;
      const rid = Utilities.getUuid();
      filasR.push([rid, p.id, p.nombre, r[1]]);
      r[2].forEach(function (x) {
        const i = ins[x[0]];
        if (i) filasI.push([Utilities.getUuid(), rid, i.id, i.nombre, x[1]]);
      });
    });
    if (filasR.length) hr.getRange(2, 1, filasR.length, 4).setValues(filasR);
    if (filasI.length) ss.getSheetByName('receta_ingredientes').getRange(2, 1, filasI.length, 5).setValues(filasI);
  }
  SpreadsheetApp.flush();
  Logger.log('Fase 4 lista: insumos, existencias iniciales, recetas de ejemplo y hojas de pedidos.');
}
