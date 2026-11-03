-- =====================================================================
-- 01_esquemas.sql
-- Proyecto CAM · Esquemas y extensiones.
-- Se ejecuta como cam_admin (dueño de la base), sobre una base vacía.
-- =====================================================================
\set ON_ERROR_STOP on
\encoding UTF8

-- Esquema "cam": aquí viven todas las tablas, vistas y funciones del negocio.
-- Separarlo de "public" permite dar permisos precisos al usuario de la aplicación.
CREATE SCHEMA IF NOT EXISTS cam AUTHORIZATION cam_admin;

-- Esquema "ext": extensiones de PostgreSQL.
-- pgcrypto se usa solo para generar el hash bcrypt de las cuentas de demostración
-- (script 06). El backend calcula sus propios hash con bcrypt.
CREATE SCHEMA IF NOT EXISTS ext AUTHORIZATION cam_admin;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA ext;

-- Nadie más puede crear objetos en el esquema public.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

COMMENT ON SCHEMA cam IS 'Objetos del negocio CAM: semanas, adquisiciones, pagos, comprobantes y comunidad.';
COMMENT ON SCHEMA ext IS 'Extensiones de PostgreSQL usadas por CAM (pgcrypto).';
