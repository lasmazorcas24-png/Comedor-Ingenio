# Módulo auth (v0.1.0)

## Responsabilidad
Usuarios, PIN, sesiones, permisos por rol y registro de accesos en auditoría.

## Acciones de la API
| Acción | Acceso | Descripción |
|---|---|---|
| sistema.ping | Pública | Comprueba que la API responde |
| auth.lista | Pública | Nombres de usuarios activos (sin datos sensibles) |
| auth.login | Pública | Valida nombre y PIN; devuelve token y perfil |
| auth.yo | Sesión | Perfil y permisos del usuario actual |
| auth.cambiarPin | Sesión | Cambia el PIN (obligatorio en el primer acceso) |
| auth.logout | Sesión | Cierra la sesión |

## Reglas
- PIN de 4 a 6 dígitos, guardado como SHA-256 con sal (propiedad `SAL` del proyecto Apps Script).
- 5 intentos fallidos bloquean al usuario 15 minutos.
- Sesión de 12 horas; en la hoja se guarda el hash del token, no el token.
- Mientras `debe_cambiar_pin` sea verdadero, solo se permiten acciones de auth.
- Toda acción protegida valida el permiso del rol en el servidor.
- Se auditan: login.ok, login.fallido, login.bloqueado, logout, pin.cambiado, pin.cambio_fallido, acceso.denegado.

## Despliegue del backend
El ID de la hoja NO se guarda en el repositorio. Al copiar `backend/apps-script/Codigo.gs` a Apps Script, reemplazar `PEGA_AQUI_EL_ID`. Cada versión nueva: Implementar → Administrar implementaciones → editar → Nueva versión.

## Pendiente
- Cierre automático por inactividad en la pantalla de cocina.
- Registro y bloqueo de dispositivos (hoja `dispositivos`).
- Restablecer PIN de un usuario desde el perfil de socio.

## Administración de usuarios (v0.2.0)
Solo un **socio** con `es_admin = TRUE` en la hoja `usuarios` puede usar estas acciones.

| Acción | Descripción |
|---|---|
| usuarios.listar | Usuarios y su estado (nunca PIN ni hash) |
| usuarios.crear | Crea un usuario con PIN temporal aleatorio |
| usuarios.restablecerPin | Genera PIN temporal, cierra sus sesiones y le exige cambiarlo |
| usuarios.activar | Activa o desactiva (no puede desactivarse a sí mismo) |
| auditoria.recientes | Últimos 60 registros de auditoría |

- El PIN temporal se muestra una sola vez al administrador.
- Un administrador no puede restablecer su propio PIN desde el panel.
- Todo queda en `auditoria`: usuario.creado, pin.restablecido, usuario.activado, usuario.desactivado.

## Recuperación de acceso (emergencia)
Si nadie puede entrar, el dueño de la cuenta de Google ejecuta desde el editor de Apps Script `recuperar_<Nombre>` (genera un PIN temporal y lo muestra en el Registro de ejecución) y `admin_<Nombre>` para asignar el permiso de administrador. No están expuestas por la API.
