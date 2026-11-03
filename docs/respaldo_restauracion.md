# Respaldo y restauración — CAM

Procedimiento para cumplir **RNF-FIA-02**: debe existir una copia de respaldo periódica y una restauración exitosa comprobada antes de la entrega.

## Resumen

| Qué | Comando (PowerShell, en la carpeta CAM) | Frecuencia |
|---|---|---|
| Hacer una copia de seguridad | `npm.cmd run respaldar` | **Diaria**, al terminar la jornada, y siempre antes de cualquier cambio a la base |
| Comprobar que la copia sirve | `npm.cmd run probar-restauracion` | Mensual, y antes de la entrega |
| Restaurar de verdad, tras una pérdida | Procedimiento manual de la sección 4 | Solo en una emergencia |

## 1. Cómo funciona el respaldo

`npm.cmd run respaldar` usa **`pg_dump` de PostgreSQL 18**, conectado como `cam_admin`. El programa:

- crea el archivo `respaldos/cam_db_AAAA-MM-DD_HHMM.dump`, comprimido, en el formato "custom" de PostgreSQL;
- incluye los esquemas `cam` y `ext`: tablas, datos, vistas, funciones, triggers y permisos;
- **no incluye** las sesiones abiertas: tras restaurar, cada persona vuelve a iniciar sesión;
- **solo lee** la base: no modifica nada;
- al terminar, comprueba que el archivo se puede leer y muestra un resumen.

Resultado obtenido el 2026-11-03:

```
Respaldando la base "cam_db" …
Listo en 2.9 s.
Archivo: respaldos\cam_db_2026-11-03_0608.dump (112 KB, datos de 13 tablas)
Contenido: 8 propietarios, 54 pagos, 11 comprobantes
```

**Dónde guardar las copias:**
- La carpeta `respaldos/` está **excluida de Git**, porque contiene datos personales (Ley 1581) y contraseñas cifradas. Nunca suba un respaldo a GitHub.
- Una copia que vive solo en el mismo computador no protege contra un daño del disco. Copie periódicamente el archivo `.dump` más reciente a una ubicación **externa y privada**: una memoria USB guardada en la oficina o una carpeta personal en la nube con acceso restringido.
- Sugerencia de retención: conservar los últimos 7 respaldos diarios y uno por mes.

**Respaldo automático diario (opcional):** desde el *Programador de tareas* de Windows, cree una tarea diaria que ejecute en la carpeta CAM el programa `C:\Program Files\nodejs\npm.cmd` con los argumentos `run respaldar`.

## 2. Comprobar que la copia sirve (restauración de prueba)

`npm.cmd run probar-restauracion` toma el respaldo más reciente o el que se indique (`npm.cmd run probar-restauracion -- respaldos\archivo.dump`) y:

1. vacía la base de **pruebas** `cam_test`. **Nunca** toca `cam_db`;
2. restaura en ella el respaldo con `pg_restore` en una sola transacción: o se restaura todo, o no se restaura nada;
3. compara **tabla por tabla** con `cam_db`, contando las filas y calculando una huella (`md5`) de todo el contenido;
4. compara la cantidad de vistas, funciones y triggers, y verifica que los permisos de `cam_app` se restauraron;
5. guarda la evidencia en `pruebas/evidencias/restauracion_*.txt`.

Resultado obtenido el 2026-11-03 (evidencia `restauracion_2026-11-03_0609.txt`):

```
IGUAL      adquisicion                   9 filas
IGUAL      auditoria                   132 filas
IGUAL      comprobante                  11 filas
… (13 tablas)
Objetos en cam_db:   10 vistas, 23 funciones, 7 triggers
Objetos en cam_test: 10 vistas, 23 funciones, 7 triggers
Permisos de cam_app restaurados (lee pagos, no puede borrarlos): sí
RESULTADO: RESTAURACIÓN CORRECTA — 13/13 tablas idénticas.
```

Además, se inició la aplicación conectada a la base restaurada. La secretaria pudo ingresar, y el panel mostró las mismas cifras que la base original ($36.000.000 verificados).

Si alguien usa la aplicación entre el respaldo y la prueba, aparecerán diferencias. Son esperables: haga un respaldo nuevo y repita la prueba.

## 3. Respaldo de la base publicada (Neon)

Se completará en la Etapa 6. La idea es usar el mismo `pg_dump` 18 con la cadena de conexión de Neon, que exige `sslmode=require`, guardada en el `.env` y nunca escrita en el chat ni en un documento. Neon también conserva un historial para restaurar la base a un momento anterior. Su duración depende del plan, y se verificará en la documentación oficial durante la Etapa 6.

## 4. Restauración real, tras una pérdida de datos

Úsela solo si `cam_db` se dañó o perdió datos. **Restaurar reemplaza el contenido actual por el de la copia**: se pierde todo lo registrado después del respaldo. Por eso se restaura en una base **nueva**, se revisa y solo entonces se cambia la aplicación hacia ella.

1. **Detenga la aplicación**, con Ctrl+C en la ventana de `npm.cmd start`.
2. **Respalde el estado actual**, aunque esté dañado: `npm.cmd run respaldar`. Así nada se pierde de forma irreversible.
3. **Cree una base nueva y vacía**, por ejemplo `cam_db_restaurada`. Como `postgres`, en pgAdmin o en `psql` del servidor 18, ejecute:
   ```sql
   CREATE DATABASE cam_db_restaurada OWNER cam_admin ENCODING 'UTF8' TEMPLATE template0;
   ALTER DATABASE cam_db_restaurada SET timezone = 'America/Bogota';
   ALTER ROLE cam_admin IN DATABASE cam_db_restaurada SET search_path = cam, public;
   ALTER ROLE cam_app   IN DATABASE cam_db_restaurada SET search_path = cam;
   REVOKE ALL ON DATABASE cam_db_restaurada FROM PUBLIC;
   GRANT CONNECT ON DATABASE cam_db_restaurada TO cam_app;
   ```
4. **Restaure la copia** como `cam_admin`. PowerShell pedirá la contraseña de `cam_admin`, que está en el `.env`:
   ```powershell
   & "C:\Program Files\PostgreSQL\18\bin\pg_restore.exe" -h localhost -p 5436 -U cam_admin `
     --exit-on-error --single-transaction --dbname cam_db_restaurada respaldos\cam_db_AAAA-MM-DD_HHMM.dump
   ```
5. **Revise los datos**: abra una sesión de prueba cambiando temporalmente `CAM_DB=cam_db_restaurada` en el `.env` y ejecute `npm.cmd start`. Revise el panel, algunos propietarios y los últimos pagos.
6. Si todo está bien, **deje `CAM_DB=cam_db_restaurada`** en el `.env` de forma definitiva. La base dañada se conserva sin tocar hasta estar seguros. Nunca se borra en el mismo día.
7. Anote en la bitácora la fecha, el archivo restaurado y quién lo hizo.

> **Procedimiento probado el 2026-11-03.** Los pasos 3 a 5 se ejecutaron sobre una base temporal `cam_db_restaurada`: la aplicación inició sobre ella, la secretaria ingresó y se vieron los 54 pagos y $36.000.000 verificados. Luego se eliminó la base temporal.
>
> El paso 3 es igual a lo que hace `sql/00_crear_base_y_roles.sql` para `cam_db`. Si cambia la configuración de la base en ese script, actualice también este procedimiento.

## 5. Qué NO hacer

- No restaurar directamente encima de `cam_db` con `--clean`: si el archivo está incompleto, se pierden los datos actuales.
- No usar el `pg_dump` de otra versión de PostgreSQL. En este equipo, el `psql` que aparece primero es la versión 14, que no puede respaldar un servidor 18.
- No enviar los respaldos por correo ni subirlos al repositorio.
