# Publicación — Render + Neon

La aplicación se publica en dos servicios gratuitos:

| Servicio | Qué aloja | Condiciones del plan gratuito (verificadas el 2026-11-03) |
|---|---|---|
| **Neon** (neon.com) | Base PostgreSQL `cam_db` | 1 GB por proyecto; 100 horas de cómputo al mes; la base **se suspende tras 5 minutos sin uso** y se reactiva sola; historial para restaurar de **6 horas** |
| **Render** (render.com) | Servidor Node.js con **HTTPS** automático | El servicio **se duerme tras 15 minutos sin tráfico** y tarda **cerca de 1 minuto** en despertar; 750 horas al mes; sin disco persistente; **puertos de correo SMTP bloqueados** |

Consecuencias para CAM:
- La primera visita tras un rato sin uso tarda alrededor de un minuto. Las siguientes son rápidas. Si la disponibilidad debe ser mayor (RNF-DIS-01, 95 %), hay que pasar a un plan de pago de Render.
- Ningún dato se guarda en el disco del servidor: todo, incluidas las sesiones, está en Neon. Por eso los reinicios de Render no pierden información.
- El envío de comprobantes por correo, cuando se configure, debe hacerse con un servicio que funcione por API (HTTPS), no por SMTP.
- El historial de Neon (6 horas) **no reemplaza** el respaldo diario: `npm.cmd run neon:respaldar`.

## Arquitectura

```
Navegador (computador o celular)
   │  HTTPS (certificado de Render)
   ▼
Render: Node.js + Express (NODE_ENV=production, cookie segura, confía en el proxy)
   │  TLS (sslmode=require, certificado verificado), usuario cam_app
   ▼
Neon: PostgreSQL, base cam_db (dueño cam_admin, sin superusuario)
```

La región de Render (`virginia`) coincide con la de Neon (AWS us-east-1), para que la base responda rápido.

## Pasos

### 1. Base de datos en Neon
1. Cree una cuenta en neon.com y un proyecto llamado `cam`, en la región **AWS US East 1 (N. Virginia)**, con la versión más reciente de PostgreSQL disponible.
2. En **Connect**, copie la cadena de conexión del dueño (`neondb_owner`) y péguela en el `.env` local, en una línea `NEON_OWNER_URL=...`. Nunca la pegue en el chat ni en un documento.
3. Ejecute `npm.cmd run neon:instalar`. El comando hace lo siguiente:
   - crea `cam_admin` y `cam_app` con contraseñas **nuevas**, distintas de las locales, y las guarda en `.env`;
   - crea la base `cam_db` **sin datos de demostración**;
   - escribe en `.env` la línea `NEON_DATABASE_URL=...`;
   - comprueba la conexión como la aplicación: usuario `cam_app`, sin superusuario, en hora de Colombia.
4. Cree la cuenta de la secretaria de producción con `npm.cmd run neon:crear-secretaria -- usuario Nombre Apellido`. Anote la contraseña temporal que aparece en pantalla.

### 2. Código en GitHub
Render publica desde un repositorio de GitHub. Se recomienda un repositorio **privado**. El archivo `.env` y los respaldos están excluidos por `.gitignore`.

### 3. Servicio web en Render
1. En render.com: **New → Blueprint** y elija el repositorio. Render lee `render.yaml`.
2. Render pide el valor de `DATABASE_URL`: pegue el valor de `NEON_DATABASE_URL` del `.env`. `SESSION_SECRET` lo genera Render.
3. Espere a que el estado sea **Live**. La dirección queda como `https://cam-proyectos-xxxx.onrender.com`.

### 4. Comprobaciones después de publicar
- `https://.../api/salud` responde `{"ok":true,"baseDatos":"conectada"}`.
- La dirección `http://` redirige a `https://`, y la cookie de sesión es `Secure`.
- La secretaria ingresa, cambia la contraseña temporal y registra datos.
- Desde un **teléfono** con datos móviles (otra red), se abre la aplicación y se ven los mismos datos (CP14).

## Mantenimiento

| Tarea | Cómo |
|---|---|
| Publicar una nueva versión | Subir los cambios a GitHub (`git push`). Render vuelve a publicar solo |
| Respaldar la base publicada | `npm.cmd run neon:respaldar` (crea `respaldos/neon_cam_db_*.dump`) |
| Ver los registros del servidor | Panel de Render → el servicio → **Logs** |
| Cambiar un secreto | Panel de Render → **Environment**. El servicio se reinicia solo |
