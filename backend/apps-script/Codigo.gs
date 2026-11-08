const ID_HOJA = 'PEGA_AQUI_EL_ID'; // ID real solo en Apps Script, nunca en el repositorio
const VERSION = '0.2.0';
const SESION_HORAS = 12;
const MAX_FALLOS = 5;
const BLOQUEO_SEG = 900;

const HOJAS = {
  usuarios: ['id','nombre','rol','pin_hash','activo','creado_en','debe_cambiar_pin','es_admin'],
  roles_permisos: ['rol','accion'],
  sesiones: ['token','usuario_id','dispositivo_id','creado_en','expira_en'],
  dispositivos: ['id','nombre','tipo','token','activo'],
  config: ['clave','valor'],
  auditoria: ['id','fecha','hora','usuario','accion','entidad','entidad_id','detalle']
};

const PERMISOS = [
  ['socio','*'],
  ['encargada','ventas.registrar'],['encargada','ventas.ver'],
  ['encargada','caja.operar'],['encargada','caja.cerrar'],
  ['encargada','produccion.registrar'],['encargada','produccion.ver'],
  ['encargada','inventario.ver'],['encargada','inventario.ajustar'],
  ['encargada','pedidos.aprobar'],['encargada','pedidos.ver'],
  ['encargada','checklists.revisar'],['encargada','turnos.operar'],
  ['cocina','ventas.registrar'],
  ['cocina','produccion.registrar'],['cocina','produccion.ver'],
  ['cocina','inventario.consumo'],
  ['cocina','pedidos.solicitar'],['cocina','pedidos.ver'],
  ['cocina','checklists.ejecutar']
];

/* ============ NÚCLEO ============ */

function abrirHoja_() { return SpreadsheetApp.openById(ID_HOJA); }
function hoja_(n) { return abrirHoja_().getSheetByName(n); }

function filas_(nombreHoja) {
  const h = hoja_(nombreHoja);
  const n = h.getLastRow();
  if (n < 2) return [];
  const cols = HOJAS[nombreHoja];
  return h.getRange(2, 1, n - 1, cols.length).getValues().map(function (f, i) {
    const o = { _fila: i + 2 };
    cols.forEach(function (c, j) { o[c] = f[j]; });
    return o;
  });
}

function sha_(texto) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, texto)
    .map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); })
    .join('');
}

function hashPin_(pin) {
  const p = PropertiesService.getScriptProperties();
  let sal = p.getProperty('SAL');
  if (!sal) { sal = Utilities.getUuid(); p.setProperty('SAL', sal); }
  return sha_(sal + String(pin));
}

function esVerdadero_(v) { return v === true || String(v).toUpperCase() === 'TRUE'; }

function conLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function err_(mensaje, codigo) {
  const e = new Error(mensaje);
  e.negocio = true;
  e.codigo = codigo || '';
  return e;
}

function auditar_(usuario, accion, entidad, entidadId, detalle) {
  const ahora = new Date();
  const tz = Session.getScriptTimeZone();
  conLock_(function () {
    hoja_('auditoria').appendRow([
      Utilities.getUuid(),
      Utilities.formatDate(ahora, tz, 'yyyy-MM-dd'),
      Utilities.formatDate(ahora, tz, 'HH:mm:ss'),
      usuario, accion, entidad, entidadId || '', detalle || ''
    ]);
  });
}

function permisosDe_(rol) {
  if (rol === 'socio') return ['*'];
  return filas_('roles_permisos')
    .filter(function (f) { return f.rol === rol; })
    .map(function (f) { return f.accion; });
}

function permitido_(rol, accion) {
  const p = permisosDe_(rol);
  return p.indexOf('*') !== -1 || p.indexOf(accion) !== -1;
}

/* ============ AUTENTICACIÓN ============ */

function claveFallos_(nombre) {
  return 'fallos_' + sha_(String(nombre).toLowerCase()).slice(0, 16);
}

function bloqueado_(nombre) {
  return Number(CacheService.getScriptCache().get(claveFallos_(nombre)) || 0) >= MAX_FALLOS;
}

function contarFallo_(nombre) {
  const c = CacheService.getScriptCache();
  const k = claveFallos_(nombre);
  c.put(k, String(Number(c.get(k) || 0) + 1), BLOQUEO_SEG);
}

function perfil_(u) {
  return {
    id: u.id, nombre: u.nombre, rol: u.rol,
    debe_cambiar_pin: esVerdadero_(u.debe_cambiar_pin),
    es_admin: esAdmin_(u),
    permisos: permisosDe_(u.rol)
  };
}

function authLista_() {
  return filas_('usuarios')
    .filter(function (u) { return esVerdadero_(u.activo); })
    .map(function (u) { return { nombre: u.nombre }; });
}

function authLogin_(d) {
  const nombre = String(d.nombre || '').trim();
  const pin = String(d.pin || '');
  if (!nombre || !pin) throw err_('Faltan datos');
  if (bloqueado_(nombre)) {
    auditar_(nombre, 'login.bloqueado', 'usuarios', '', '');
    throw err_('Demasiados intentos. Espera 15 minutos.', 'bloqueado');
  }
  const u = filas_('usuarios').filter(function (x) {
    return String(x.nombre).toLowerCase() === nombre.toLowerCase() && esVerdadero_(x.activo);
  })[0];
  if (!u || u.pin_hash !== hashPin_(pin)) {
    contarFallo_(nombre);
    auditar_(nombre, 'login.fallido', 'usuarios', u ? u.id : '', '');
    throw err_('Usuario o PIN incorrecto');
  }
  CacheService.getScriptCache().remove(claveFallos_(nombre));
  const token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  const ahora = new Date();
  const expira = new Date(ahora.getTime() + SESION_HORAS * 3600000);
  conLock_(function () {
    hoja_('sesiones').appendRow([
      sha_(token), u.id, String(d.dispositivo || '').slice(0, 60), ahora, expira
    ]);
  });
  auditar_(u.nombre, 'login.ok', 'usuarios', u.id, '');
  return { token: token, expira_en: expira.toISOString(), usuario: perfil_(u) };
}

function sesionDe_(token) {
  if (!token) throw err_('Inicia sesión', 'sesion');
  const h = hoja_('sesiones');
  const n = h.getLastRow();
  if (n < 2) throw err_('Inicia sesión', 'sesion');
  const hit = h.getRange(2, 1, n - 1, 1)
    .createTextFinder(sha_(String(token))).matchEntireCell(true).findNext();
  if (!hit) throw err_('Inicia sesión', 'sesion');
  const fila = h.getRange(hit.getRow(), 1, 1, 5).getValues()[0];
  if (new Date(fila[4]) <= new Date()) throw err_('Tu sesión expiró', 'sesion');
  const u = filas_('usuarios').filter(function (x) { return x.id === fila[1]; })[0];
  if (!u || !esVerdadero_(u.activo)) throw err_('Usuario inactivo', 'sesion');
  return { usuario: u, fila: hit.getRow() };
}

function authLogout_(d, ctx) {
  conLock_(function () {
    hoja_('sesiones').getRange(ctx.filaSesion, 5).setValue(new Date());
  });
  auditar_(ctx.usuario.nombre, 'logout', 'usuarios', ctx.usuario.id, '');
  return { cerrada: true };
}

function authYo_(d, ctx) { return perfil_(ctx.usuario); }

function authCambiarPin_(d, ctx) {
  const u = ctx.usuario;
  const actual = String(d.pinActual || '');
  const nuevo = String(d.pinNuevo || '');
  if (bloqueado_(u.nombre)) throw err_('Demasiados intentos. Espera 15 minutos.', 'bloqueado');
  if (u.pin_hash !== hashPin_(actual)) {
    contarFallo_(u.nombre);
    auditar_(u.nombre, 'pin.cambio_fallido', 'usuarios', u.id, '');
    throw err_('El PIN actual es incorrecto');
  }
  if (!/^\d{4,6}$/.test(nuevo)) throw err_('El PIN nuevo debe tener de 4 a 6 dígitos');
  if (pinFacil_(nuevo)) throw err_('Ese PIN es muy fácil de adivinar');
  if (nuevo === actual) throw err_('El PIN nuevo debe ser distinto al actual');
  conLock_(function () {
    const h = hoja_('usuarios');
    h.getRange(u._fila, 4).setValue(hashPin_(nuevo));
    h.getRange(u._fila, 7).setValue(false);
  });
  auditar_(u.nombre, 'pin.cambiado', 'usuarios', u.id, '');
  return { cambiado: true };
}


/* ============ ADMINISTRACIÓN (solo socios con es_admin) ============ */

function esAdmin_(u) { return u.rol === 'socio' && esVerdadero_(u.es_admin); }

function pinFacil_(p) {
  return /^(\d)\1+$/.test(p) || '0123456789'.indexOf(p) !== -1 || '9876543210'.indexOf(p) !== -1;
}

function pinAleatorio_() {
  let pin;
  do {
    const b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid());
    pin = '';
    for (let i = 0; i < 6; i++) pin += String((b[i] & 0xff) % 10);
  } while (pinFacil_(pin));
  return pin;
}

function cerrarSesionesDe_(usuarioId) {
  const h = hoja_('sesiones');
  const n = h.getLastRow();
  if (n < 2) return;
  const rng = h.getRange(2, 1, n - 1, 5);
  const v = rng.getValues();
  const ahora = new Date();
  let cambio = false;
  v.forEach(function (f) {
    if (f[1] === usuarioId && new Date(f[4]) > ahora) { f[4] = ahora; cambio = true; }
  });
  if (cambio) conLock_(function () { rng.setValues(v); });
}

function usuarioPorId_(id) {
  const u = filas_('usuarios').filter(function (x) { return x.id === id; })[0];
  if (!u) throw err_('Usuario no encontrado');
  return u;
}

function usuariosListar_() {
  return filas_('usuarios').map(function (u) {
    return {
      id: u.id, nombre: u.nombre, rol: u.rol,
      activo: esVerdadero_(u.activo), es_admin: esAdmin_(u),
      debe_cambiar_pin: esVerdadero_(u.debe_cambiar_pin),
      bloqueado: bloqueado_(u.nombre)
    };
  });
}

function usuariosCrear_(d, ctx) {
  const nombre = String(d.nombre || '').trim();
  const rol = String(d.rol || '');
  if (!nombre || nombre.length > 40) throw err_('Escribe un nombre (máximo 40 letras)');
  if (/^[=+\-@]/.test(nombre)) throw err_('El nombre no puede empezar con = + - @');
  if (['socio', 'encargada', 'cocina'].indexOf(rol) === -1) throw err_('Rol no válido');
  if (filas_('usuarios').some(function (x) {
    return String(x.nombre).toLowerCase() === nombre.toLowerCase();
  })) throw err_('Ya existe un usuario con ese nombre');
  const pin = pinAleatorio_();
  const id = Utilities.getUuid();
  conLock_(function () {
    hoja_('usuarios').appendRow([id, nombre, rol, hashPin_(pin), true, new Date(), true, false]);
  });
  auditar_(ctx.usuario.nombre, 'usuario.creado', 'usuarios', id, nombre + ' (' + rol + ')');
  return { id: id, nombre: nombre, pinTemporal: pin };
}

function usuariosRestablecerPin_(d, ctx) {
  const u = usuarioPorId_(d.id);
  if (u.id === ctx.usuario.id) throw err_('Para tu propio PIN usa "Cambiar mi PIN"');
  const pin = pinAleatorio_();
  conLock_(function () {
    const h = hoja_('usuarios');
    h.getRange(u._fila, 4).setValue(hashPin_(pin));
    h.getRange(u._fila, 7).setValue(true);
  });
  cerrarSesionesDe_(u.id);
  CacheService.getScriptCache().remove(claveFallos_(u.nombre));
  auditar_(ctx.usuario.nombre, 'pin.restablecido', 'usuarios', u.id, u.nombre);
  return { nombre: u.nombre, pinTemporal: pin };
}

function usuariosActivar_(d, ctx) {
  const u = usuarioPorId_(d.id);
  const activo = d.activo === true;
  if (u.id === ctx.usuario.id && !activo) throw err_('No puedes desactivarte a ti mismo');
  conLock_(function () { hoja_('usuarios').getRange(u._fila, 5).setValue(activo); });
  if (!activo) cerrarSesionesDe_(u.id);
  auditar_(ctx.usuario.nombre, activo ? 'usuario.activado' : 'usuario.desactivado', 'usuarios', u.id, u.nombre);
  return { nombre: u.nombre, activo: activo };
}

function auditoriaRecientes_() {
  const h = hoja_('auditoria');
  const n = h.getLastRow();
  if (n < 2) return [];
  const cant = Math.min(60, n - 1);
  return h.getRange(n - cant + 1, 1, cant, 8).getDisplayValues().reverse().map(function (f) {
    return { fecha: f[1], hora: f[2], usuario: f[3], accion: f[4], detalle: f[7] };
  });
}

/* ============ ROUTER ============ */

const ACCIONES = {
  'sistema.ping':   { publica: true, fn: function () { return { hora: new Date().toISOString() }; } },
  'auth.lista':     { publica: true, fn: authLista_ },
  'auth.login':     { publica: true, fn: authLogin_ },
  'auth.logout':    { sinCambioPin: true, fn: authLogout_ },
  'auth.yo':        { sinCambioPin: true, fn: authYo_ },
  'auth.cambiarPin':{ sinCambioPin: true, fn: authCambiarPin_ },
  'usuarios.listar':          { admin: true, fn: usuariosListar_ },
  'usuarios.crear':           { admin: true, fn: usuariosCrear_ },
  'usuarios.restablecerPin':  { admin: true, fn: usuariosRestablecerPin_ },
  'usuarios.activar':         { admin: true, fn: usuariosActivar_ },
  'auditoria.recientes':      { admin: true, fn: auditoriaRecientes_ }
  // Los módulos siguientes se agregan aquí, ej.:
  // 'ventas.registrar': { permiso: 'ventas.registrar', fn: ventasRegistrar_ }
};

function despachar_(p) {
  const def = ACCIONES[p.accion];
  if (!def) throw err_('Acción desconocida');
  let ctx = null;
  if (!def.publica) {
    const s = sesionDe_(p.token);
    ctx = { usuario: s.usuario, rol: s.usuario.rol, filaSesion: s.fila };
    if (esVerdadero_(s.usuario.debe_cambiar_pin) && !def.sinCambioPin) {
      throw err_('Debes cambiar tu PIN antes de continuar', 'cambiar_pin');
    }
    if (def.admin && !esAdmin_(s.usuario)) {
      auditar_(s.usuario.nombre, 'acceso.denegado', 'api', '', p.accion);
      throw err_('Solo un administrador puede hacer esto', 'permiso');
    }
    if (def.permiso && !permitido_(ctx.rol, def.permiso)) {
      auditar_(s.usuario.nombre, 'acceso.denegado', 'api', '', p.accion);
      throw err_('No tienes permiso para esta acción', 'permiso');
    }
  }
  return { ok: true, datos: def.fn(p.datos || {}, ctx) };
}

function fallo_(e) {
  if (e && e.negocio) return { ok: false, error: e.message, codigo: e.codigo };
  console.error(e && e.stack ? e.stack : e);
  return { ok: false, error: 'Error interno', codigo: 'interno' };
}

function salida_(r) {
  r.version = VERSION;
  return ContentService.createTextOutput(JSON.stringify(r))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  let r;
  try { r = despachar_(JSON.parse(e.postData.contents)); }
  catch (err) { r = fallo_(err); }
  return salida_(r);
}

function doGet(e) {
  const accion = (e && e.parameter && e.parameter.accion) || 'sistema.ping';
  let r;
  try {
    if (accion !== 'sistema.ping' && accion !== 'auth.lista') throw err_('Usa POST');
    r = despachar_({ accion: accion });
  } catch (err) { r = fallo_(err); }
  return salida_(r);
}

/* ============ MANTENIMIENTO ============ */

function configurarHojas() {
  const ss = abrirHoja_();
  Object.keys(HOJAS).forEach(function (n) {
    const h = ss.getSheetByName(n) || ss.insertSheet(n);
    h.getRange(1, 1, 1, HOJAS[n].length).setValues([HOJAS[n]]).setFontWeight('bold');
    h.setFrozenRows(1);
  });
  const rp = ss.getSheetByName('roles_permisos');
  if (rp.getLastRow() < 2) rp.getRange(2, 1, PERMISOS.length, 2).setValues(PERMISOS);
  ss.getSheets().forEach(function (s) {
    if (!HOJAS[s.getName()] && s.getLastRow() === 0) ss.deleteSheet(s);
  });
  ss.getSheetByName('auditoria').getRange('B:C').setNumberFormat('@');
  SpreadsheetApp.flush();
}

// Ejecutar una vez: agrega la columna debe_cambiar_pin y obliga a cambiar el PIN
function prepararFase1() {
  configurarHojas();
  const h = hoja_('usuarios');
  const n = h.getLastRow();
  if (n > 1) {
    const rng = h.getRange(2, 7, n - 1, 1);
    rng.setValues(rng.getValues().map(function (r) { return [r[0] === '' ? true : r[0]]; }));
  }
  SpreadsheetApp.flush();
  Logger.log('Listo. Usuarios marcados para cambiar PIN: ' + Math.max(n - 1, 0));
}

/* ============ RECUPERACIÓN (se ejecuta desde el editor, solo el dueño de la cuenta de Google) ============ */

function recuperarAcceso_(nombre) {
  const u = filas_('usuarios').filter(function (x) {
    return String(x.nombre).toLowerCase() === nombre.toLowerCase();
  })[0];
  if (!u) throw new Error('No existe el usuario: ' + nombre);
  const pin = pinAleatorio_();
  conLock_(function () {
    const h = hoja_('usuarios');
    h.getRange(u._fila, 4).setValue(hashPin_(pin));
    h.getRange(u._fila, 5).setValue(true);
    h.getRange(u._fila, 7).setValue(true);
  });
  cerrarSesionesDe_(u.id);
  CacheService.getScriptCache().remove(claveFallos_(u.nombre));
  auditar_('(editor)', 'pin.recuperado', 'usuarios', u.id, u.nombre);
  Logger.log('PIN temporal de ' + u.nombre + ': ' + pin + '  (cámbialo al entrar)');
}

function hacerAdmin_(nombre) {
  const u = filas_('usuarios').filter(function (x) {
    return String(x.nombre).toLowerCase() === nombre.toLowerCase();
  })[0];
  if (!u) throw new Error('No existe el usuario: ' + nombre);
  if (u.rol !== 'socio') throw new Error('Solo un socio puede ser administrador');
  conLock_(function () { hoja_('usuarios').getRange(u._fila, 8).setValue(true); });
  auditar_('(editor)', 'usuario.admin_asignado', 'usuarios', u.id, u.nombre);
  Logger.log(u.nombre + ' ahora es administrador.');
}

// Elige UNA de estas en el menú de funciones y toca Ejecutar. El PIN sale en el Registro de ejecución.
function recuperar_Agustin() { recuperarAcceso_('Agustín'); }
function recuperar_Hugo()    { recuperarAcceso_('Hugo'); }
function recuperar_Victor()  { recuperarAcceso_('Victor'); }
function recuperar_Pilar()   { recuperarAcceso_('Pilar'); }
function recuperar_Cocina()  { recuperarAcceso_('Cocina'); }
function admin_Agustin() { hacerAdmin_('Agustín'); }
function admin_Hugo()    { hacerAdmin_('Hugo'); }
function admin_Victor()  { hacerAdmin_('Victor'); }
