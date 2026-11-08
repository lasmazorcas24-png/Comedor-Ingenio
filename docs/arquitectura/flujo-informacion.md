# Flujo de información

1. Encargada abre turno y caja con fondo inicial.
2. Cocina registra **corte** (kg preparados) y **uso**.
3. Producción descuenta inventario según la receta.
4. Se registran las ventas (cocina o encargada).
5. El sistema compara corte, uso y ventas y calcula la **diferencia**.
6. Diferencia fuera de rango o inventario bajo mínimo genera una **alerta**.
7. Cocina solicita insumos → encargada aprueba, rechaza o modifica → la entrada se registra en inventario.
8. Al cerrar turno se concilia caja y producción, y el turno se bloquea.
9. Los socios ven agregados, gastos y utilidad.

Cada paso escribe en `auditoria` (usuario, fecha, hora, acción, entidad, detalle).

## Fórmulas (por confirmar, ver pendientes)
- Diferencia de producción = Uso − Ventas (kg), hipótesis derivada de la pantalla de cocina (28 − 27 = +1).
- Diferencia de caja = Efectivo contado − (Fondo inicial + Ingresos − Gastos).
- Costo por porción = Σ(cantidad × costo unitario del insumo) / rendimiento.
- Utilidad estimada = Ventas − Gastos (solo socios).
