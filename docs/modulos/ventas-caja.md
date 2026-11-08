# Módulos turnos, ventas y caja (Fase 2, backend 0.3.0)

Backend en `backend/apps-script/Fase2.gs` (archivo aparte; se registra solo en el router).

## Acciones
| Acción | Permiso | Descripción |
|---|---|---|
| menu.listar | Sesión | Platillos activos con precio |
| turnos.estado | Sesión | Turno abierto, hora y fondo |
| turnos.abrir | turnos.operar | Abre turno con fondo inicial (solo uno a la vez) |
| turnos.cerrar | caja.cerrar | Cierra con efectivo contado; calcula diferencia |
| ventas.registrar | ventas.registrar | Varias líneas en una llamada; el precio sale del servidor |
| ventas.lista | ventas.ver | Ventas del turno abierto |
| ventas.anular | ventas.anular | Anula con motivo (solo turno abierto) |
| caja.registrar / caja.anular | caja.operar | Gastos e ingresos del turno |
| caja.resumen | caja.operar | Fondo, ventas, ingresos, gastos y movimientos |
| resumen.inicio | Sesión | Tarjetas de inicio según el rol |

## Reglas
- Efectivo esperado = fondo + ventas + ingresos − gastos (se asume que todas las ventas son en efectivo).
- Diferencia = contado − esperado.
- **Conteo ciego:** la encargada no ve el efectivo esperado antes de cerrar; los socios sí.
- Utilidad estimada = ventas − gastos, solo en la vista de socios; el servidor no la envía a otros roles.
- Nada se borra: ventas y movimientos se marcan `anulada` / `anulado` con motivo y quedan en auditoría.
- Los textos libres se limpian para evitar fórmulas en Sheets.
- Cocina solo registra ventas; no ve la lista, ni la caja, ni los reportes.
- Zona horaria de los registros: America/Mexico_City.

## Hojas nuevas
productos_menu, turnos, ventas, caja_movimientos, caja_cierres (ver `database/estructura-sheets.md`).

## Pendiente
- Medios de pago distintos de efectivo.
- Archivar ventas por mes cuando crezcan (hoy se leen las últimas 3000 filas).
- Panel de administración de usuarios: pendiente de depurar en el celular.
