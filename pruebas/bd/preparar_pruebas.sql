-- =====================================================================
-- preparar_pruebas.sql
-- Reconstruye la base de PRUEBAS cam_test desde cero.
-- Se ejecuta como cam_admin. Por seguridad SOLO funciona en cam_test:
-- jamás borra nada en cam_db.
-- =====================================================================
\set ON_ERROR_STOP on
\encoding UTF8
DO $$
BEGIN
  IF current_database() <> 'cam_test' THEN
    RAISE EXCEPTION 'preparar_pruebas.sql solo se ejecuta en cam_test (base actual: %).', current_database();
  END IF;
END $$;

SET client_min_messages = warning;
DROP SCHEMA IF EXISTS pruebas CASCADE;
DROP SCHEMA IF EXISTS cam CASCADE;
DROP SCHEMA IF EXISTS ext CASCADE;
RESET client_min_messages;

\ir ../../sql/ejecutar_todo.sql

-- Esquema auxiliar de pruebas (solo existe en cam_test).
CREATE SCHEMA pruebas;
CREATE TABLE pruebas.resultado (
  n        int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  caso     text    NOT NULL,
  ok       boolean NOT NULL,
  detalle  text
);

-- Ejecuta una sentencia y registra si produjo EXACTAMENTE el error esperado.
CREATE FUNCTION pruebas.espera_error(p_caso text, p_sql text, p_estado text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_estado text; v_msg text;
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
  END;
  INSERT INTO pruebas.resultado (caso, ok, detalle)
  VALUES (p_caso, v_estado IS NOT DISTINCT FROM p_estado,
          CASE WHEN v_estado IS NULL THEN 'NO hubo error; se esperaba ' || p_estado
               ELSE v_estado || ' · ' || v_msg END);
END $$;

-- Registra si una condición se cumple.
CREATE FUNCTION pruebas.afirma(p_caso text, p_ok boolean, p_detalle text DEFAULT NULL) RETURNS void
LANGUAGE sql AS $$
  INSERT INTO pruebas.resultado (caso, ok, detalle) VALUES (p_caso, COALESCE(p_ok, false), p_detalle);
$$;

GRANT USAGE ON SCHEMA pruebas TO cam_app;
GRANT SELECT, INSERT ON pruebas.resultado TO cam_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pruebas TO cam_app;
