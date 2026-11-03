# Instalación local — CAM

Esta guía instala la aplicación en un computador con Windows para desarrollo o demostración. La publicación en Internet (Render + Neon) se documentará en la Etapa 6.

Todos los comandos se escriben en **PowerShell**, abierto en la carpeta del proyecto (`C:\Proyectos Integradores\CAM`). En PowerShell se escribe **`npm.cmd`** en lugar de `npm`, porque la directiva de ejecución de Windows suele bloquear `npm.ps1`.

## 1. Requisitos

| Programa | Versión | Para qué |
|---|---|---|
| Node.js | 22.9 o superior | Ejecuta el servidor (backend) |
| PostgreSQL | 18 | Base de datos. Se usan sus herramientas `psql`, `pg_dump` y `pg_restore` |
| Git | cualquiera reciente | Descargar el código. Git Bash ejecuta las pruebas de base de datos |
| Google Chrome | cualquiera reciente | Solo para las pruebas automáticas desde el navegador |

Para comprobarlo, escriba `node -v`, `git --version` y `& "C:\Program Files\PostgreSQL\18\bin\psql.exe" --version`.

> **Si hay varias versiones de PostgreSQL instaladas** (en este equipo hay 9.4, 13, 14, 17 y 18), cada una usa un puerto distinto. CAM usa la **18, en el puerto 5436**. Las herramientas se toman de `C:\Program Files\PostgreSQL\18\bin`. Si están en otra carpeta, indíquela en `.env` con `PG_BIN=...`.

## 2. Descargar el código e instalar dependencias

```powershell
git clone <dirección-del-repositorio> CAM
cd CAM
npm.cmd install
```

`npm.cmd install` descarga las librerías listadas en `package.json` dentro de `node_modules/`. Esa carpeta no se sube al repositorio.

## 3. Crear el archivo de configuración `.env`

El archivo `.env` guarda las contraseñas y la configuración local. **Nunca se sube al repositorio**: `.gitignore` lo excluye. La plantilla `.env.example` no contiene secretos.

```powershell
Copy-Item .env.example .env
notepad .env
```

Complete estos valores:

| Variable | Qué poner |
|---|---|
| `PG_SUPERUSER_PASSWORD` | Contraseña del usuario `postgres` de PostgreSQL 18. Solo se usa para crear los roles y las bases |
| `PGHOST`, `PGPORT` | `localhost` y `5436` |
| `CAM_DB`, `CAM_TEST_DB` | `cam_db` (trabajo) y `cam_test` (pruebas). Deben ser bases distintas |
| `CAM_ADMIN_PASSWORD`, `CAM_APP_PASSWORD` | Dos contraseñas nuevas y largas, inventadas para CAM |
| `PORT` | `3100`, el puerto de la aplicación |
| `SESSION_SECRET` | Una cadena larga y aleatoria, usada para firmar las cookies de sesión |

Para generar contraseñas y el secreto al azar, ejecute este comando una vez por valor y copie el resultado en el `.env`:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

**Usuarios técnicos de la base:** la aplicación nunca se conecta como `postgres`, y se niega a hacerlo.
- `cam_admin` es el dueño de las tablas y se usa solo para instalar y respaldar.
- `cam_app` es el usuario del backend, con permisos mínimos: no puede borrar pagos ni modificar comprobantes.

## 4. Crear la base de datos

**Opción A — con datos de DEMOSTRACIÓN**, para conocer la aplicación o presentarla:

```powershell
npm.cmd run bd:instalar
```

Crea 8 propietarios, 52 semanas, 9 adquisiciones, 54 pagos, comprobantes y ofertas, todos marcados como "DEMO" y con correos `@ejemplo.test`, que no pueden recibir mensajes. Ingreso de la secretaria: `secretaria` / `CamDemo2026!`. Ingreso de un propietario: cédula `900000101` / `Propietario2026!`.

**Opción B — base VACÍA para uso real:**

```powershell
npm.cmd run bd:instalar -- --sin-demo
```

Resultado esperado:

```
1. Roles y bases (como postgres, sql/00) … listo.
2. Estructura sin datos de demostración en "cam_db" (como cam_admin) … listo.
3. Comprobación como cam_app: 0 semanas, 0 propietarios, 0 usuarios.
```

El comando **no borra nada**. Si la base ya tiene las tablas de CAM, lo informa y se detiene.

Por dentro ejecuta:
- `sql/00_crear_base_y_roles.sql`, como `postgres`;
- `sql/ejecutar_todo.sql`, como `cam_admin`, que a su vez corre los scripts 01 a 07 en orden.

Quien prefiera `psql` puede seguir las instrucciones del encabezado de cada script.

## 5. Crear la cuenta de la secretaria (solo con la opción B)

```powershell
npm.cmd run crear-secretaria -- mrodriguez María Rodríguez
```

Escriba primero el usuario (en minúsculas y sin espacios) y luego el nombre completo, sin comillas. El comando muestra **una sola vez** una contraseña temporal: anótela. La secretaria deberá cambiarla en su primer ingreso.

En una base vacía, este comando también crea las **52 semanas** y las condiciones iniciales: **$18.000.000 en 24 cuotas de $750.000**. Las condiciones se pueden cambiar después en **Parámetros**.

## 6. Iniciar la aplicación

```powershell
npm.cmd start
```

Debe aparecer `[cam] Aplicación lista en http://localhost:3100`. Abra esa dirección en el navegador. Para detener el servidor, presione **Ctrl+C**.

Comprobación rápida: `http://localhost:3100/api/salud` debe responder `{"ok":true,"baseDatos":"conectada"}`.

Para desarrollo, `npm.cmd run dev` reinicia el servidor cada vez que cambia un archivo.

## 7. Ejecutar las pruebas

Las pruebas usan **solo la base `cam_test`** y la reconstruyen cada vez. **Nunca tocan `cam_db`.**

| Comando | Qué prueba | Resultado actual |
|---|---|---|
| `bash pruebas/bd/ejecutar_pruebas_bd.sh` *(en Git Bash)* | Reglas, permisos, triggers y concurrencia en la base | 106/106 |
| `npm.cmd test` | Backend: las solicitudes HTTP contra el servidor real | 56/56 |
| `npm.cmd run test:navegador` | Recorrido completo en Chrome sin ventana, en computador y celular | 15/15 |
| `npm.cmd run test:volumen` | Rendimiento con 200 propietarios y 1.248 cuotas | 3/3 |

Cada ejecución guarda su evidencia en `pruebas/evidencias/`.

## 8. Otros comandos

| Comando | Qué hace |
|---|---|
| `npm.cmd run respaldar` | Copia de seguridad de `cam_db` en `respaldos/` (ver [respaldo_restauracion.md](respaldo_restauracion.md)) |
| `npm.cmd run probar-restauracion` | Restaura el último respaldo en `cam_test` y lo compara con `cam_db` |
| `npm.cmd run persistencia -- antes` / `-- despues` | Prueba de persistencia tras reiniciar PostgreSQL |
| `npm.cmd run diccionario` | Regenera [diccionario_datos.md](diccionario_datos.md) leyendo la base |

## 9. Problemas frecuentes

| Mensaje | Causa y solución |
|---|---|
| `npm : No se puede cargar el archivo ... npm.ps1` | Escriba `npm.cmd` en lugar de `npm` |
| `Faltan variables en .env: ...` | Falta el archivo `.env` o alguno de sus valores (paso 3) |
| `la autentificación password falló para el usuario «postgres»` | `PG_SUPERUSER_PASSWORD` no es la contraseña de PostgreSQL **18**. Cada versión instalada tiene la suya |
| `EADDRINUSE ... 3100` | Ya hay algo usando el puerto 3100, quizá otra ventana con CAM abierto. Ciérrela o cambie `PORT` en `.env` |
| `La base ... ya tiene las tablas de CAM` | La instalación ya se había hecho. No hace falta repetirla |
| `pg_dump: error: versión del servidor no coincide` | Se usó un `pg_dump` de otra versión. Revise `PG_BIN` |
| El servidor se niega a iniciar porque el usuario es superusuario | `CAM_APP_USER` debe ser `cam_app`, nunca `postgres` ni `cam_admin` |
