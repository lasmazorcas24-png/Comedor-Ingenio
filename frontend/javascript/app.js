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

  /* ---------- inicio provisional por rol ---------- */
  const MENUS = {
    socio:     { titulo: 'Socios',    tabs: [['🏠', 'Inicio'], ['🧾', 'Ventas'], ['💵', 'Caja'], ['📊', 'Reportes'], ['⋯', 'Más']] },
    encargada: { titulo: 'Encargada', tabs: [['🏠', 'Inicio'], ['✍️', 'Registrar'], ['💵', 'Caja'], ['📦', 'Pedidos'], ['⋯', 'Más']] }
  };
  const TARJETAS = {
    socio:     [['Ventas del día', 'verde'], ['Platillos vendidos', 'azul'], ['Gastos del día', 'naranja'], ['Utilidad estimada', 'morado']],
    encargada: [['Ventas del día', 'verde'], ['Platillos servidos', 'azul'], ['Diferencia de caja', 'naranja'], ['Pedidos pendientes', 'morado']]
  };

  async function cerrarSesion() {
    try { await Api.llamar('auth.logout'); } catch (e) { /* ya no importa */ }
    Api.guardar(null);
    vistaLogin();
  }

  function proximamente(fase) {
    return function () { aviso('Disponible en la Fase ' + fase, ''); };
  }

  function vistaInicio() {
    if (usuario.rol === 'cocina') return vistaCocina();
    const menu = MENUS[usuario.rol] || MENUS.encargada;
    const contenido = tabActiva === menu.tabs.length - 1 ? panelMas() : panelInicio();
    montar(h('div', { class: 'inicio' },
      h('header', { class: 'barra' },
        h('div', {}, h('strong', {}, 'Comedor Ingenio'), h('span', { class: 'suave' }, ' · ' + menu.titulo)),
        h('span', { class: 'estado' }, '● En línea')),
      h('div', { class: 'contenido' }, contenido),
      h('nav', { class: 'nav' }, menu.tabs.map(function (t, i) {
        return h('button', {
          class: 'tab' + (i === tabActiva ? ' activa' : ''),
          onclick: function () {
            if (i === 0 || i === menu.tabs.length - 1) { tabActiva = i; vistaInicio(); }
            else proximamente(2)();
          }
        }, h('span', { class: 'icono' }, t[0]), h('span', {}, t[1]));
      }))));
  }

  function panelInicio() {
    return h('div', {},
      h('h2', {}, 'Hola, ' + usuario.nombre),
      h('div', { class: 'tarjetas' }, TARJETAS[usuario.rol].map(function (t) {
        return h('div', { class: 'tarjeta ' + t[1] }, h('span', { class: 'suave' }, t[0]), h('strong', {}, '—'));
      })),
      h('p', { class: 'nota' }, 'Acceso listo. Los datos aparecerán cuando se activen ventas y caja (Fase 2).'));
  }

  function panelMas() {
    return h('div', {},
      h('h2', {}, usuario.nombre),
      h('p', { class: 'suave' }, 'Rol: ' + usuario.rol),
      h('button', { class: 'btn', onclick: function () { vistaCambiarPin(); } }, 'Cambiar mi PIN'),
      h('button', { class: 'btn peligro', onclick: cerrarSesion }, 'Cerrar sesión'));
  }

  function vistaCocina() {
    const grande = function (txt, icono, color, fase) {
      return h('button', { class: 'grande ' + color, onclick: proximamente(fase) },
        h('span', { class: 'icono' }, icono), h('span', {}, txt));
    };
    montar(h('div', { class: 'cocina' },
      h('header', { class: 'barra' },
        h('strong', {}, 'Comedor Ingenio'),
        h('span', { class: 'estado' }, '● En operación'),
        h('button', { class: 'btn pequeno', onclick: cerrarSesion }, 'Salir')),
      h('div', { class: 'botonera' },
        grande('Registrar corte', '🍲', 'azul', 3),
        grande('Registrar uso', '🥘', 'verde', 3),
        grande('Pedir insumos', '🛒', 'morado', 4),
        grande('Registrar ventas', '🧾', 'naranja', 2)),
      h('footer', { class: 'pie' }, 'Pendientes: 0 · Hola, ' + usuario.nombre)));
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
