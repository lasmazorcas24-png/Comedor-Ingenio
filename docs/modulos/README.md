# Módulos y responsabilidades

Cada módulo tiene su servicio (backend), sus repositorios y sus pantallas (frontend). No se llaman entre sí internamente salvo por interfaces documentadas.

| Módulo | Responsabilidad | Depende de |
|---|---|---|
| auth | Usuarios, PIN, roles, sesiones, dispositivos | core |
| turnos | Apertura, estado y cierre de turno | auth, caja, produccion |
| ventas | Registro de ventas; correcciones por ajuste | turnos, recetas |
| caja | Apertura, ingresos, gastos, cierre, diferencias | turnos |
| produccion | Corte, uso, sobrantes, mermas | recetas, inventario |
| inventario | Entradas, salidas, existencias, costos, alertas de mínimo | insumos |
| recetas | Ingredientes, cantidades, rendimiento, costo por porción | inventario |
| pedidos | Solicitud, aprobación, rechazo, modificación | inventario |
| checklists | Motor genérico: plantillas, ejecución, revisión | auth |
| alertas | Reglas que generan avisos | todos (lectura) |
| reportes | Consultas y agregados para socios y encargada | todos (lectura) |
| auditoria | Bitácora transversal | core |
| camara (futuro) | Contrato y tablas reservadas | ventas, caja |

## Estructura prevista por módulo
```
backend/apps-script/<modulo>/
  servicio.gs        reglas de negocio
  repositorio.gs     acceso a hojas
frontend/javascript/<modulo>.js
frontend/html/<modulo>.html
docs/modulos/<modulo>.md   (se crea al desarrollar el módulo)
```
