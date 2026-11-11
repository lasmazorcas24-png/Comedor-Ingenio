# Checklists y alertas (Fase 5, backend 0.6.0)

Backend en `backend/apps-script/Fase5.gs` (archivo aparte; requiere Fase2, 3 y 4).

## Checklists
Motor genérico: plantilla → puntos → ejecución → respuestas. Los formatos físicos se cargan como datos en las hojas `checklist_plantillas` y `checklist_items`, sin código nuevo.
- Tipos de punto: `si_no`, `numero` (con mínimo y máximo) y `texto`.
- Cocina solo ve y ejecuta los checklists con `rol_ejecuta = cocina`; la encargada ve todos.
- Un punto obligatorio vacío no deja guardar. Un "No" o un número fuera de rango se marca y genera una alerta.
- La encargada y los socios pueden revisar cada ejecución (queda quién y cuándo).
- Si `obligatoria_cierre` es TRUE, el turno no se puede cerrar hasta hacerlo (se apaga con `bloquear_cierre_por_checklists = FALSE` en `config`).
- Ejemplos incluidos: Apertura, Limpieza de cocina, Control operativo y Cierre.

## Alertas
| Alerta | Severidad | Cuándo |
|---|---|---|
| inventario_bajo | media | Un insumo llega a su mínimo (una vez al día por insumo) |
| produccion_diferencia | alta | La diferencia uso − ventas pasa la tolerancia |
| caja_diferencia | alta | La diferencia al cerrar pasa `tolerancia_caja` (10 pesos) |
| checklist | media | Un "No" o un valor fuera de rango |
| pedido | baja | Cocina hace un pedido (solo encargada y socios) |
| turno_abierto | alta | Un turno de un día anterior sigue abierto |

- No se repiten: cada alerta tiene una clave y se crea una sola vez.
- Las ven socios y encargada (campana 🔔 en el encabezado). Cocina no ve alertas.
- Las de severidad alta se envían también por **correo** a los de `correos_alertas` (hoja `config`, separados por coma). Límite de Google: unos 100 correos al día.
- La revisión corre al abrir la campana o el inicio y, si se activa `activarAlertasAutomaticas`, cada 15 minutos.

## Administración de insumos (solo administrador)
- `insumos.minimo`: cambia el mínimo de un insumo.
- `insumos.crear`: agrega un insumo nuevo (nombre, unidad, costo, mínimo y existencia inicial).
- Se audita como `insumo.minimo` e `insumo.creado`.

## Pendiente
- Notificaciones push reales en el celular (requieren otro servicio; hoy hay campana y correo).
- Editor de plantillas de checklist desde la app (hoy se editan en las hojas).
