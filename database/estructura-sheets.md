# Estructura de Google Sheets

Columnas comunes en toda hoja transaccional: `id` (UUID), `creado_por`, `creado_en`, `turno_id`, `estado` (activo / anulado), `ajusta_a` (id original, si es un ajuste).

## Archivo 1: Catálogos y configuración
| Hoja | Columnas principales |
|---|---|
| usuarios | id, nombre, rol, pin_hash, activo |
| roles_permisos | rol, accion |
| sesiones | token, usuario_id, dispositivo_id, expira_en |
| dispositivos | id, nombre, tipo, token, activo |
| productos_menu | id, nombre, precio, activo |
| insumos | id, nombre, unidad, costo_actual, minimo, proveedor_id |
| proveedores | id, nombre, contacto |
| unidades | codigo, nombre |
| config | clave, valor |
| recetas | id, producto_id, rendimiento, costo_porcion |
| receta_ingredientes | receta_id, insumo_id, cantidad |
| checklist_plantillas / checklist_items | plantilla_id, tipo, orden, obligatorio, tipo_item, rango |

## Archivo 2: Operación
| Hoja | Columnas principales |
|---|---|
| turnos | id, fecha, abierto_por, hora_apertura, hora_cierre, estado |
| ventas | id, turno_id, producto_id, cantidad, precio, hora, usuario |
| caja_movimientos | id, turno_id, tipo (ingreso/gasto/apertura), concepto, monto |
| caja_cierres | id, turno_id, esperado, contado, diferencia |
| produccion | id, turno_id, producto_id, preparado, usado, sobrante, merma |
| inv_movimientos | id, insumo_id, tipo (entrada/salida/ajuste), cantidad, costo, origen |
| inv_existencias | insumo_id, existencia (calculada), alerta |
| pedidos_internos / pedidos_detalle | id, solicitante, estado, insumo_id, cantidad_solicitada, cantidad_aprobada |
| checklist_ejecuciones / checklist_respuestas | id, plantilla_id, turno_id, usuario, item_id, valor |
| alertas | id, tipo, mensaje, severidad, leida |
| auditoria | id, fecha, hora, usuario, accion, entidad, entidad_id, detalle |
| camara_eventos / camara_conciliacion | Reservadas (fase 8) |

## Archivo 3: Socios (acceso restringido)
gastos_socios, participacion, utilidad_mensual.
