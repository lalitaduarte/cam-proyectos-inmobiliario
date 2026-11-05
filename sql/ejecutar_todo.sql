-- =====================================================================
-- ejecutar_todo.sql  ·  Script maestro (RNF-MAN-01)
-- Crea toda la estructura de CAM en una base VACÍA, en orden.
-- Se ejecuta como cam_admin, conectado a la base de destino:
--
--   psql -h localhost -p 5436 -U cam_admin -d cam_db -f sql/ejecutar_todo.sql
--
-- Para crear la estructura SIN datos de demostración:
--   psql ... -v sin_demo=1 -f sql/ejecutar_todo.sql
--
-- Antes, una sola vez y como postgres: sql/00_crear_base_y_roles.sql
-- =====================================================================
\set ON_ERROR_STOP on
\encoding UTF8
\echo '== 01 esquemas'
\ir 01_esquemas.sql
\echo '== 02 tablas'
\ir 02_tablas.sql
\echo '== 03 vistas'
\ir 03_vistas.sql
\echo '== 04 funciones y triggers'
\ir 04_funciones.sql
\echo '== 05 roles y privilegios'
\ir 05_roles_privilegios.sql
\if :{?sin_demo}
  \echo '== 06 datos demo: OMITIDO'
\else
  \echo '== 06 datos demo'
  \ir 06_datos_demo.sql
\endif
\echo '== 07 comentarios (diccionario de datos)'
\ir 07_comentarios.sql
\echo '== 08 transferencias de titular y auditoría'
\ir 08_transferencias_auditoria.sql
\echo '== 09 entrega de comprobantes sin correo'
\ir 09_entrega_comprobantes.sql
\echo '== Listo'
