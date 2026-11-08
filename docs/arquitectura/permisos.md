# Permisos por rol

| Función | Socios | Encargada | Cocina |
|---|---|---|---|
| Utilidad y participación | ✅ | ❌ | ❌ |
| Gastos totales y compras | ✅ | Solo los del turno (por confirmar) | ❌ |
| Ventas | Ver | Registrar y ver | Registrar |
| Caja | Ver | Operar y cerrar | ❌ |
| Producción | Ver | Ver y ajustar | Registrar |
| Inventario | Ver | Ajustar | Solo consumo |
| Pedidos internos | Ver | Aprobar, rechazar, modificar | Solicitar |
| Checklists | Ver | Ver y revisar | Ejecutar los suyos |
| Auditoría | ✅ | ❌ | ❌ |
| Usuarios y dispositivos | ✅ | ❌ | ❌ |

Implementación: hoja `roles_permisos` con pares `rol, accion`; el router valida antes de despachar y los servicios filtran campos sensibles en la respuesta.

## Ajustes sobre las interfaces iniciales
- Encargada: se retira "Utilidad Estimada" y "Utilidad" del resumen; se sustituyen por Diferencia de caja y Pedidos pendientes.
- Encargada: se añaden Caja, Pedidos, Checklists y Cierre de turno.
- Cocina: se añade botón "Pedir insumos" e indicador de pendientes.
- Socios: se añade acceso visible a Participación de socios.
