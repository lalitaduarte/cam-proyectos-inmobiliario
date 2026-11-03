-- =====================================================================
-- 00_neon_crear_base_y_roles.sql
-- Equivalente de 00_crear_base_y_roles.sql para NEON (publicación).
-- En Neon no existe el superusuario "postgres": este script se ejecuta como
-- el dueño del proyecto (neondb_owner), que puede crear roles y bases.
-- Lo ejecuta scripts/instalar_neon.js (npm.cmd run neon:instalar).
--
-- NO es destructivo: no borra roles, bases ni datos. Solo crea lo que falta
-- y fija las contraseñas de cam_admin y cam_app con las del .env.
-- Las contraseñas se leen de variables de entorno con \getenv.
-- =====================================================================
\set ON_ERROR_STOP on
\encoding UTF8
\getenv pw_admin NEON_CAM_ADMIN_PASSWORD
\getenv pw_app   NEON_CAM_APP_PASSWORD

-- 1. Roles técnicos, sin superusuario (en Neon nadie lo es).
SELECT 'CREATE ROLE cam_admin LOGIN NOCREATEDB NOCREATEROLE'
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cam_admin') \gexec
SELECT 'CREATE ROLE cam_app LOGIN NOCREATEDB NOCREATEROLE CONNECTION LIMIT 20'
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cam_app') \gexec
ALTER ROLE cam_admin WITH LOGIN PASSWORD :'pw_admin';
ALTER ROLE cam_app   WITH LOGIN PASSWORD :'pw_app';

-- El dueño del proyecto necesita poder actuar como cam_admin para crearle la base.
GRANT cam_admin TO CURRENT_USER;

-- 2. Base de datos de CAM (la base "neondb" del proyecto no se usa).
SELECT 'CREATE DATABASE cam_db OWNER cam_admin ENCODING ''UTF8'''
 WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'cam_db') \gexec

-- 3. Configuración igual a la local: hora de Colombia y esquema de trabajo.
ALTER DATABASE cam_db SET timezone = 'America/Bogota';
ALTER ROLE cam_admin IN DATABASE cam_db SET search_path = cam, public;
ALTER ROLE cam_app   IN DATABASE cam_db SET search_path = cam;

-- 4. Solo cam_app (y el dueño) pueden conectarse a cam_db.
REVOKE ALL ON DATABASE cam_db FROM PUBLIC;
GRANT CONNECT ON DATABASE cam_db TO cam_app;

SELECT rolname AS rol, rolsuper AS superusuario, rolcreatedb AS crea_bases, rolcreaterole AS crea_roles
  FROM pg_roles WHERE rolname LIKE 'cam%' ORDER BY 1;
