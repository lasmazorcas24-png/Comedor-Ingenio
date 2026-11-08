# ADR-001: Frontend desacoplado del backend
**Estado:** Aprobado
**Decisión:** El frontend vive en GitHub Pages y consume Apps Script como API JSON.
**Motivo:** Permite versionar, probar y migrar el backend sin tocar la interfaz.
**Consecuencia:** Hay que gestionar CORS y un contrato de API estable.
