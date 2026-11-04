-- =====================================================================
-- 08_transferencias_auditoria.sql
-- Proyecto CAM · Cambio de titular (cesión, venta, intercambio) y consulta
-- de la auditoría.
--
-- Regla de negocio aprobada (2026-11-04, decisión D16):
--   Cuando un propietario cede, vende o intercambia su semana, el NUEVO
--   TITULAR ASUME EL SALDO. Los pagos ya hechos quedan en el historial del
--   titular anterior y cuentan para el plan; el nuevo titular paga solo las
--   cuotas que faltan. Ninguna cuota se cobra dos veces.
--
-- Cómo se guarda:
--   * La adquisición del titular anterior pasa a TRANSFERIDA, con fecha de fin.
--   * Se crea una adquisición NUEVA para el nuevo titular, con las MISMAS
--     condiciones económicas y un enlace a la anterior (adquisicion_anterior_id).
--   * El estado de cuenta suma los pagos de toda la cadena de titulares.
--
-- Este script es INCREMENTAL y se puede ejecutar varias veces: sirve para
-- una instalación nueva (lo llama ejecutar_todo.sql) y para actualizar una
-- base que ya tiene datos (no borra ni modifica registros existentes).
-- Se ejecuta como cam_admin.
-- =====================================================================
\set ON_ERROR_STOP on
\encoding UTF8
SET search_path = cam;
SET client_min_messages = warning;

-- ---------------------------------------------------------------------
-- 1. Columnas nuevas en ADQUISICION (las filas existentes quedan como
--    'ASIGNACION', sin adquisición anterior).
-- ---------------------------------------------------------------------
ALTER TABLE adquisicion ADD COLUMN IF NOT EXISTS origen varchar(12) NOT NULL DEFAULT 'ASIGNACION'
  CONSTRAINT adquisicion_origen_valido CHECK (origen IN ('ASIGNACION', 'VENTA', 'CESION', 'INTERCAMBIO', 'OTRO'));
ALTER TABLE adquisicion ADD COLUMN IF NOT EXISTS adquisicion_anterior_id bigint
  CONSTRAINT adquisicion_anterior_fk REFERENCES adquisicion (id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'adquisicion_origen_coherente') THEN
    -- Una asignación no tiene anterior; una transferencia siempre lo tiene.
    ALTER TABLE adquisicion ADD CONSTRAINT adquisicion_origen_coherente
      CHECK ((origen = 'ASIGNACION') = (adquisicion_anterior_id IS NULL));
  END IF;
END $$;
-- Una adquisición se transfiere una sola vez (tiene como máximo un sucesor).
CREATE UNIQUE INDEX IF NOT EXISTS adquisicion_anterior_uq ON adquisicion (adquisicion_anterior_id)
  WHERE adquisicion_anterior_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- 2. LINAJE: cada adquisición con ella misma (nivel 0) y sus anteriores
--    (nivel 1 = titular inmediatamente anterior, 2 = el de antes, ...).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_linaje(p_adquisicion_id bigint)
RETURNS TABLE (ancestro_id bigint, nivel int)
LANGUAGE sql STABLE SET search_path = cam, pg_temp AS $$
  WITH RECURSIVE l AS (
    SELECT id AS ancestro_id, adquisicion_anterior_id AS siguiente, 0 AS nivel
      FROM adquisicion WHERE id = p_adquisicion_id
    UNION ALL
    SELECT a.id, a.adquisicion_anterior_id, l.nivel + 1
      FROM l JOIN adquisicion a ON a.id = l.siguiente
  )
  SELECT ancestro_id, nivel FROM l;
$$;
REVOKE ALL ON FUNCTION fn_linaje(bigint) FROM PUBLIC;

CREATE OR REPLACE VIEW v_adquisicion_linaje AS
WITH RECURSIVE l AS (
  SELECT id AS adquisicion_id, id AS ancestro_id, adquisicion_anterior_id AS siguiente, 0 AS nivel
    FROM adquisicion
  UNION ALL
  SELECT l.adquisicion_id, a.id, a.adquisicion_anterior_id, l.nivel + 1
    FROM l JOIN adquisicion a ON a.id = l.siguiente
)
SELECT adquisicion_id, ancestro_id, nivel FROM l;

-- ---------------------------------------------------------------------
-- 3. Vistas de saldo: ahora suman los pagos de TODA la cadena de titulares.
--    Se conservan los nombres y el orden de las columnas existentes
--    (las pantallas y reportes no cambian) y se agregan columnas al final.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_totales_adquisicion AS
SELECT l.adquisicion_id,
       count(*)                                                       AS cuotas_registradas,
       count(*) FILTER (WHERE p.estado = 'VERIFICADO')                AS cuotas_verificadas,
       COALESCE(sum(p.valor), 0)                                      AS total_registrado,
       COALESCE(sum(p.valor) FILTER (WHERE p.estado = 'VERIFICADO'), 0) AS total_verificado,
       count(*) FILTER (WHERE p.estado = 'VERIFICADO' AND l.nivel > 0) AS cuotas_heredadas,
       COALESCE(sum(p.valor) FILTER (WHERE p.estado = 'VERIFICADO' AND l.nivel > 0), 0) AS total_heredado
  FROM v_adquisicion_linaje l
  JOIN pago p ON p.adquisicion_id = l.ancestro_id
 WHERE p.estado <> 'ANULADO'
 GROUP BY l.adquisicion_id;

CREATE OR REPLACE VIEW v_estado_cuenta AS
SELECT a.id                    AS adquisicion_id,
       a.propietario_id,
       pr.cedula,
       pr.nombre_completo,
       pr.correo,
       a.semana_id,
       s.numero                AS semana_numero,
       a.fecha_adquisicion,
       a.estado_titularidad,
       a.valor_accion,
       a.numero_cuotas,
       a.valor_cuota,
       COALESCE(t.cuotas_registradas, 0)                              AS cuotas_registradas,
       COALESCE(t.cuotas_verificadas, 0)                              AS cuotas_pagadas,
       COALESCE(t.cuotas_registradas, 0) - COALESCE(t.cuotas_verificadas, 0) AS cuotas_por_verificar,
       a.numero_cuotas - COALESCE(t.cuotas_verificadas, 0)            AS cuotas_pendientes,
       a.numero_cuotas - COALESCE(t.cuotas_registradas, 0)            AS cuotas_sin_registrar,
       COALESCE(t.total_registrado, 0)                                AS total_registrado,
       COALESCE(t.total_verificado, 0)                                AS total_abonado,
       a.valor_accion - COALESCE(t.total_verificado, 0)               AS saldo,
       CASE WHEN COALESCE(t.cuotas_verificadas, 0) >= a.numero_cuotas
            THEN 'PAGADA' ELSE 'EN_CURSO' END                          AS situacion_pago,
       a.fecha_fin_titularidad,
       a.origen,
       a.adquisicion_anterior_id,
       COALESCE(t.cuotas_heredadas, 0)                                AS cuotas_heredadas,
       COALESCE(t.total_heredado, 0)                                  AS total_heredado
  FROM adquisicion a
  JOIN propietario pr ON pr.id = a.propietario_id
  JOIN semana s       ON s.id  = a.semana_id
  LEFT JOIN v_totales_adquisicion t ON t.adquisicion_id = a.id;

CREATE OR REPLACE VIEW v_plan_cuotas AS
SELECT a.id AS adquisicion_id,
       c.numero_cuota,
       a.valor_cuota,
       p.id         AS pago_id,
       p.fecha_pago,
       p.estado     AS estado_pago,
       CASE WHEN p.id IS NULL              THEN 'PENDIENTE'
            WHEN p.estado = 'VERIFICADO'   THEN 'PAGADA'
            ELSE 'POR_VERIFICAR' END       AS situacion_cuota,
       cp.numero    AS comprobante_numero,
       (l.nivel > 0) AS de_titular_anterior
  FROM adquisicion a
 CROSS JOIN LATERAL generate_series(1, a.numero_cuotas) AS c(numero_cuota)
  LEFT JOIN (pago p JOIN v_adquisicion_linaje l ON l.ancestro_id = p.adquisicion_id)
         ON l.adquisicion_id = a.id AND p.numero_cuota = c.numero_cuota AND p.estado <> 'ANULADO'
  LEFT JOIN comprobante cp ON cp.pago_id = p.id;

-- Historial de titulares de cada semana (de la más reciente a la más antigua).
CREATE OR REPLACE VIEW v_historial_titulares AS
SELECT a.semana_id,
       s.numero                AS semana_numero,
       a.id                    AS adquisicion_id,
       a.origen,
       a.fecha_adquisicion,
       a.fecha_fin_titularidad,
       a.estado_titularidad,
       a.propietario_id,
       pr.nombre_completo,
       pr.cedula,
       a.adquisicion_anterior_id,
       ant.nombre_completo     AS titular_anterior,
       a.observacion
  FROM adquisicion a
  JOIN semana s       ON s.id  = a.semana_id
  JOIN propietario pr ON pr.id = a.propietario_id
  LEFT JOIN adquisicion aa  ON aa.id  = a.adquisicion_anterior_id
  LEFT JOIN propietario ant ON ant.id = aa.propietario_id;

-- Auditoría con el nombre de quien hizo cada acción (pantalla de auditoría).
CREATE OR REPLACE VIEW v_auditoria_detalle AS
SELECT au.id,
       au.ocurrido_en,
       au.usuario_id,
       COALESCE(u.nombre, pr.nombre_completo) AS usuario_nombre,
       u.login   AS usuario_login,
       u.rol     AS usuario_rol,
       au.accion,
       au.tabla,
       au.registro_id,
       au.detalle
  FROM auditoria au
  LEFT JOIN usuario u      ON u.id  = au.usuario_id
  LEFT JOIN propietario pr ON pr.id = u.propietario_id;   -- las cuentas de propietario no guardan nombre propio

-- ---------------------------------------------------------------------
-- 4. CAMBIO DE TITULAR
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_transferir_titularidad(p_usuario_id bigint, p_adquisicion_id bigint,
                                                     p_nuevo_propietario_id bigint, p_fecha date,
                                                     p_tipo text, p_observacion text)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = cam, pg_temp AS $$
DECLARE
  v_adq        adquisicion;
  v_nuevo      propietario;
  v_anterior   propietario;
  v_semana     smallint;
  v_sin_verif  int;
  v_ec         v_estado_cuenta;
  v_ofertas    int;
  v_id         bigint;
BEGIN
  PERFORM fn_exigir_usuario(p_usuario_id, 'SECRETARIA');

  -- Bloquea la adquisición: dos transferencias simultáneas se atienden en fila
  -- y la segunda encuentra la semana ya transferida.
  SELECT * INTO v_adq FROM adquisicion WHERE id = p_adquisicion_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'CA404', MESSAGE = 'La adquisición no existe.'; END IF;
  IF v_adq.estado_titularidad <> 'VIGENTE' THEN
    RAISE EXCEPTION USING ERRCODE = 'CA409', MESSAGE = 'Esta adquisición ya fue transferida; solo se transfiere la del titular actual.';
  END IF;

  IF p_tipo IS NULL OR p_tipo NOT IN ('VENTA', 'CESION', 'INTERCAMBIO', 'OTRO') THEN
    RAISE EXCEPTION USING ERRCODE = 'CA400', MESSAGE = 'El tipo debe ser VENTA, CESION, INTERCAMBIO u OTRO.';
  END IF;

  SELECT * INTO v_nuevo FROM propietario WHERE id = p_nuevo_propietario_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'CA404', MESSAGE = 'El nuevo titular no existe.'; END IF;
  IF NOT v_nuevo.activo THEN RAISE EXCEPTION USING ERRCODE = 'CA409', MESSAGE = 'El nuevo titular está inactivo.'; END IF;
  IF v_nuevo.id = v_adq.propietario_id THEN
    RAISE EXCEPTION USING ERRCODE = 'CA409', MESSAGE = 'El nuevo titular es el mismo titular actual.';
  END IF;

  IF p_fecha IS NULL OR p_fecha > current_date THEN
    RAISE EXCEPTION USING ERRCODE = 'CA400', MESSAGE = 'La fecha de la transferencia es obligatoria y no puede ser futura.';
  END IF;
  IF p_fecha < v_adq.fecha_adquisicion THEN
    RAISE EXCEPTION USING ERRCODE = 'CA400', MESSAGE = 'La fecha de la transferencia no puede ser anterior a la adquisición del titular actual.';
  END IF;
  IF p_observacion IS NULL OR length(btrim(p_observacion)) < 5 THEN
    RAISE EXCEPTION USING ERRCODE = 'CA400', MESSAGE = 'Escriba el soporte de la transferencia (mínimo 5 caracteres), por ejemplo el número del contrato o documento.';
  END IF;

  -- Los pagos sin verificar deben resolverse antes: si no, no se sabría
  -- a quién se le abona ni cuánto saldo asume el nuevo titular.
  SELECT count(*) INTO v_sin_verif FROM pago WHERE adquisicion_id = p_adquisicion_id AND estado = 'NO_VERIFICADO';
  IF v_sin_verif > 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'CA409',
      MESSAGE = format('El titular actual tiene %s pago(s) sin verificar. Verifíquelos o anúlelos antes de transferir.', v_sin_verif);
  END IF;
  IF EXISTS (SELECT 1 FROM pago WHERE adquisicion_id = p_adquisicion_id AND estado <> 'ANULADO' AND fecha_pago > p_fecha) THEN
    RAISE EXCEPTION USING ERRCODE = 'CA400', MESSAGE = 'Hay pagos del titular actual con fecha posterior a la transferencia. Revise la fecha.';
  END IF;

  SELECT * INTO v_ec FROM v_estado_cuenta WHERE adquisicion_id = p_adquisicion_id;
  SELECT * INTO v_anterior FROM propietario WHERE id = v_adq.propietario_id;
  SELECT numero INTO v_semana FROM semana WHERE id = v_adq.semana_id;

  -- 1) Cierra la titularidad actual (primero, por el índice de un solo titular vigente).
  UPDATE adquisicion SET estado_titularidad = 'TRANSFERIDA', fecha_fin_titularidad = p_fecha
   WHERE id = p_adquisicion_id;

  -- 2) Las ofertas activas de la semana se cierran: concretadas si fue venta
  --    o intercambio; retiradas en los demás casos.
  UPDATE oferta SET estado = CASE WHEN p_tipo IN ('VENTA', 'INTERCAMBIO') THEN 'CONCRETADA' ELSE 'RETIRADA' END,
                    cerrada_en = now(), cerrada_por = p_usuario_id
   WHERE adquisicion_id = p_adquisicion_id AND estado = 'ACTIVA';
  GET DIAGNOSTICS v_ofertas = ROW_COUNT;

  -- 3) Nueva adquisición con las MISMAS condiciones: el nuevo titular asume el saldo.
  INSERT INTO adquisicion (propietario_id, semana_id, fecha_adquisicion, parametro_id,
                           valor_accion, numero_cuotas, valor_cuota, observacion, creado_por,
                           origen, adquisicion_anterior_id)
  VALUES (v_nuevo.id, v_adq.semana_id, p_fecha, v_adq.parametro_id,
          v_adq.valor_accion, v_adq.numero_cuotas, v_adq.valor_cuota, btrim(p_observacion), p_usuario_id,
          p_tipo, p_adquisicion_id)
  RETURNING id INTO v_id;

  PERFORM fn_auditar(p_usuario_id, 'TRANSFERIR', 'adquisicion', p_adquisicion_id,
          jsonb_build_object('nueva_adquisicion_id', v_id, 'semana', v_semana, 'tipo', p_tipo, 'fecha', p_fecha,
                             'de', v_anterior.nombre_completo, 'a', v_nuevo.nombre_completo,
                             'cuotas_pagadas', v_ec.cuotas_pagadas, 'saldo_asumido', v_ec.saldo,
                             'ofertas_cerradas', v_ofertas, 'soporte', btrim(p_observacion)));
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION fn_transferir_titularidad(bigint, bigint, bigint, date, text, text) FROM PUBLIC;

-- ---------------------------------------------------------------------
-- 5. Reglas existentes ajustadas a la cadena de titulares.
-- ---------------------------------------------------------------------

-- Registrar pago: la cuota no puede estar pagada en NINGUNA adquisición de la cadena.
CREATE OR REPLACE FUNCTION fn_registrar_pago(p_usuario_id bigint, p_adquisicion_id bigint, p_numero_cuota int,
                                  p_valor numeric, p_fecha_pago date, p_referencia text DEFAULT NULL)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = cam, pg_temp AS $$
DECLARE
  v_adq adquisicion;
  v_id  bigint;
BEGIN
  PERFORM fn_exigir_usuario(p_usuario_id, 'SECRETARIA');

  -- Bloqueo de la adquisición: dos registros simultáneos se atienden en fila.
  SELECT * INTO v_adq FROM adquisicion WHERE id = p_adquisicion_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'CA404', MESSAGE = 'La adquisición no existe.';
  END IF;
  IF v_adq.estado_titularidad <> 'VIGENTE' THEN
    RAISE EXCEPTION USING ERRCODE = 'CA409', MESSAGE = 'La adquisición no está vigente; no admite pagos.';
  END IF;
  IF p_numero_cuota IS NULL OR p_numero_cuota < 1 OR p_numero_cuota > v_adq.numero_cuotas THEN
    RAISE EXCEPTION USING ERRCODE = 'CA400',
      MESSAGE = format('La cuota debe estar entre 1 y %s.', v_adq.numero_cuotas);
  END IF;
  IF p_valor IS NULL OR p_valor <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'CA400', MESSAGE = 'El valor del pago debe ser mayor que cero.';
  END IF;
  -- Supuesto D5: un pago cubre exactamente una cuota completa.
  IF p_valor <> v_adq.valor_cuota THEN
    RAISE EXCEPTION USING ERRCODE = 'CA400',
      MESSAGE = format('El valor debe ser el de la cuota completa: %s.', fn_pesos(v_adq.valor_cuota));
  END IF;
  IF p_fecha_pago IS NULL OR p_fecha_pago > current_date THEN
    RAISE EXCEPTION USING ERRCODE = 'CA400', MESSAGE = 'La fecha del pago es obligatoria y no puede ser futura.';
  END IF;
  IF p_fecha_pago < v_adq.fecha_adquisicion THEN
    RAISE EXCEPTION USING ERRCODE = 'CA400', MESSAGE = 'La fecha del pago no puede ser anterior a la fecha de adquisición.';
  END IF;
  IF EXISTS (SELECT 1 FROM pago WHERE adquisicion_id = p_adquisicion_id
                                  AND numero_cuota = p_numero_cuota AND estado <> 'ANULADO') THEN
    RAISE EXCEPTION USING ERRCODE = 'CA409',
      MESSAGE = format('La cuota %s de esta adquisición ya tiene un pago registrado.', p_numero_cuota);
  END IF;
  IF EXISTS (SELECT 1 FROM pago p JOIN fn_linaje(p_adquisicion_id) l ON l.ancestro_id = p.adquisicion_id
              WHERE l.nivel > 0 AND p.numero_cuota = p_numero_cuota AND p.estado <> 'ANULADO') THEN
    RAISE EXCEPTION USING ERRCODE = 'CA409',
      MESSAGE = format('La cuota %s ya la pagó un titular anterior de esta semana.', p_numero_cuota);
  END IF;

  -- Usuario y fecha de registro los pone el servidor (RN13).
  INSERT INTO pago (adquisicion_id, numero_cuota, valor, fecha_pago, referencia, registrado_por)
  VALUES (p_adquisicion_id, p_numero_cuota, p_valor, p_fecha_pago, NULLIF(btrim(p_referencia), ''), p_usuario_id)
  RETURNING id INTO v_id;

  PERFORM fn_auditar(p_usuario_id, 'REGISTRAR', 'pago', v_id,
          jsonb_build_object('adquisicion_id', p_adquisicion_id, 'cuota', p_numero_cuota, 'valor', p_valor));
  RETURN v_id;
END $$;

-- Los pagos de un titular anterior ya no se modifican: cambiarlos alteraría
-- el saldo que asumió el nuevo titular.
CREATE OR REPLACE FUNCTION fn_exigir_pago_vigente(p_pago pago) RETURNS void
LANGUAGE plpgsql STABLE SET search_path = cam, pg_temp AS $$
BEGIN
  IF (SELECT estado_titularidad FROM adquisicion WHERE id = p_pago.adquisicion_id) <> 'VIGENTE' THEN
    RAISE EXCEPTION USING ERRCODE = 'CA409',
      MESSAGE = 'Este pago es de un titular anterior (la semana fue transferida); no se puede modificar.';
  END IF;
END $$;
REVOKE ALL ON FUNCTION fn_exigir_pago_vigente(pago) FROM PUBLIC;

CREATE OR REPLACE FUNCTION fn_revertir_verificacion(p_usuario_id bigint, p_pago_id bigint, p_motivo text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = cam, pg_temp AS $$
DECLARE v pago;
BEGIN
  PERFORM fn_exigir_usuario(p_usuario_id, 'SECRETARIA');
  v := fn_bloquear_pago(p_pago_id);
  PERFORM fn_exigir_pago_vigente(v);
  IF v.estado <> 'VERIFICADO' THEN RAISE EXCEPTION USING ERRCODE = 'CA409', MESSAGE = 'El pago no está verificado.'; END IF;
  IF EXISTS (SELECT 1 FROM comprobante WHERE pago_id = p_pago_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'CA409', MESSAGE = 'El pago tiene comprobante emitido; no se puede modificar.';
  END IF;
  IF p_motivo IS NULL OR length(btrim(p_motivo)) < 5 THEN
    RAISE EXCEPTION USING ERRCODE = 'CA400', MESSAGE = 'Escriba el motivo (mínimo 5 caracteres).';
  END IF;
  UPDATE pago SET estado = 'NO_VERIFICADO', verificado_en = NULL, verificado_por = NULL WHERE id = p_pago_id;
  PERFORM fn_auditar(p_usuario_id, 'REVERTIR_VERIFICACION', 'pago', p_pago_id,
          jsonb_build_object('motivo', btrim(p_motivo), 'verificado_en_antes', v.verificado_en, 'verificado_por_antes', v.verificado_por));
END $$;

CREATE OR REPLACE FUNCTION fn_anular_pago(p_usuario_id bigint, p_pago_id bigint, p_motivo text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = cam, pg_temp AS $$
DECLARE v pago;
BEGIN
  PERFORM fn_exigir_usuario(p_usuario_id, 'SECRETARIA');
  v := fn_bloquear_pago(p_pago_id);
  IF v.estado = 'ANULADO' THEN RAISE EXCEPTION USING ERRCODE = 'CA409', MESSAGE = 'El pago ya estaba anulado.'; END IF;
  PERFORM fn_exigir_pago_vigente(v);
  IF EXISTS (SELECT 1 FROM comprobante WHERE pago_id = p_pago_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'CA409', MESSAGE = 'El pago tiene comprobante emitido; no se puede anular ni modificar.';
  END IF;
  IF p_motivo IS NULL OR length(btrim(p_motivo)) < 5 THEN
    RAISE EXCEPTION USING ERRCODE = 'CA400', MESSAGE = 'Escriba el motivo de la anulación (mínimo 5 caracteres).';
  END IF;
  UPDATE pago SET estado = 'ANULADO', anulado_en = now(), anulado_por = p_usuario_id, motivo_anulacion = btrim(p_motivo)
   WHERE id = p_pago_id;
  PERFORM fn_auditar(p_usuario_id, 'ANULAR', 'pago', p_pago_id, jsonb_build_object('motivo', btrim(p_motivo)));
END $$;

-- Reporte "sin pago en el mes": un pago del titular anterior en ese mes también cuenta.
CREATE OR REPLACE FUNCTION fn_sin_pago_en_mes(p_anio int, p_mes int)
RETURNS TABLE (adquisicion_id bigint, cedula varchar, nombre_completo varchar, correo varchar,
               semana_numero smallint, cuotas_pagadas bigint, cuotas_registradas bigint, saldo numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = cam, pg_temp AS $$
  SELECT ec.adquisicion_id, ec.cedula, ec.nombre_completo, ec.correo, ec.semana_numero,
         ec.cuotas_pagadas, ec.cuotas_registradas, ec.saldo
    FROM v_estado_cuenta ec
   WHERE ec.estado_titularidad = 'VIGENTE'
     AND ec.cuotas_registradas < ec.numero_cuotas
     AND ec.fecha_adquisicion < (make_date(p_anio, p_mes, 1) + interval '1 month')
     AND NOT EXISTS (SELECT 1 FROM pago p JOIN v_adquisicion_linaje l ON l.ancestro_id = p.adquisicion_id
                      WHERE l.adquisicion_id = ec.adquisicion_id
                        AND p.estado <> 'ANULADO'
                        AND p.fecha_pago >= make_date(p_anio, p_mes, 1)
                        AND p.fecha_pago <  make_date(p_anio, p_mes, 1) + interval '1 month')
   ORDER BY ec.semana_numero;
$$;

-- Trigger de pagos (protección en profundidad): también revisa la cadena.
CREATE OR REPLACE FUNCTION tg_pago_validar() RETURNS trigger
LANGUAGE plpgsql SET search_path = cam, pg_temp AS $$
DECLARE v adquisicion;
BEGIN
  SELECT * INTO v FROM adquisicion WHERE id = NEW.adquisicion_id;
  IF v.estado_titularidad <> 'VIGENTE' THEN
    RAISE EXCEPTION USING ERRCODE = 'CA409', MESSAGE = 'La adquisición no está vigente; no admite pagos.';
  END IF;
  IF NEW.numero_cuota > v.numero_cuotas THEN
    RAISE EXCEPTION USING ERRCODE = 'CA400', MESSAGE = format('La cuota debe estar entre 1 y %s.', v.numero_cuotas);
  END IF;
  IF NEW.valor <> v.valor_cuota THEN
    RAISE EXCEPTION USING ERRCODE = 'CA400', MESSAGE = format('El valor debe ser el de la cuota completa: %s.', fn_pesos(v.valor_cuota));
  END IF;
  IF EXISTS (SELECT 1 FROM pago p JOIN fn_linaje(NEW.adquisicion_id) l ON l.ancestro_id = p.adquisicion_id
              WHERE l.nivel > 0 AND p.numero_cuota = NEW.numero_cuota AND p.estado <> 'ANULADO') THEN
    RAISE EXCEPTION USING ERRCODE = 'CA409', MESSAGE = format('La cuota %s ya la pagó un titular anterior de esta semana.', NEW.numero_cuota);
  END IF;
  RETURN NEW;
END $$;

-- Adquisición: tampoco cambian el origen ni el enlace, y una titularidad
-- transferida no vuelve a quedar vigente.
CREATE OR REPLACE FUNCTION tg_adquisicion_proteger() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = 'CA409', MESSAGE = 'Las adquisiciones no se eliminan; conservan el historial.';
  END IF;
  IF (NEW.propietario_id, NEW.semana_id, NEW.fecha_adquisicion, NEW.parametro_id,
      NEW.valor_accion, NEW.numero_cuotas, NEW.valor_cuota, NEW.creado_en, NEW.creado_por,
      NEW.origen, NEW.adquisicion_anterior_id)
     IS DISTINCT FROM
     (OLD.propietario_id, OLD.semana_id, OLD.fecha_adquisicion, OLD.parametro_id,
      OLD.valor_accion, OLD.numero_cuotas, OLD.valor_cuota, OLD.creado_en, OLD.creado_por,
      OLD.origen, OLD.adquisicion_anterior_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'CA409', MESSAGE = 'Las condiciones y partes de una adquisición no se modifican.';
  END IF;
  IF OLD.estado_titularidad = 'TRANSFERIDA'
     AND (NEW.estado_titularidad, NEW.fecha_fin_titularidad) IS DISTINCT FROM (OLD.estado_titularidad, OLD.fecha_fin_titularidad) THEN
    RAISE EXCEPTION USING ERRCODE = 'CA409', MESSAGE = 'Una titularidad transferida no se reabre.';
  END IF;
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------
-- 6. Permisos de cam_app (mínimo privilegio): lee las vistas nuevas y
--    transfiere SOLO mediante la función.
-- ---------------------------------------------------------------------
GRANT SELECT ON v_adquisicion_linaje, v_historial_titulares, v_auditoria_detalle TO cam_app;
GRANT EXECUTE ON FUNCTION fn_transferir_titularidad(bigint, bigint, bigint, date, text, text) TO cam_app;

-- ---------------------------------------------------------------------
-- 7. Diccionario de datos
-- ---------------------------------------------------------------------
COMMENT ON COLUMN adquisicion.origen IS 'Cómo llegó la semana a este titular: ASIGNACION (semana disponible) o transferencia (VENTA, CESION, INTERCAMBIO, OTRO).';
COMMENT ON COLUMN adquisicion.adquisicion_anterior_id IS 'En una transferencia, la adquisición del titular anterior. Sus pagos verificados cuentan para el saldo (D16).';
COMMENT ON VIEW v_adquisicion_linaje IS 'Cada adquisición con ella misma (nivel 0) y las de sus titulares anteriores (nivel 1, 2...).';
COMMENT ON VIEW v_historial_titulares IS 'Titulares de cada semana, actuales y anteriores, con origen y fechas.';
COMMENT ON VIEW v_auditoria_detalle IS 'Registro de auditoría con el nombre y rol de quien hizo cada acción.';
COMMENT ON FUNCTION fn_transferir_titularidad(bigint, bigint, bigint, date, text, text) IS
  'Cambio de titular: cierra la adquisición actual y crea otra para el nuevo titular con las mismas condiciones; el nuevo titular asume el saldo (D16).';
