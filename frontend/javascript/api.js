// Cliente único de la API. Toda llamada al backend pasa por aquí.
const Api = (function () {
  const CLAVE = 'ci_sesion';
  let sesion = null;
  try { sesion = JSON.parse(localStorage.getItem(CLAVE)); } catch (e) { sesion = null; }

  function guardar(s) {
    sesion = s;
    try {
      if (s) localStorage.setItem(CLAVE, JSON.stringify(s));
      else localStorage.removeItem(CLAVE);
    } catch (e) { /* almacenamiento no disponible */ }
  }

  function hayToken() { return !!(sesion && sesion.token); }

  async function llamar(accion, datos) {
    const cuerpo = JSON.stringify({
      accion: accion,
      token: sesion ? sesion.token : null,
      datos: datos || {}
    });
    let resp;
    try {
      // text/plain evita la petición previa (preflight) que Apps Script no admite
      const r = await fetch(CONFIG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: cuerpo
      });
      resp = await r.json();
    } catch (e) {
      const x = new Error('No hay conexión con el servidor. Revisa tu señal.');
      x.codigo = 'red';
      throw x;
    }
    if (!resp.ok) {
      const x = new Error(resp.error || 'Error');
      x.codigo = resp.codigo || '';
      if (x.codigo === 'sesion') guardar(null);
      throw x;
    }
    return resp.datos;
  }

  return { llamar: llamar, guardar: guardar, hayToken: hayToken };
})();
