// Comedor Ingenio · Fase 1: acceso, cambio de PIN e inicio provisional por rol.
(function () {
  'use strict';
  const app = document.getElementById('app');
  const toast = document.getElementById('aviso');
  let usuario = null;      // perfil devuelto por la API
  let pinTemporal = null;  // solo en memoria, para el cambio obligatorio de PIN
  let tabActiva = 0;

  /* ---------- utilidades ---------- */
  function h(tag, props) {
    const el = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      const v = props[k];
      if (k === 'class') el.className = v;
      else if (k.indexOf('on') === 0) el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else if (v !== false && v != null) el.setAttribute(k, v);
    });
    Array.prototype.slice.call(arguments, 2).forEach(function agregar(c) {
      if (c == null || c === false) return;
      if (Array.isArray(c)) return c.forEach(agregar);
      el.append(typeof c === 'object' ? c : String(c));
    });
    return el;
  }

  let temporizador = null;
  function aviso(msg, tipo) {
    toast.textContent = msg;
    toast.className = 'visible ' + (tipo || '');
    clearTimeout(temporizador);
    temporizador = setTimeout(function () { toast.className = ''; }, 3500);
  }

  function montar() {
    app.replaceChildren.apply(app, arguments);
    window.scrollTo(0, 0);
  }

  function marca(subtitulo) {
    return h('header', { class: 'marca' },
      h('div', { class: 'logo' }, 'CI'),
      h('h1', {}, 'Comedor Ingenio'),
      subtitulo ? h('p', { class: 'suave' }, subtitulo) : null);
  }

  /* ---------- teclado de PIN ---------- */
  function teclado(o) {
    let pin = '';
    let ocupado = false;
    const puntos = h('div', { class: 'puntos', 'aria-label': 'PIN' });
    const boton = h('button', { class: 'btn primario', disabled: true, onclick: enviar }, o.textoBoton || 'Entrar');

    function pintar() {
      const hijos = [];
      for (let i = 0; i < 6; i++) {
        hijos.push(h('span', { class: 'punto' + (i < pin.length ? ' lleno' : '') }));
      }
      puntos.replaceChildren.apply(puntos, hijos);
      boton.disabled = pin.length < 4 || ocupado;
    }

    async function enviar() {
      if (pin.length < 4 || ocupado) return;
      ocupado = true; pintar();
      boton.textContent = 'Un momento…';
      try { await o.onListo(pin); }
      catch (e) { aviso(e.message, 'error'); pin = ''; }
      ocupado = false;
      boton.textContent = o.textoBoton || 'Entrar';
      pintar();
    }

    function tecla(txt, accion, etiqueta) {
      return h('button', {
        class: 'tecla', type: 'button', 'aria-label': etiqueta || txt,
        onclick: function () { if (!ocupado) accion(); }
      }, txt);
    }
    const num = function (n) {
      return tecla(String(n), function () { if (pin.length < 6) { pin += n; pintar(); } });
    };

    const rejilla = h('div', { class: 'teclado' },
      num(1), num(2), num(3), num(4), num(5), num(6), num(7), num(8), num(9),
      h('span', {}),
      num(0),
      tecla('⌫', function () { pin = pin.slice(0, -1); pintar(); }, 'Borrar'));
    pintar();

    return h('section', { class: 'panel' },
      h('h2', {}, o.titulo),
      o.subtitulo ? h('p', { class: 'suave' }, o.subtitulo) : null,
      puntos, rejilla, boton,
      o.onAtras ? h('button', { class: 'btn texto', onclick: o.onAtras }, 'Volver') : null);
  }

  /* ---------- acceso ---------- */
  async function vistaLogin() {
    usuario = null; pinTemporal = null; document.body.removeAttribute('data-rol');
    montar(marca(), h('p', { class: 'suave centro' }, 'Cargando usuarios…'));
    let lista;
    try { lista = await Api.llamar('auth.lista'); }
    catch (e) {
      montar(marca(), h('p', { class: 'error centro' }, e.message),
        h('button', { class: 'btn', onclick: vistaLogin }, 'Reintentar'));
      return;
    }
    montar(marca('Control del comedor'),
      h('h2', {}, '¿Quién eres?'),
      h('div', { class: 'usuarios' }, lista.map(function (u) {
        return h('button', { class: 'btn usuario', onclick: function () { vistaPin(u.nombre); } }, u.nombre);
      })));
  }

  function vistaPin(nombre) {
    montar(marca(), teclado({
      titulo: 'Hola, ' + nombre,
      subtitulo: 'Escribe tu PIN',
      onAtras: vistaLogin,
      onListo: async function (pin) {
        const r = await Api.llamar('auth.login', {
          nombre: nombre, pin: pin, dispositivo: navigator.userAgent.slice(0, 60)
        });
        Api.guardar({ token: r.token, expira_en: r.expira_en });
        usuario = r.usuario; pinTemporal = pin;
        entrar();
      }
    }));
  }

  function entrar() {
    document.body.setAttribute('data-rol', usuario.rol);
    if (usuario.debe_cambiar_pin) vistaCambiarPin(); else vistaInicio();
  }

  /* ---------- cambio de PIN ---------- */
  function vistaCambiarPin() {
    function pasoNuevo(actual) {
      montar(marca(), teclado({
        titulo: 'Elige tu PIN nuevo',
        subtitulo: 'De 4 a 6 números. Evita 1234 o números repetidos.',
        textoBoton: 'Siguiente',
        onAtras: usuario && !usuario.debe_cambiar_pin ? vistaInicio : null,
        onListo: async function (nuevo) { pasoConfirmar(actual, nuevo); }
      }));
    }
    function pasoConfirmar(actual, nuevo) {
      montar(marca(), teclado({
        titulo: 'Repite tu PIN nuevo',
        textoBoton: 'Guardar',
        onListo: async function (confirmar) {
          if (confirmar !== nuevo) { aviso('No coinciden. Empieza de nuevo.', 'error'); pasoNuevo(actual); return; }
          try {
            await Api.llamar('auth.cambiarPin', { pinActual: actual, pinNuevo: nuevo });
          } catch (e) {
            aviso(e.message, 'error');
            if (e.codigo === 'sesion') { vistaLogin(); return; }
            if (/actual/i.test(e.message)) { pinTemporal = null; vistaCambiarPin(); return; }
            pasoNuevo(actual); return;
          }
          pinTemporal = null; usuario.debe_cambiar_pin = false;
          aviso('PIN cambiado', 'ok');
          vistaInicio();
        }
      }));
    }
    if (pinTemporal) pasoNuevo(pinTemporal);
    else montar(marca(), teclado({
      titulo: 'Escribe tu PIN actual', textoBoton: 'Siguiente',
      onAtras: usuario && !usuario.debe_cambiar_pin ? vistaInicio : null,
      onListo: async function (a) { pasoNuevo(a); }
    }));
  }

  /* ---------- inicio por rol ---------- */
  const MENUS = {
    socio:     { titulo: 'Socios',    tabs: [['🏠', 'Inicio', 'inicio'], ['🧾', 'Ventas', 'ventas'], ['💵', 'Caja', 'caja'], ['📊', 'Reportes', 'reportes'], ['⋯', 'Más', 'mas']] },
    encargada: { titulo: 'Encargada', tabs: [['🏠', 'Inicio', 'inicio'], ['✍️', 'Registrar', 'registrar'], ['💵', 'Caja', 'caja'], ['📦', 'Pedidos', 'pedidos'], ['⋯', 'Más', 'mas']] }
  };

  function tiene(p) { return usuario.permisos.indexOf('*') !== -1 || usuario.permisos.indexOf(p) !== -1; }
  function dinero(n) { return Number(n || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }); }
  function numero(t) { return Number(String(t).replace(',', '.').replace(/[^\d.]/g, '')); }
  function cargando() { return h('p', { class: 'suave centro' }, 'Cargando…'); }
  function vacio(t) { return h('div', { class: 'vacio' }, h('p', { class: 'suave centro' }, t)); }
  function aInicio() { tabActiva = 0; vistaInicio(); }

  async function cerrarSesion() {
    try { await Api.llamar('auth.logout'); } catch (e) { /* ya no importa */ }
    Api.guardar(null);
    vistaLogin();
  }

  function proximamente(fase) {
    return function () { aviso('Disponible en la Fase ' + fase, ''); };
  }

  function marco(contenido) {
    const menu = MENUS[usuario.rol] || MENUS.encargada;
    montar(h('div', { class: 'inicio' },
      h('header', { class: 'barra' },
        h('div', {}, h('strong', {}, 'Comedor Ingenio'), h('span', { class: 'suave' }, ' · ' + menu.titulo)),
        h('span', { class: 'estado' }, '● En línea')),
      h('div', { class: 'contenido' }, contenido),
      h('nav', { class: 'nav' }, menu.tabs.map(function (t, i) {
        return h('button', {
          class: 'tab' + (i === tabActiva ? ' activa' : ''),
          onclick: function () { tabActiva = i; vistaInicio(); }
        }, h('span', { class: 'icono' }, t[0]), h('span', {}, t[1]));
      }))));
  }

  function falloVista(e, reintentar) {
    if (e.codigo === 'sesion') { aviso(e.message, 'error'); vistaLogin(); return; }
    marco(h('div', {}, h('p', { class: 'error centro' }, e.message),
      h('button', { class: 'btn', onclick: reintentar }, 'Reintentar')));
  }

  function vistaInicio() {
    if (usuario.rol === 'cocina') { vistaCocina(); return; }
    const menu = MENUS[usuario.rol] || MENUS.encargada;
    const clave = menu.tabs[tabActiva][2];
    const paneles = {
      inicio: panelInicio, ventas: panelVentas, registrar: abrirRegistro, caja: panelCaja, mas: panelMas,
      reportes: function () { marco(vacio('Los reportes llegan en la Fase 6.')); },
      pedidos: function () { marco(vacio('Los pedidos internos llegan en la Fase 4.')); }
    };
    (paneles[clave] || panelInicio)();
  }

  /* --- inicio --- */
  function bannerTurno(est) {
    if (est.abierto) {
      return h('div', { class: 'banner abierto' }, '🟢 Turno abierto desde las ' + est.desde + ' · Fondo ' + dinero(est.fondo));
    }
    return h('div', { class: 'banner' }, h('span', {}, '⚪ Sin turno abierto'),
      tiene('turnos.operar') ? h('button', { class: 'btn pequeno', onclick: vistaAbrirTurno }, 'Abrir turno') : null);
  }

  async function panelInicio() {
    marco(cargando());
    let est, res;
    try {
      const r = await Promise.all([Api.llamar('turnos.estado'), Api.llamar('resumen.inicio')]);
      est = r[0]; res = r[1];
    } catch (e) { falloVista(e, panelInicio); return; }
    const colores = ['verde', 'azul', 'naranja', 'morado'];
    marco(h('div', {},
      h('h2', {}, 'Hola, ' + usuario.nombre),
      bannerTurno(est),
      h('div', { class: 'tarjetas' }, res.tarjetas.map(function (t, i) {
        const v = t.valor == null ? '—' : (t.formato === 'moneda' ? dinero(t.valor) : String(t.valor));
        return h('div', { class: 'tarjeta ' + colores[i % 4] }, h('span', { class: 'suave' }, t.titulo), h('strong', {}, v));
      }))));
  }

  function vistaAbrirTurno() {
    const fondo = h('input', { class: 'campo', type: 'text', inputmode: 'decimal', placeholder: 'Ej. 500' });
    marco(h('div', {},
      h('h2', {}, 'Abrir turno'),
      h('label', { class: 'suave' }, 'Fondo inicial en caja (pesos)'), fondo,
      h('button', { class: 'btn primario', onclick: async function (ev) {
        const b = ev.currentTarget; b.disabled = true;
        try { await Api.llamar('turnos.abrir', { fondo: numero(fondo.value) }); aviso('Turno abierto', 'ok'); aInicio(); }
        catch (e) { aviso(e.message, 'error'); b.disabled = false; if (e.codigo === 'sesion') vistaLogin(); }
      } }, 'Abrir turno'),
      h('button', { class: 'btn texto', onclick: aInicio }, 'Cancelar')));
  }

  /* --- ventas --- */
  async function nodoRegistroVentas() {
    const r = await Promise.all([Api.llamar('menu.listar'), Api.llamar('turnos.estado')]);
    const menu = r[0], est = r[1];
    if (!est.abierto) return vacio('No hay turno abierto. La encargada debe abrirlo para registrar ventas.');
    if (!menu.length) return vacio('No hay platillos en el menú. Agrégalos en la hoja productos_menu.');
    const cant = {}, contadores = {};
    const total = h('strong', {}, dinero(0));
    const boton = h('button', { class: 'btn primario', disabled: true, onclick: enviar }, 'Registrar venta');

    function suma() { return menu.reduce(function (a, p) { return a + (cant[p.id] || 0) * p.precio; }, 0); }
    function pintar() {
      menu.forEach(function (p) {
        contadores[p.id].textContent = String(cant[p.id] || 0);
        contadores[p.id].closest('.producto').classList.toggle('con', (cant[p.id] || 0) > 0);
      });
      const t = suma(); total.textContent = dinero(t); boton.disabled = t <= 0;
    }
    async function enviar() {
      const lineas = menu.filter(function (p) { return cant[p.id] > 0; })
        .map(function (p) { return { producto_id: p.id, cantidad: cant[p.id] }; });
      boton.disabled = true; boton.textContent = 'Guardando…';
      try {
        const res = await Api.llamar('ventas.registrar', { lineas: lineas });
        menu.forEach(function (p) { cant[p.id] = 0; });
        aviso('Venta registrada · ' + dinero(res.total), 'ok');
      } catch (e) {
        aviso(e.message, 'error');
        if (e.codigo === 'sesion') { vistaLogin(); return; }
      }
      boton.textContent = 'Registrar venta'; pintar();
    }

    const rejilla = h('div', { class: 'productos' }, menu.map(function (p) {
      const c = h('span', { class: 'contador' }, '0');
      contadores[p.id] = c;
      return h('div', { class: 'producto' },
        h('button', { class: 'tile', type: 'button', onclick: function () {
          if ((cant[p.id] || 0) < 99) { cant[p.id] = (cant[p.id] || 0) + 1; pintar(); }
        } }, h('span', { class: 'nombre' }, p.nombre), h('span', { class: 'suave' }, dinero(p.precio))),
        h('div', { class: 'cantidad' },
          h('button', { class: 'menos', type: 'button', 'aria-label': 'Quitar uno', onclick: function () {
            if (cant[p.id] > 0) { cant[p.id]--; pintar(); }
          } }, '−'), c));
    }));
    return h('div', {}, rejilla, h('div', { class: 'total-barra' }, h('span', {}, 'Total'), total), boton);
  }

  async function abrirRegistro() {
    marco(cargando());
    let nodo;
    try { nodo = await nodoRegistroVentas(); } catch (e) { falloVista(e, abrirRegistro); return; }
    marco(h('div', {}, h('h2', {}, 'Registrar venta'), nodo,
      tiene('ventas.ver') ? h('button', { class: 'btn texto', onclick: panelVentas }, 'Ver ventas del turno') : null));
  }

  function filaVenta(v) {
    const anulada = v.estado !== 'activa';
    return h('div', { class: 'linea' + (anulada ? ' anulada' : '') },
      h('div', {}, h('strong', {}, v.cantidad + ' × ' + v.producto),
        h('div', { class: 'suave' }, v.hora + ' · ' + v.usuario + (anulada ? ' · ANULADA' : ''))),
      h('div', { class: 'derecha' }, h('strong', {}, dinero(v.total)),
        (!anulada && tiene('ventas.anular')) ? h('button', { class: 'btn pequeno', onclick: async function () {
          const motivo = prompt('Motivo de la anulación:');
          if (!motivo) return;
          try { await Api.llamar('ventas.anular', { id: v.id, motivo: motivo }); aviso('Venta anulada', 'ok'); panelVentas(); }
          catch (e) { aviso(e.message, 'error'); }
        } }, 'Anular') : null));
  }

  async function panelVentas() {
    marco(cargando());
    let d;
    try { d = await Api.llamar('ventas.lista'); } catch (e) { falloVista(e, panelVentas); return; }
    if (!d.turno) { marco(h('div', {}, h('h2', {}, 'Ventas'), vacio('No hay turno abierto.'))); return; }
    marco(h('div', {},
      h('h2', {}, 'Ventas del turno'),
      h('div', { class: 'resumen-linea' }, h('span', {}, d.platillos + ' platillos'), h('strong', {}, dinero(d.total))),
      tiene('ventas.registrar') ? h('button', { class: 'btn primario', onclick: abrirRegistro }, '+ Registrar venta') : null,
      h('div', { class: 'lista' }, d.ventas.length ? d.ventas.map(filaVenta) : vacio('Aún no hay ventas.'))));
  }

  /* --- caja --- */
  function renglon(etiqueta, valor, clase) {
    return h('div', { class: 'renglon' + (clase ? ' ' + clase : '') }, h('span', {}, etiqueta), h('strong', {}, dinero(valor)));
  }

  function bloqueCierre(titulo, c) {
    const color = c.diferencia === 0 ? 'ok' : (Math.abs(c.diferencia) <= 20 ? 'aviso' : 'mal');
    return h('div', { class: 'bloque' }, h('h3', {}, titulo),
      renglon('Esperado', c.esperado), renglon('Contado', c.contado),
      renglon('Diferencia', c.diferencia, color));
  }

  async function panelCaja() {
    marco(cargando());
    let d;
    try { d = await Api.llamar('caja.resumen'); } catch (e) { falloVista(e, panelCaja); return; }
    if (!d.turno) {
      marco(h('div', {}, h('h2', {}, 'Caja'), vacio('No hay turno abierto.'),
        d.ultimoCierre ? bloqueCierre('Último cierre', d.ultimoCierre) : null,
        tiene('turnos.operar') ? h('button', { class: 'btn primario', onclick: vistaAbrirTurno }, 'Abrir turno') : null));
      return;
    }
    marco(h('div', {},
      h('h2', {}, 'Caja del turno'),
      h('div', { class: 'bloque' },
        renglon('Fondo inicial', d.fondo), renglon('Ventas', d.ventas),
        renglon('Ingresos', d.ingresos), renglon('Gastos', d.gastos),
        d.esperado !== undefined ? renglon('Efectivo esperado', d.esperado, 'total') : null),
      h('div', { class: 'acciones' },
        h('button', { class: 'btn', onclick: function () { vistaMovimiento('gasto'); } }, '− Gasto'),
        h('button', { class: 'btn', onclick: function () { vistaMovimiento('ingreso'); } }, '+ Ingreso')),
      tiene('caja.cerrar') ? h('button', { class: 'btn peligro', onclick: vistaCerrarTurno }, 'Cerrar turno') : null,
      h('h3', {}, 'Movimientos'),
      h('div', { class: 'lista' }, d.movimientos.length ? d.movimientos.map(function (m) {
        return h('div', { class: 'linea' },
          h('div', {}, h('strong', {}, m.concepto), h('div', { class: 'suave' }, m.hora + ' · ' + m.tipo)),
          h('div', { class: 'derecha' },
            h('strong', {}, (m.tipo === 'gasto' ? '−' : '+') + dinero(m.monto)),
            h('button', { class: 'btn pequeno', onclick: async function () {
              if (!confirm('¿Anular "' + m.concepto + '"?')) return;
              try { await Api.llamar('caja.anular', { id: m.id }); aviso('Movimiento anulado', 'ok'); panelCaja(); }
              catch (e) { aviso(e.message, 'error'); }
            } }, 'Anular')));
      }) : vacio('Sin movimientos.'))));
  }

  function vistaMovimiento(tipo) {
    const concepto = h('input', { class: 'campo', type: 'text', maxlength: '80', placeholder: tipo === 'gasto' ? 'Ej. Gas, limones, hielo' : 'Ej. Cambio de banco' });
    const monto = h('input', { class: 'campo', type: 'text', inputmode: 'decimal', placeholder: '0.00' });
    marco(h('div', {},
      h('h2', {}, tipo === 'gasto' ? 'Registrar gasto' : 'Registrar ingreso'),
      h('label', { class: 'suave' }, 'Concepto'), concepto,
      h('label', { class: 'suave' }, 'Monto (pesos)'), monto,
      h('button', { class: 'btn primario', onclick: async function (ev) {
        const b = ev.currentTarget; b.disabled = true;
        try {
          await Api.llamar('caja.registrar', { tipo: tipo, concepto: concepto.value, monto: numero(monto.value) });
          aviso('Registrado', 'ok'); panelCaja();
        } catch (e) { aviso(e.message, 'error'); b.disabled = false; if (e.codigo === 'sesion') vistaLogin(); }
      } }, 'Guardar'),
      h('button', { class: 'btn texto', onclick: panelCaja }, 'Cancelar')));
  }

  function vistaCerrarTurno() {
    const contado = h('input', { class: 'campo', type: 'text', inputmode: 'decimal', placeholder: 'Efectivo que hay en caja' });
    const nota = h('input', { class: 'campo', type: 'text', maxlength: '120', placeholder: 'Nota (opcional)' });
    marco(h('div', {},
      h('h2', {}, 'Cerrar turno'),
      h('p', { class: 'suave' }, 'Cuenta el efectivo de la caja y escríbelo. Al guardar verás la diferencia.'),
      h('label', { class: 'suave' }, 'Efectivo contado (pesos)'), contado,
      h('label', { class: 'suave' }, 'Nota'), nota,
      h('button', { class: 'btn peligro', onclick: async function (ev) {
        if (contado.value.trim() === '') { aviso('Escribe el efectivo contado', 'error'); return; }
        if (!confirm('¿Cerrar el turno con ' + dinero(numero(contado.value)) + '? Ya no se podrán registrar ventas.')) return;
        const b = ev.currentTarget; b.disabled = true;
        try {
          const r = await Api.llamar('turnos.cerrar', { contado: numero(contado.value), nota: nota.value });
          vistaResultadoCierre(r);
        } catch (e) { aviso(e.message, 'error'); b.disabled = false; if (e.codigo === 'sesion') vistaLogin(); }
      } }, 'Cerrar turno'),
      h('button', { class: 'btn texto', onclick: panelCaja }, 'Cancelar')));
  }

  function vistaResultadoCierre(r) {
    marco(h('div', {},
      h('h2', {}, 'Turno cerrado'),
      bloqueCierre('Resultado de caja', r),
      h('p', { class: 'suave' }, 'Ventas del turno: ' + dinero(r.ventas) + ' · Gastos: ' + dinero(r.gastos)),
      h('button', { class: 'btn primario', onclick: aInicio }, 'Listo')));
  }

  /* --- más --- */
  function panelMas() {
    marco(h('div', {},
      h('h2', {}, usuario.nombre),
      h('p', { class: 'suave' }, 'Rol: ' + usuario.rol),
      h('button', { class: 'btn', onclick: function () { vistaCambiarPin(); } }, 'Cambiar mi PIN'),
      usuario.es_admin ? h('button', { class: 'btn', onclick: vistaAdmin }, '⚙️ Administrar usuarios') : null,
      h('button', { class: 'btn peligro', onclick: cerrarSesion }, 'Cerrar sesión')));
  }

  /* --- cocina --- */
  async function vistaVentaCocina() {
    const cabecera = h('header', { class: 'barra' }, h('strong', {}, 'Registrar ventas'),
      h('button', { class: 'btn pequeno', onclick: vistaCocina }, 'Volver'));
    montar(h('div', { class: 'cocina' }, cabecera, cargando()));
    let nodo;
    try { nodo = await nodoRegistroVentas(); }
    catch (e) { aviso(e.message, 'error'); if (e.codigo === 'sesion') { vistaLogin(); return; } vistaCocina(); return; }
    montar(h('div', { class: 'cocina' }, cabecera, nodo));
  }

  function vistaCocina() {
    const grande = function (txt, icono, color, accion) {
      return h('button', { class: 'grande ' + color, onclick: accion },
        h('span', { class: 'icono' }, icono), h('span', {}, txt));
    };
    montar(h('div', { class: 'cocina' },
      h('header', { class: 'barra' },
        h('strong', {}, 'Comedor Ingenio'),
        h('span', { class: 'estado' }, '● En operación'),
        h('button', { class: 'btn pequeno', onclick: cerrarSesion }, 'Salir')),
      h('div', { class: 'botonera' },
        grande('Registrar corte', '🍲', 'azul', proximamente(3)),
        grande('Registrar uso', '🥘', 'verde', proximamente(3)),
        grande('Pedir insumos', '🛒', 'morado', proximamente(4)),
        grande('Registrar ventas', '🧾', 'naranja', vistaVentaCocina)),
      h('footer', { class: 'pie' }, 'Pendientes: 0 · Hola, ' + usuario.nombre)));
  }

  /* ---------- administración (solo socios con permiso de administrador) ---------- */
  function errorAdmin(e) {
    aviso(e.message, 'error');
    if (e.codigo === 'sesion') vistaLogin(); else vistaInicio();
  }

  async function vistaAdmin() {
    montar(marca('Administración'), h('p', { class: 'suave centro' }, 'Cargando…'));
    let lista;
    try { lista = await Api.llamar('usuarios.listar'); }
    catch (e) { errorAdmin(e); return; }
    montar(
      h('header', { class: 'barra' },
        h('strong', {}, 'Usuarios'),
        h('button', { class: 'btn pequeno', onclick: function () { tabActiva = 0; vistaInicio(); } }, 'Volver')),
      h('div', { class: 'lista' }, lista.map(tarjetaUsuario)),
      h('button', { class: 'btn primario', onclick: vistaNuevoUsuario }, '+ Nuevo usuario'),
      h('button', { class: 'btn', onclick: vistaAuditoria }, 'Ver actividad reciente'));
  }

  function tarjetaUsuario(u) {
    const insignias = [];
    if (u.es_admin) insignias.push(h('span', { class: 'insignia azul' }, 'Administrador'));
    if (!u.activo) insignias.push(h('span', { class: 'insignia rojo' }, 'Inactivo'));
    if (u.bloqueado) insignias.push(h('span', { class: 'insignia rojo' }, 'Bloqueado'));
    if (u.debe_cambiar_pin) insignias.push(h('span', { class: 'insignia naranja' }, 'PIN pendiente'));
    const esYo = u.id === usuario.id;
    return h('div', { class: 'fila-usuario' },
      h('div', {}, h('strong', {}, u.nombre), h('span', { class: 'suave' }, ' · ' + u.rol + (esYo ? ' (tú)' : ''))),
      h('div', { class: 'insignias' }, insignias),
      esYo ? null : h('div', { class: 'acciones' },
        h('button', { class: 'btn pequeno', onclick: async function () {
          if (!confirm('¿Restablecer el PIN de ' + u.nombre + '? Se cerrará su sesión.')) return;
          try {
            const r = await Api.llamar('usuarios.restablecerPin', { id: u.id });
            vistaPinTemporal(r.nombre, r.pinTemporal);
          } catch (e) { aviso(e.message, 'error'); }
        } }, 'Restablecer PIN'),
        h('button', { class: 'btn pequeno', onclick: async function () {
          const nuevo = !u.activo;
          if (!confirm('¿' + (nuevo ? 'Activar' : 'Desactivar') + ' a ' + u.nombre + '?')) return;
          try { await Api.llamar('usuarios.activar', { id: u.id, activo: nuevo }); vistaAdmin(); }
          catch (e) { aviso(e.message, 'error'); }
        } }, u.activo ? 'Desactivar' : 'Activar')));
  }

  function vistaNuevoUsuario() {
    const nombre = h('input', { class: 'campo', type: 'text', maxlength: '40', placeholder: 'Nombre', autocomplete: 'off' });
    const rol = h('select', { class: 'campo' },
      h('option', { value: 'cocina' }, 'Cocina'),
      h('option', { value: 'encargada' }, 'Encargada'),
      h('option', { value: 'socio' }, 'Socio'));
    montar(marca('Nuevo usuario'),
      h('label', { class: 'suave' }, 'Nombre'), nombre,
      h('label', { class: 'suave' }, 'Rol'), rol,
      h('button', { class: 'btn primario', onclick: async function (ev) {
        const b = ev.currentTarget; b.disabled = true;
        try {
          const r = await Api.llamar('usuarios.crear', { nombre: nombre.value, rol: rol.value });
          vistaPinTemporal(r.nombre, r.pinTemporal);
        } catch (e) { aviso(e.message, 'error'); b.disabled = false; }
      } }, 'Crear usuario'),
      h('button', { class: 'btn texto', onclick: vistaAdmin }, 'Cancelar'));
  }

  function vistaPinTemporal(nombre, pin) {
    montar(marca('PIN temporal'),
      h('section', { class: 'panel' },
        h('h2', {}, nombre),
        h('div', { class: 'pin-grande' }, pin),
        h('p', { class: 'suave' }, 'Entrégalo en persona. Se muestra una sola vez y deberá cambiarlo al entrar.'),
        h('button', { class: 'btn primario', onclick: vistaAdmin }, 'Listo')));
  }

  async function vistaAuditoria() {
    montar(marca('Actividad reciente'), h('p', { class: 'suave centro' }, 'Cargando…'));
    let filas;
    try { filas = await Api.llamar('auditoria.recientes'); }
    catch (e) { errorAdmin(e); return; }
    montar(
      h('header', { class: 'barra' },
        h('strong', {}, 'Actividad'),
        h('button', { class: 'btn pequeno', onclick: vistaAdmin }, 'Volver')),
      h('div', { class: 'lista' }, filas.length ? filas.map(function (f) {
        return h('div', { class: 'registro' },
          h('span', { class: 'suave' }, f.fecha + ' ' + f.hora),
          h('span', {}, f.usuario + ' · ' + f.accion + (f.detalle ? ' · ' + f.detalle : '')));
      }) : h('p', { class: 'suave centro' }, 'Sin registros.')));
  }

  /* ---------- arranque ---------- */
  async function iniciar() {
    if (!window.CONFIG || !CONFIG.API_URL || CONFIG.API_URL.indexOf('PEGA') !== -1) {
      montar(marca(), h('p', { class: 'error centro' }, 'Falta configurar la dirección de la API (config.js).'));
      return;
    }
    if (!Api.hayToken()) { vistaLogin(); return; }
    montar(marca(), h('p', { class: 'suave centro' }, 'Abriendo tu sesión…'));
    try { usuario = await Api.llamar('auth.yo'); entrar(); }
    catch (e) {
      if (e.codigo === 'red') {
        montar(marca(), h('p', { class: 'error centro' }, e.message),
          h('button', { class: 'btn', onclick: iniciar }, 'Reintentar'));
      } else { vistaLogin(); }
    }
  }

  iniciar();
})();
