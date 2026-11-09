# Módulos inventario, recetas y pedidos internos (Fase 4, backend 0.5.0)

Backend en `backend/apps-script/Fase4.gs` (archivo aparte; requiere Fase2 y Fase3 cargadas antes).

## Inventario
- Las existencias **no se escriben**: se calculan sumando los movimientos activos de `inv_movimientos` (entrada +, salida −, consumo −, ajuste ±).
- Un insumo está **bajo el mínimo** si existencia ≤ `minimo` (o es negativa cuando el mínimo es 0). Se avisa en Inicio e Inventario.
- La encargada registra entradas, salidas (con motivo) y conteos físicos (ajuste, con motivo). Cocina no mueve inventario directamente.
- Los **costos y el valor del inventario solo los reciben los socios**; el servidor no los envía a otros roles.

## Recetas y costos
- Hojas `recetas` y `receta_ingredientes`: una receta por platillo, con `rendimiento` (porciones por lote) y la cantidad de cada insumo por lote.
- Costo por porción = Σ(cantidad × costo del insumo) / rendimiento. Margen = precio − costo por porción.
- Solo los socios ven recetas y márgenes (Reportes → Recetas). Se editan en las hojas.

## Producción → inventario
- **Platillos controlados en kg** (`porcion_kg` > 0): al registrar un **corte**, se descuentan los insumos: porciones = kg ÷ `porcion_kg`; lotes = porciones ÷ rendimiento. Si no hay receta, el corte se guarda y se avisa "sin receta".
- **Platillos sin kg** (ej. bebida): se descuentan al **vender**.
- Anular un corte devuelve los insumos; anular una venta de esos platillos los devuelve también.
- El uso y la merma de producción no mueven inventario.

## Pedidos internos
`pendiente → aprobado → recibido`, o `pendiente → rechazado`.

| Acción | Permiso | Descripción |
|---|---|---|
| pedidos.catalogo | pedidos.solicitar | Insumos disponibles (sin costos) |
| pedidos.crear | pedidos.solicitar | Cocina pide insumos y cantidades |
| pedidos.lista | pedidos.ver | Pedidos recientes y conteos |
| pedidos.resolver | pedidos.aprobar | Aprueba (puede modificar cantidades) o rechaza con motivo |
| pedidos.recibir | pedidos.aprobar | Registra las entradas al inventario con la cantidad aprobada |

## Otras acciones
inventario.lista (inventario.ver), inventario.movimiento (inventario.ajustar), recetas.lista (solo socios).

## Pendiente
- Editor de recetas e insumos desde la app (hoy se editan en las hojas).
- Alertas automáticas y notificaciones (Fase 5).
- Costo promedio ponderado y compras con proveedor.
- Con mucho volumen, archivar movimientos por mes.
