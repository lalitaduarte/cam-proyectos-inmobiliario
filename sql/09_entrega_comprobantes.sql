-- =====================================================================
-- 09_entrega_comprobantes.sql
-- Proyecto CAM · Entrega del comprobante sin correo (decisión D11).
--
-- Mientras el correo no esté configurado, la secretaria entrega el PDF en
-- persona o por WhatsApp. Este script permite REGISTRAR esa entrega, con
-- quién la registró y cuándo, para que el comprobante deje de figurar como
-- "pendiente de envío".
--
-- Reglas:
--   * Una entrega manual (PERSONAL o WHATSAPP) siempre queda como ENVIADO
--     y no lleva correo de destino. Un envío por CORREO siempre lo lleva.
--   * Solo la secretaria la registra, y solo una vez por comprobante.
--   * Como todo envío, es inmutable (trigger envio_inmutable) y se audita.
--
-- Script INCREMENTAL: se puede ejecutar varias veces y no borra ni modifica
-- registros existentes (los envíos anteriores quedan como CORREO).
-- Se ejecuta como cam_admin.
-- =====================================================================
\set ON_ERROR_STOP on
\encoding UTF8
SET search_path = cam;
SET client_min_messages = warning;

-- ---------------------------------------------------------------------
-- 1. Columnas nuevas en ENVIO_COMPROBANTE
-- ---------------------------------------------------------------------
ALTER TABLE envio_comprobante ADD COLUMN IF NOT EXISTS medio varchar(10) NOT NULL DEFAULT 'CORREO'
  CONSTRAINT envio_medio_valido CHECK (medio IN ('CORREO', 'PERSONAL', 'WHATSAPP'));
ALTER TABLE envio_comprobante ADD COLUMN IF NOT EXISTS observacion varchar(300);
ALTER TABLE envio_comprobante ALTER COLUMN correo_destino DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'envio_medio_coherente') THEN
    -- Correo <=> hay dirección de destino; la entrega manual siempre es exitosa.
    ALTER TABLE envio_comprobante ADD CONSTRAINT envio_medio_coherente
      CHECK ((medio = 'CORREO') = (correo_destino IS NOT NULL) AND (medio = 'CORREO' OR estado = 'ENVIADO'));
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 2. Vista: se agrega el medio y la fecha de la entrega exitosa.
--    (Columnas nuevas al final: las vistas que dependen de esta no cambian.)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_comprobante_detalle AS
SELECT c.*,
       CASE WHEN EXISTS (SELECT 1 FROM envio_comprobante e WHERE e.comprobante_id = c.id AND e.estado = 'ENVIADO') THEN 'ENVIADO'
            WHEN EXISTS (SELECT 1 FROM envio_comprobante e WHERE e.comprobante_id = c.id) THEN 'FALLIDO'
            ELSE 'PENDIENTE' END AS estado_envio,
       (SELECT max(e.intentado_en) FROM envio_comprobante e WHERE e.comprobante_id = c.id) AS ultimo_intento,
       ok.medio        AS medio_entrega,
       ok.intentado_en AS entregado_en
  FROM comprobante c
  LEFT JOIN LATERAL (SELECT e.medio, e.intentado_en FROM envio_comprobante e
                      WHERE e.comprobante_id = c.id AND e.estado = 'ENVIADO'
                      ORDER BY e.intentado_en LIMIT 1) ok ON true;

-- ---------------------------------------------------------------------
-- 3. Función: registrar la entrega manual.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_registrar_entrega(p_usuario_id bigint, p_comprobante_id bigint,
                                                p_medio text, p_observacion text DEFAULT NULL)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = cam, pg_temp AS $$
DECLARE
  v_id  bigint;
  v_num text;
BEGIN
  PERFORM fn_exigir_usuario(p_usuario_id, 'SECRETARIA');
  IF p_medio IS NULL OR p_medio NOT IN ('PERSONAL', 'WHATSAPP') THEN
    RAISE EXCEPTION USING ERRCODE = 'CA400', MESSAGE = 'Medio de entrega inválido: PERSONAL o WHATSAPP.';
  END IF;
  -- Bloqueo del comprobante: dos registros simultáneos no crean dos entregas.
  SELECT numero INTO v_num FROM comprobante WHERE id = p_comprobante_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'CA404', MESSAGE = 'El comprobante no existe.';
  END IF;
  IF EXISTS (SELECT 1 FROM envio_comprobante WHERE comprobante_id = p_comprobante_id AND estado = 'ENVIADO') THEN
    RAISE EXCEPTION USING ERRCODE = 'CA409', MESSAGE = 'Este comprobante ya figura como entregado.';
  END IF;
  INSERT INTO envio_comprobante (comprobante_id, medio, correo_destino, estado, observacion, intentado_por)
  VALUES (p_comprobante_id, p_medio, NULL, 'ENVIADO', NULLIF(left(btrim(p_observacion), 300), ''), p_usuario_id)
  RETURNING id INTO v_id;

  PERFORM fn_auditar(p_usuario_id, 'ENTREGAR', 'comprobante', p_comprobante_id,
          jsonb_build_object('numero', v_num, 'medio', p_medio));
  RETURN v_id;
END $$;

-- ---------------------------------------------------------------------
-- 4. Permisos de cam_app: solo mediante la función.
-- ---------------------------------------------------------------------
GRANT SELECT ON v_comprobante_detalle TO cam_app;
GRANT EXECUTE ON FUNCTION fn_registrar_entrega(bigint, bigint, text, text) TO cam_app;

-- ---------------------------------------------------------------------
-- 5. Diccionario de datos
-- ---------------------------------------------------------------------
COMMENT ON COLUMN envio_comprobante.medio IS 'Cómo se entregó: CORREO (envío real), PERSONAL o WHATSAPP (entrega manual registrada por la secretaria, D11).';
COMMENT ON COLUMN envio_comprobante.observacion IS 'Nota opcional de la entrega manual (por ejemplo, a quién se entregó).';
COMMENT ON COLUMN envio_comprobante.correo_destino IS 'Correo al que se intentó enviar. Vacío en las entregas manuales.';
COMMENT ON VIEW v_comprobante_detalle IS 'Comprobantes con su estado de envío (ENVIADO, FALLIDO o PENDIENTE sin intentos), el último intento y el medio y fecha de la entrega exitosa.';
COMMENT ON FUNCTION fn_registrar_entrega(bigint, bigint, text, text) IS
  'Registra la entrega manual de un comprobante (PERSONAL o WHATSAPP). Una sola vez por comprobante (D11).';
