# Módulo producción (Fase 3, backend 0.4.0)

Backend en `backend/apps-script/Fase3.gs` (archivo aparte, se registra solo en el router).

## Qué se registra
Por platillo y por turno, en kilos:
- **Corte:** kg preparados.
- **Uso:** kg servidos o utilizados.
- **Merma:** kg desechados.

Solo se controlan los platillos con `porcion_kg` mayor a 0 en `productos_menu` (peso de una porción). La bebida, por ejemplo, queda en 0.

## Fórmulas
- Ventas (kg) = platillos vendidos × `porcion_kg`.
- **Diferencia = Uso − Ventas (kg).**
- Sobrante = Corte − Uso − Merma.
- Estado: `ok` si |diferencia| ≤ `tolerancia_dif_kg` (hoja `config`, por defecto 1.5 kg); `alerta` si la supera.

## Acciones
| Acción | Permiso | Descripción |
|---|---|---|
| produccion.productos | produccion.registrar | Platillos controlados en kg (sin exponer el peso por porción) |
| produccion.registrar | produccion.registrar | Registra corte, uso o merma (turno abierto) |
| produccion.resumen | produccion.ver | Totales, detalle por platillo, registros recientes y estado |
| produccion.anular | produccion.ajustar | Anula un registro del turno abierto (solo encargada y socios) |

## Configuración (hoja `config`)
| Clave | Valor inicial | Efecto |
|---|---|---|
| tolerancia_dif_kg | 1.5 | Diferencia máxima aceptada antes de alertar |
| cocina_ve_diferencia | TRUE | Si es FALSE, la cocina no ve ventas en kg ni la diferencia |

## Pantallas
- **Cocina (800×480):** corte, uso y ventas del día, diferencia con estado y botones de corte, uso, merma y ventas.
- **Encargada:** pestaña Registrar → Producción; bloque de producción en Inicio.
- **Socios:** pestaña Reportes (detalle por platillo) y bloque en Inicio.

## Pendiente
- Descontar inventario según receta (Fase 4).
- Alertas automáticas y notificaciones (Fase 5).
- Pedir insumos desde cocina (Fase 4).
