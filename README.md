# Comedor Ingenio

Sistema de gestión para comedor industrial: operación diaria, producción, ventas, inventario, costos, caja, personal, reportes y auditoría.

**Estado:** Fase 0 (arquitectura y estructura). Sin código de aplicación todavía.

## Stack inicial
HTML + CSS + JavaScript (PWA, móvil primero) · Google Apps Script (API) · Google Sheets (base de datos)

## Usuarios y dispositivos
| Rol | Dispositivo | Alcance |
|---|---|---|
| Socios (3) | Celular | Vista administrativa completa |
| Encargada | Celular | Vista operativa, sin información privada de socios |
| Cocina | Pantalla táctil 7" (800×480) | Registro rápido, botones grandes |

## Estructura del repositorio
```
Comedor-Ingenio/
├── docs/            arquitectura, módulos, procesos, decisiones técnicas
├── frontend/        html, css, javascript (PWA)
├── backend/
│   └── apps-script/ API en Google Apps Script
├── database/        estructura de Google Sheets y modelos de datos
├── assets/          imágenes, diseños, referencias visuales
├── CHANGELOG.md
└── README.md
```

## Dónde empezar
1. `docs/arquitectura/arquitectura.md`
2. `docs/modulos/README.md`
3. `database/estructura-sheets.md`
4. `docs/plan-fases.md`
5. `docs/pendientes.md`

## Reglas del proyecto
- Todo cambio importante se documenta (`CHANGELOG.md` y, si es técnico, un ADR en `docs/decisiones-tecnicas/`).
- Cada módulo es independiente: se prueba y actualiza sin afectar al resto.
- Los permisos se aplican en el servidor, nunca solo en pantalla.
- Ventas, inventario y caja no se editan ni borran: se corrigen con ajustes.
- Ramas: `main` (estable), `dev` (integración), `feat/<modulo>-<descripcion>`.
- Commits: `tipo(modulo): descripción` (ej. `feat(ventas): registrar venta`).
