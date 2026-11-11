/* Fase 5: checklists digitales, alertas y administración de insumos. Archivo aparte (requiere Fase2, Fase3 y Fase4). */

Object.assign(HOJAS, {
  checklist_plantillas: ['id','nombre','tipo','rol_ejecuta','obligatoria_cierre','activo','orden'],
  checklist_items: ['id','plantilla_id','orden','texto','tipo_item','min','max','obligatorio'],
  checklist_ejecuciones: ['id','plantilla_id','plantilla','turno_id','fecha','hora','usuario','con_observaciones','revisado_por','hora_revision','nota'],
  checklist_respuestas: ['id','ejecucion_id','item_id','texto_item','valor','fuera_rango'],
  alertas: ['id','fecha','hora','tipo','severidad','mensaje','estado','clave','para']
});

/* ---------- alertas ---------- */

function enviarCorreo_(asunto, mensaje) {
  const para = String(configValor_('correos_alertas', '')).trim();
  if (!para) return;
  try { MailApp.sendEmail(para, '[Comedor Ingenio] ' + asunto, mensaje); } catch (e) { console.error(e); }
}

function crearAlerta_(tipo, severidad, mensaje, clave, para) {
  const creada = conLock_(function () {
    if (filasRecientes_('alertas', 400).some(function (a) { return a.clave === clave; })) return false;
    const a = ahoraTxt_();
    hoja_('alertas').appendRow([Utilities.getUuid(), a.fecha, a.hora, tipo, severidad, limpiar_(mensaje), 'nueva', clave, para]);
    return true;
  });
  if (creada && severidad === 'alta') enviarCorreo_(mensaje, mensaje);
  return creada;
}

function evaluarAlertas_() {
  const hoy = ahoraTxt_().fecha;
  const ex = existencias_();
  insumosActivos_().forEach(function (i) {
    const e = ex[i.id] || 0, min = num_(i.minimo);
    if (min > 0 ? e <= min : e < 0) {
      crearAlerta_('inventario_bajo', 'media', 'Insumo bajo el mínimo: ' + i.nombre + ' (hay ' + e + ' ' + i.unidad + ', mínimo ' + min + ')',
        'bajo:' + i.id + ':' + hoy, 'socio,encargada');
    }
  });
  const t = turnoAbierto_();
  if (!t) return;
  if (txt_(t.fecha, 'yyyy-MM-dd') < hoy) {
    crearAlerta_('turno_abierto', 'alta', 'El turno del ' + txt_(t.fecha, 'yyyy-MM-dd') + ' sigue abierto', 'turno:' + t.id, 'socio,encargada');
  }
  const pr = produccionResumen_({}, { rol: 'encargada' });
  if (pr.turno && pr.estado === 'alerta') {
    crearAlerta_('produccion_diferencia', 'alta', 'Diferencia de producción de ' + pr.diferencia + ' kg (tolerancia ±' + pr.tolerancia + ' kg)',
      'prod:' + t.id, 'socio,encargada');
  }
}

function evaluarAlertasPeriodico() { evaluarAlertas_(); }

// Ejecutar una vez para que el sistema revise alertas solo, cada 15 minutos
function activarAlertasAutomaticas() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'evaluarAlertasPeriodico') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('evaluarAlertasPeriodico').timeBased().everyMinutes(15).create();
  Logger.log('Revisión automática de alertas activada (cada 15 minutos).');
}

function visibleParaRol_(a, rol) { return rol === 'socio' || String(a.para).split(',').indexOf(rol) !== -1; }

function alertasLista_(d, ctx) {
  const cache = CacheService.getScriptCache();
  if (!cache.get('eval_alertas')) { evaluarAlertas_(); cache.put('eval_alertas', '1', 60); }
  const todas = filasRecientes_('alertas', 200).filter(function (a) { return visibleParaRol_(a, ctx.rol); }).reverse();
  return {
    nuevas: todas.filter(function (a) { return a.estado === 'nueva'; }).length,
    alertas: todas.slice(0, 40).map(function (a) {
      return { id: a.id, fecha: txt_(a.fecha, 'yyyy-MM-dd'), hora: String(a.hora).slice(0, 5), tipo: a.tipo,
        severidad: a.severidad, mensaje: a.mensaje, estado: a.estado };
    })
  };
}

function alertasMarcar_(d, ctx) {
  const estado = d.estado === 'resuelta' ? 'resuelta' : 'vista';
  conLock_(function () {
    filasRecientes_('alertas', 200).forEach(function (a) {
      if (!visibleParaRol_(a, ctx.rol)) return;
      const coincide = d.todas === true ? a.estado === 'nueva' : a.id === d.id;
      if (coincide && a.estado !== 'resuelta') hoja_('alertas').getRange(a._fila, 7).setValue(estado);
    });
  });
  if (estado === 'resuelta') auditar_(ctx.usuario.nombre, 'alerta.resuelta', 'alertas', d.id || '', '');
  return { ok: true };
}

/* ---------- checklists ---------- */

function plantillasActivas_() {
  return filas_('checklist_plantillas').filter(function (p) { return esVerdadero_(p.activo); })
    .sort(function (a, b) { return num_(a.orden) - num_(b.orden); });
}
function itemsDe_(plantillaId, todos) {
  return todos.filter(function (i) { return i.plantilla_id === plantillaId; })
    .sort(function (a, b) { return num_(a.orden) - num_(b.orden); });
}
function limite_(v) { return v === '' || v === null || v === undefined ? null : num_(v); }

function ejecucionesDelTurno_() {
  const t = turnoAbierto_();
  const hoy = ahoraTxt_().fecha;
  return filasRecientes_('checklist_ejecuciones', 300).filter(function (e) {
    const f = txt_(e.fecha, 'yyyy-MM-dd');
    return t ? (e.turno_id === t.id || (e.turno_id === '' && f === txt_(t.fecha, 'yyyy-MM-dd'))) : f === hoy;
  });
}

function checklistsPlantillas_(d, ctx) {
  const items = filas_('checklist_items');
  const hechas = {};
  ejecucionesDelTurno_().forEach(function (e) { hechas[e.plantilla_id] = true; });
  return plantillasActivas_()
    .filter(function (p) { return ctx.rol !== 'cocina' || p.rol_ejecuta === 'cocina'; })
    .map(function (p) {
      return {
        id: p.id, nombre: p.nombre, tipo: p.tipo, obligatoria_cierre: esVerdadero_(p.obligatoria_cierre), hecha: !!hechas[p.id],
        items: itemsDe_(p.id, items).map(function (i) {
          return { id: i.id, texto: i.texto, tipo_item: i.tipo_item, min: limite_(i.min), max: limite_(i.max),
            obligatorio: esVerdadero_(i.obligatorio) };
        })
      };
    });
}

function checklistsEjecutar_(d, ctx) {
  const p = plantillasActivas_().filter(function (x) { return x.id === d.plantilla_id; })[0];
  if (!p) throw err_('Checklist no válido');
  if (ctx.rol === 'cocina' && p.rol_ejecuta !== 'cocina') throw err_('Este checklist no es de cocina', 'permiso');
  const resp = {};
  (Array.isArray(d.respuestas) ? d.respuestas : []).forEach(function (r) { resp[r.item_id] = r.valor; });
  const id = Utilities.getUuid(), filas = [], problemas = [];
  itemsDe_(p.id, filas_('checklist_items')).forEach(function (it) {
    let v = resp[it.id];
    if (v === undefined || v === null || String(v).trim() === '') {
      if (esVerdadero_(it.obligatorio)) throw err_('Falta responder: ' + it.texto);
      return;
    }
    let fuera = false;
    if (it.tipo_item === 'si_no') {
      v = String(v).toLowerCase();
      if (v !== 'si' && v !== 'no') throw err_('Respuesta no válida en: ' + it.texto);
      if (v === 'no') { fuera = true; problemas.push(it.texto + ' = No'); }
    } else if (it.tipo_item === 'numero') {
      const n = Number(String(v).replace(',', '.'));
      if (isNaN(n)) throw err_('Escribe un número en: ' + it.texto);
      v = n;
      const mn = limite_(it.min), mx = limite_(it.max);
      if ((mn !== null && n < mn) || (mx !== null && n > mx)) {
        fuera = true;
        problemas.push(it.texto + ' = ' + n + ' (permitido ' + (mn !== null ? mn : '…') + ' a ' + (mx !== null ? mx : '…') + ')');
      }
    } else {
      v = limpiar_(v);
    }
    filas.push([Utilities.getUuid(), id, it.id, it.texto, v, fuera]);
  });
  const obs = limpiar_(d.observaciones);
  if (obs) filas.push([Utilities.getUuid(), id, '', 'Observaciones', obs, false]);
  conLock_(function () {
    const t = turnoAbierto_(), a = ahoraTxt_();
    hoja_('checklist_ejecuciones').appendRow([id, p.id, p.nombre, t ? t.id : '', a.fecha, a.hora,
      ctx.usuario.nombre, problemas.length > 0, '', '', '']);
    if (filas.length) {
      const h = hoja_('checklist_respuestas');
      h.getRange(h.getLastRow() + 1, 1, filas.length, filas[0].length).setValues(filas);
    }
  });
  auditar_(ctx.usuario.nombre, 'checklist.ejecutado', 'checklist_ejecuciones', id, p.nombre + (problemas.length ? ' · ' + problemas.length + ' observaciones' : ''));
  if (problemas.length) {
    crearAlerta_('checklist', 'media', p.nombre + ' (' + ctx.usuario.nombre + '): ' + problemas.join('; '), 'chk:' + id, 'socio,encargada');
  }
  return { id: id, observaciones: problemas.length };
}

function checklistsHistorial_() {
  return filasRecientes_('checklist_ejecuciones', 60).reverse().slice(0, 30).map(function (e) {
    return { id: e.id, plantilla: e.plantilla, usuario: e.usuario, fecha: txt_(e.fecha, 'yyyy-MM-dd'),
      hora: String(e.hora).slice(0, 5), observaciones: esVerdadero_(e.con_observaciones),
      revisado: e.revisado_por !== '', revisado_por: e.revisado_por };
  });
}

function checklistsDetalle_(d) {
  const e = filasRecientes_('checklist_ejecuciones', 300).filter(function (x) { return x.id === d.id; })[0];
  if (!e) throw err_('Registro no encontrado');
  return {
    id: e.id, plantilla: e.plantilla, usuario: e.usuario, fecha: txt_(e.fecha, 'yyyy-MM-dd'), hora: String(e.hora).slice(0, 5),
    revisado: e.revisado_por !== '', revisado_por: e.revisado_por, nota: e.nota,
    respuestas: filasRecientes_('checklist_respuestas', 3000).filter(function (r) { return r.ejecucion_id === e.id; })
      .map(function (r) { return { texto: r.texto_item, valor: String(r.valor), fuera: esVerdadero_(r.fuera_rango) }; })
  };
}

function checklistsRevisar_(d, ctx) {
  const e = filasRecientes_('checklist_ejecuciones', 300).filter(function (x) { return x.id === d.id; })[0];
  if (!e) throw err_('Registro no encontrado');
  conLock_(function () {
    if (hoja_('checklist_ejecuciones').getRange(e._fila, 9).getValue() !== '') throw err_('Ya fue revisado');
    hoja_('checklist_ejecuciones').getRange(e._fila, 9, 1, 3).setValues([[ctx.usuario.nombre, ahoraTxt_().hora, limpiar_(d.nota)]]);
  });
  auditar_(ctx.usuario.nombre, 'checklist.revisado', 'checklist_ejecuciones', e.id, e.plantilla);
  return { revisado: true };
}

function checklistsFaltantes_() {
  const t = turnoAbierto_();
  if (!t) return [];
  const hechas = {};
  ejecucionesDelTurno_().forEach(function (e) { hechas[e.plantilla_id] = true; });
  return plantillasActivas_().filter(function (p) { return esVerdadero_(p.obligatoria_cierre) && !hechas[p.id]; })
    .map(function (p) { return p.nombre; });
}

/* ---------- administración de insumos (solo el administrador) ---------- */

function insumosCrear_(d, ctx) {
  const nombre = limpiar_(d.nombre);
  if (nombre.length < 2 || nombre.length > 40) throw err_('Escribe el nombre del insumo (2 a 40 letras)');
  const unidad = String(d.unidad);
  if (['kg', 'g', 'l', 'ml', 'pieza', 'paquete', 'caja', 'bolsa'].indexOf(unidad) === -1) throw err_('Unidad no válida');
  const costo = redondear_(num_(d.costo)), minimo = redondear3_(num_(d.minimo)), existencia = redondear3_(num_(d.existencia));
  if (costo < 0 || costo > 100000) throw err_('El costo no es válido');
  if (minimo < 0 || minimo > 1000000) throw err_('El mínimo no es válido');
  if (existencia < 0 || existencia > 1000000) throw err_('La existencia inicial no es válida');
  const todos = filas_('insumos');
  if (todos.some(function (i) { return String(i.nombre).toLowerCase() === nombre.toLowerCase(); })) {
    throw err_('Ya existe un insumo con ese nombre');
  }
  const id = Utilities.getUuid();
  const orden = todos.reduce(function (a, i) { return Math.max(a, num_(i.orden)); }, 0) + 1;
  conLock_(function () {
    hoja_('insumos').appendRow([id, nombre, unidad, costo, minimo, true, orden]);
    if (existencia > 0) {
      agregarMovs_([nuevoMov_({ id: id, nombre: nombre, costo_actual: costo }, 'entrada', existencia, ctx.usuario.nombre, 'Inventario inicial', '')]);
    }
  });
  CacheService.getScriptCache().remove('eval_alertas');
  auditar_(ctx.usuario.nombre, 'insumo.creado', 'insumos', id, nombre + ' (' + unidad + ') mínimo ' + minimo);
  return { id: id, nombre: nombre };
}

function insumosMinimo_(d, ctx) {
  const i = insumosActivos_().filter(function (x) { return x.id === d.id; })[0];
  if (!i) throw err_('Insumo no válido');
  const minimo = redondear3_(num_(d.minimo));
  if (String(d.minimo).trim() === '' || minimo < 0 || minimo > 1000000) throw err_('El mínimo no es válido');
  const antes = num_(i.minimo);
  conLock_(function () { hoja_('insumos').getRange(i._fila, 5).setValue(minimo); });
  CacheService.getScriptCache().remove('eval_alertas');
  auditar_(ctx.usuario.nombre, 'insumo.minimo', 'insumos', i.id, i.nombre + ': ' + antes + ' → ' + minimo + ' ' + i.unidad);
  return { minimo: minimo };
}

/* ---------- enlaces y registro en el router ---------- */

(function () {
  const cerrarBase = ACCIONES['turnos.cerrar'].fn;
  ACCIONES['turnos.cerrar'].fn = function (d, ctx) {
    if (esVerdadero_(configValor_('bloquear_cierre_por_checklists', true))) {
      const faltan = checklistsFaltantes_();
      if (faltan.length) throw err_('Antes de cerrar completa: ' + faltan.join(', '));
    }
    const r = cerrarBase(d, ctx);
    const tol = num_(configValor_('tolerancia_caja', 10));
    if (Math.abs(r.diferencia) > tol) {
      crearAlerta_('caja_diferencia', 'alta', 'Diferencia de caja al cerrar: ' + r.diferencia + ' pesos (contado ' + r.contado + ', esperado ' + r.esperado + ')',
        'caja:' + Utilities.getUuid(), 'socio,encargada');
    }
    return r;
  };
  const pedBase = ACCIONES['pedidos.crear'].fn;
  ACCIONES['pedidos.crear'].fn = function (d, ctx) {
    const r = pedBase(d, ctx);
    crearAlerta_('pedido', 'baja', ctx.usuario.nombre + ' pidió ' + d.lineas.length + ' insumo(s)', 'pedido:' + r.id, 'encargada');
    return r;
  };
})();

Object.assign(ACCIONES, {
  'alertas.lista':         { permiso: 'alertas.ver',         fn: alertasLista_ },
  'alertas.marcar':        { permiso: 'alertas.ver',         fn: alertasMarcar_ },
  'checklists.plantillas': { permiso: 'checklists.ejecutar', fn: checklistsPlantillas_ },
  'checklists.ejecutar':   { permiso: 'checklists.ejecutar', fn: checklistsEjecutar_ },
  'checklists.historial':  { permiso: 'checklists.revisar',  fn: checklistsHistorial_ },
  'checklists.detalle':    { permiso: 'checklists.revisar',  fn: checklistsDetalle_ },
  'checklists.revisar':    { permiso: 'checklists.revisar',  fn: checklistsRevisar_ },
  'insumos.crear':         { admin: true,                      fn: insumosCrear_ },
  'insumos.minimo':        { admin: true,                      fn: insumosMinimo_ }
});

/* ---------- preparación (ejecutar UNA vez) ---------- */

function prepararFase5() {
  configurarHojas();
  const ss = abrirHoja_();
  [['checklist_ejecuciones', 'E:F'], ['alertas', 'B:C']]
    .forEach(function (x) { ss.getSheetByName(x[0]).getRange(x[1]).setNumberFormat('@'); });

  const hp = ss.getSheetByName('checklist_plantillas');
  if (hp.getLastRow() < 2) {
    // nombre, tipo, quién lo hace, obligatorio para cerrar turno, puntos [texto, tipo, min, max, obligatorio]
    const sn = function (t) { return [t, 'si_no', '', '', true]; };
    const plantillas = [
      ['Apertura', 'apertura', 'encargada', true, [
        sn('Utensilios y equipo limpios'), sn('Gas sin fugas'),
        ['Temperatura del refrigerador (°C)', 'numero', 0, 5, true],
        ['Temperatura del congelador (°C)', 'numero', -25, -15, true],
        sn('Caja con fondo verificado'), sn('Personal con uniforme y cofia')]],
      ['Limpieza de cocina', 'limpieza', 'cocina', true, [
        sn('Pisos barridos y trapeados'), sn('Mesas y tablas sanitizadas'), sn('Estufa y campana limpias'),
        sn('Tarjas y trastes limpios'), sn('Basura retirada')]],
      ['Control operativo', 'control', 'encargada', false, [
        ['Temperatura del alimento caliente (°C)', 'numero', 60, 100, true],
        ['Temperatura del alimento frío (°C)', 'numero', 0, 5, true],
        sn('Área de servicio ordenada y limpia'), ['Comentarios', 'texto', '', '', false]]],
      ['Cierre', 'cierre', 'encargada', true, [
        sn('Cocina limpia y ordenada'), sn('Gas cerrado'), sn('Refrigeración cerrada y funcionando'),
        sn('Basura fuera'), sn('Puertas, ventanas y luces apagadas')]]
    ];
    const filasP = [], filasI = [];
    plantillas.forEach(function (p, k) {
      const pid = Utilities.getUuid();
      filasP.push([pid, p[0], p[1], p[2], p[3], true, k + 1]);
      p[4].forEach(function (x, j) { filasI.push([Utilities.getUuid(), pid, j + 1, x[0], x[1], x[2], x[3], x[4]]); });
    });
    hp.getRange(2, 1, filasP.length, 7).setValues(filasP);
    ss.getSheetByName('checklist_items').getRange(2, 1, filasI.length, 8).setValues(filasI);
  }

  const rp = ss.getSheetByName('roles_permisos');
  const ex = rp.getLastRow() > 1
    ? rp.getRange(2, 1, rp.getLastRow() - 1, 2).getValues().map(function (r) { return r[0] + '|' + r[1]; }) : [];
  [['encargada', 'checklists.ejecutar'], ['encargada', 'alertas.ver']].forEach(function (p) {
    if (ex.indexOf(p[0] + '|' + p[1]) === -1) rp.appendRow(p);
  });

  const cf = ss.getSheetByName('config');
  const claves = cf.getLastRow() > 1 ? cf.getRange(2, 1, cf.getLastRow() - 1, 1).getValues().map(function (r) { return r[0]; }) : [];
  [['bloquear_cierre_por_checklists', true], ['tolerancia_caja', 10], ['correos_alertas', '']].forEach(function (c) {
    if (claves.indexOf(c[0]) === -1) cf.appendRow(c);
  });
  SpreadsheetApp.flush();
  Logger.log('Fase 5 lista: checklists de ejemplo, alertas y configuración.');
}
