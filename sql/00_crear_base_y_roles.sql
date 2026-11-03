-- =====================================================================
-- 00_crear_base_y_roles.sql
-- Proyecto CAM · Crea los usuarios técnicos y las bases de datos.
--
-- Se ejecuta UNA vez, como superusuario "postgres", solo en el servidor
-- local. En Neon este paso se hace desde su consola (ver docs/instalacion.md).
--
-- NO es destructivo: si los roles o las bases ya existen, no los borra.
-- Solo actualiza las contraseñas de cam_admin y cam_app con las del .env.
--
-- Las contraseñas NO están escritas aquí: se leen de variables de entorno
-- (CAM_ADMIN_PASSWORD, CAM_APP_PASSWORD) con \getenv.
-- =====================================================================
\set ON_ERROR_STOP on
\encoding UTF8
\getenv pw_admin CAM_ADMIN_PASSWORD
\getenv pw_app   CAM_APP_PASSWORD

-- ---------------------------------------------------------------------
-- 1. Roles técnicos (distintos de las cuentas de secretaria y propietarios)
--    cam_admin : dueño de los objetos. Crea tablas, vistas y funciones.
--    cam_app   : lo usa el backend. Solo tiene los permisos del script 05.
--    Ninguno es superusuario ni puede crear bases ni otros roles.
-- ---------------------------------------------------------------------
SELECT 'CREATE ROLE cam_admin' WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cam_admin') \gexec
SELECT 'CREATE ROLE cam_app'   WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cam_app')   \gexec

ALTER ROLE cam_admin WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD :'pw_admin';
ALTER ROLE cam_app   WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD :'pw_app'
                     CONNECTION LIMIT 20;

-- ---------------------------------------------------------------------
-- 2. Bases de datos
--    cam_db   : base de trabajo (datos de la aplicación).
--    cam_test : base de pruebas automáticas; se puede reconstruir sin
--               afectar cam_db.
-- ---------------------------------------------------------------------
SELECT 'CREATE DATABASE cam_db OWNER cam_admin ENCODING ''UTF8'' TEMPLATE template0'
 WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'cam_db') \gexec
SELECT 'CREATE DATABASE cam_test OWNER cam_admin ENCODING ''UTF8'' TEMPLATE template0'
 WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'cam_test') \gexec

-- Zona horaria del negocio (RN14) y esquema por defecto.
ALTER DATABASE cam_db   SET timezone = 'America/Bogota';
ALTER DATABASE cam_test SET timezone = 'America/Bogota';
ALTER ROLE cam_admin IN DATABASE cam_db   SET search_path = cam, public;
ALTER ROLE cam_admin IN DATABASE cam_test SET search_path = cam, public;
ALTER ROLE cam_app   IN DATABASE cam_db   SET search_path = cam;
ALTER ROLE cam_app   IN DATABASE cam_test SET search_path = cam;

-- Solo los roles de CAM pueden conectarse a sus bases.
REVOKE ALL ON DATABASE cam_db   FROM PUBLIC;
REVOKE ALL ON DATABASE cam_test FROM PUBLIC;
GRANT CONNECT ON DATABASE cam_db   TO cam_app;
GRANT CONNECT ON DATABASE cam_test TO cam_app;

SELECT rolname AS rol, rolsuper AS superusuario, rolcreatedb AS crea_bases, rolcreaterole AS crea_roles
  FROM pg_roles WHERE rolname LIKE 'cam%' ORDER BY 1;
