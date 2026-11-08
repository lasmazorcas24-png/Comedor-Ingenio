# Arquitectura del sistema

## Vista general
```
Frontend estático (GitHub Pages, PWA)  →  API JSON (Apps Script Web App)  →  Google Sheets
   HTML/CSS/JS por rol                    router → servicios → repositorios     datos
```

## Capas del backend (backend/apps-script)
| Capa | Responsabilidad |
|---|---|
| Router | Recibe la petición, valida sesión y rol, despacha a un servicio |
| Servicios (uno por módulo) | Reglas de negocio de cada módulo |
| Repositorios | Único punto de acceso a Google Sheets |
| Núcleo (`core`) | Auth, permisos, auditoría, locks, caché, utilidades |

Regla: un servicio nunca lee o escribe una hoja directamente; siempre usa un repositorio. Migrar a otra base de datos implica reescribir solo los repositorios.

## Contrato de la API
Petición: `{ accion, token, datos }`
Respuesta: `{ ok, datos, error, version }`
Las acciones se nombran `modulo.operacion` (ej. `ventas.registrar`, `caja.cerrar`).

## Frontend (frontend/)
- Un cliente de API único (`javascript/api.js`) y un módulo JS por pantalla.
- Tres entradas por rol: socios, encargada, cocina; comparten componentes y estilos base.
- Móvil primero (socios y encargada): navegación inferior, tarjetas, zonas táctiles de 44 px mínimo.
- Cocina: layout fijo 800×480, botones grandes, pocos elementos.
- PWA: instalable, con cola local de escrituras que reintenta al recuperar señal.

## Seguridad
- Login con PIN; el servidor emite un token de sesión con vigencia por turno e inactividad.
- Cocina usa además un token de dispositivo registrado.
- El servidor filtra los datos según el rol; la encargada nunca recibe utilidad ni participación de socios.
- Dispositivos perdidos se bloquean desde la hoja `dispositivos`.
- Los datos privados de socios viven en un archivo de Sheets separado.

## Integridad de datos
- Transacciones solo se agregan; se corrigen con registros de ajuste ligados al original.
- `LockService` en toda escritura; caché para catálogos.
- Cada hoja lleva `id` (UUID), `creado_por`, `creado_en`, `turno_id`, `estado`.
- Registros anulados, no borrados.

## Rendimiento
Apps Script responde en 1 a 3 s. Mitigaciones: caché de catálogos, carga progresiva en pantalla, indicadores de guardado, agregados precalculados para dashboards.

## Crecimiento
- Archivo "catálogos y config" separado del archivo "operación"; operación se archiva por mes cuando crezca.
- Frontend y backend desacoplados: migrar a Node/Firebase/PostgreSQL no toca la interfaz.
- Cámara (futura): tablas y contrato reservados, sin implementar. Ver ADR-006.
