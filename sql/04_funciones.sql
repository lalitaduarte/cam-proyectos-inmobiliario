-- =====================================================================
-- 04_funciones.sql
-- Proyecto CAM · Funciones transaccionales y triggers.
--
-- Cada función de negocio se ejecuta como una sola TRANSACCIÓN: si una
-- validación falla, PostgreSQL deshace todo lo que la función alcanzó a
-- hacer (RN12). Las filas críticas se bloquean con SELECT ... FOR UPDATE,
-- de modo que dos solicitudes simultáneas se atienden una después de otra.
--
-- Las funciones son SECURITY DEFINER: se ejecutan con los permisos de
-- cam_admin. Así cam_app puede registrar pagos SOLO a través de ellas,
-- nunca escribiendo directamente en las tablas críticas.
--
-- Códigos de error propios (SQLSTATE) que el backend traduce a HTTP:
--   CA400 dato inválido      -> 400
--   CA403 sin permiso        -> 403
--   CA404 no existe          -> 404
--   CA409 conflicto/estado   -> 409
-- =====================================================================
\set ON_ERROR_STOP on
\encoding UTF8
SET search_path = cam;

-- ---------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------
CREATE FUNCTION fn_pesos(p numeric) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT '$' || replace(to_char(p, 'FM999,999,999,990'), ',', '.')
$$;
COMMENT ON FUNCTION fn_pesos(numeric) IS 'Formatea un valor como pesos colombianos: 750000 -> $750.000';

-- Comprueba que el usuario existe, está activo y tiene el rol pedido.
-- Devuelve la fila del usuario.
CREATE FUNCTION fn_exigir_usuario(p_usuario_id bigint, p_rol text DEFAULT NULL)
RETURNS usuario
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = cam, pg_temp AS $$
DECLARE v usuario;
BEGIN
  SELECT * INTO v FROM usuario WHERE id = p_usuario_id;
  IF NOT FOUND OR NOT v.activo THEN
    RAISE EXCEPTION USING ERRCODE = 'CA403', MESSAGE = 'Usuario no autorizado.';
  END IF;
  IF p_rol IS NOT NULL AND v.rol <> p_rol THEN
    RAISE EXCEPTION USING ERRCODE = 'CA403', MESSAGE = 'Su rol no permite realizar esta operación.';
  END IF;
  IF v.rol = 'PROPIETARIO' AND NOT (SELECT activo FROM propietario WHERE id = v.propietario_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'CA403', MESSAGE = 'Usuario no autorizado.';
  END IF;
  RETURN v;
END $$;

CREATE FUNCTION fn_auditar(p_usuario_id bigint, p_accion text, p_tabla text, p_registro_id bigint, p_detalle jsonb DEFAULT NULL)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = cam, pg_temp AS $$
  INSERT INTO auditoria (usuario_id, accion, tabla, registro_id, detalle)
  VALUES (p_usuario_id, p_accion, p_tabla, p_registro_id, p_detalle);
$$;

-- =====================================================================
-- PARÁMETROS
-- =====================================================================
CREATE FUNCTION fn_nuevo_parametro(p_usuario_id bigint, p_valor_accion numeric, p_numero_cuotas int, p_valor_cuota numeric)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = cam, pg_temp AS $$
DECLARE v_id bigint;
BEGIN
  PERFORM fn_exigir_usuario(p_usuario_id, 'SECRETARIA');
  IF p_valor_accion IS NULL OR p_valor_accion <= 0 OR p_valor_cuota IS NULL OR p_valor_cuota <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'CA400', MESSAGE = 'Los valores deben ser mayores que cero.';
  END IF;
  IF p_numero_cuotas IS NULL OR p_numero_cuotas NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION USING ERRCODE = 'CA400', MESSAGE = 'El número de cuotas debe estar entre 1 y 120.';
  END IF;
  IF p_numero_cuotas * p_valor_cuota <> p_valor_accion THEN
    RAISE EXCEPTION USING ERRCODE = 'CA400',
      MESSAGE = format('El número de cuotas por el valor de la cuota (%s) debe ser igual al valor de la acción (%s).',
                       fn_pesos(p_numero_cuotas * p_valor_cuota), fn_pesos(p_valor_accion));
  END IF;
  INSERT INTO parametro_accion (valor_accion, numero_cuotas, valor_cuota, creado_por)
  VALUES (p_valor_accion, p_numero_cuotas, p_valor_cuota, p_usuario_id)
  RETURNING id INTO v_id;
  PERFORM fn_auditar(p_usuario_id, 'CREAR', 'parametro_accion', v_id,
          jsonb_build_object('valor_accion', p_valor_accion, 'numero_cuotas', p_numero_cuotas, 'valor_cuota', p_valor_cuota));
  RETURN v_id;
END $$;

-- =====================================================================
-- ADQUISICIONES
-- =====================================================================
CREATE FUNCTION fn_crear_adquisicion(p_usuario_id bigint, p_propietario_id bigint, p_semana_id bigint,
                                     p_fecha_adquisicion date, p_observacion text DEFAULT NULL)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = cam, pg_temp AS $$
DECLARE
  v_semana  semana;
  v_prop    propietario;
  v_param   parametro_accion;
  v_titular text;
  v_id      bigint;
BEGIN
  PERFORM fn_exigir_usuario(p_usuario_id, 'SECRETARIA');

  SELECT * INTO v_prop FROM propietario WHERE id = p_propietario_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'CA404', MESSAGE = 'El propietario no existe.'; END IF;
  IF NOT v_prop.activo THEN RAISE EXCEPTION USING ERRCODE = 'CA409', MESSAGE = 'El propietario está inactivo.'; END IF;

  -- Bloquea la semana: si dos personas asignan la misma semana a la vez,
  -- la segunda espera y luego ve que ya tiene titular.
  SELECT * INTO v_semana FROM semana WHERE id = p_semana_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'CA404', MESSAGE = 'La semana no existe.'; END IF;
  IF NOT v_semana.activa THEN RAISE EXCEPTION USING ERRCODE = 'CA409', MESSAGE = 'La semana está inactiva.'; END IF;

  SELECT pr.nombre_completo INTO v_titular
    FROM adquisicion a JOIN propietario pr ON pr.id = a.propietario_id
   WHERE a.semana_id = p_semana_id AND a.estado_titularidad = 'VIGENTE';
  IF FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'CA409',
      MESSAGE = format('La semana %s ya tiene titular actual (%s).', v_semana.numero, v_titular);
  END IF;

  IF p_fecha_adquisicion IS NULL OR p_fecha_adquisicion > current_date THEN
    RAISE EXCEPTION USING ERRCODE = 'CA400', MESSAGE = 'La fecha de adquisición es obligatoria y no puede ser futura.';
  END IF;

  -- Copia las condiciones vigentes (RN09).
  SELECT * INTO v_param FROM parametro_accion ORDER BY vigente_desde DESC, id DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'CA409', MESSAGE = 'No hay parámetros de la acción configurados.';
  END IF;

  INSERT INTO adquisicion (propietario_id, semana_id, fecha_adquisicion, parametro_id,
                           valor_accion, numero_cuotas, valor_cuota, observacion, creado_por)
  VALUES (p_propietario_id, p_semana_id, p_fecha_adquisicion, v_param.id,
          v_param.valor_accion, v_param.numero_cuotas, v_param.valor_cuota, NULLIF(btrim(p_observacion), ''), p_usuario_id)
  RETURNING id INTO v_id;

  PERFORM fn_auditar(p_usuario_id, 'CREAR', 'adquisicion', v_id,
          jsonb_build_object('propietario_id', p_propietario_id, 'semana', v_semana.numero, 'parametro_id', v_param.id));
  RETURN v_id;
END $$;

-- =====================================================================
-- PAGOS
-- =====================================================================
CREATE FUNCTION fn_registrar_pago(p_usuario_id bigint, p_adquisicion_id bigint, p_numero_cuota int,
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

  -- Usuario y fecha de registro los pone el servidor (RN13).
  INSERT INTO pago (adquisicion_id, numero_cuota, valor, fecha_pago, referencia, registrado_por)
  VALUES (p_adquisicion_id, p_numero_cuota, p_valor, p_fecha_pago, NULLIF(btrim(p_referencia), ''), p_usuario_id)
  RETURNING id INTO v_id;

  PERFORM fn_auditar(p_usuario_id, 'REGISTRAR', 'pago', v_id,
          jsonb_build_object('adquisicion_id', p_adquisicion_id, 'cuota', p_numero_cuota, 'valor', p_valor));
  RETURN v_id;
END $$;

-- Carga y bloquea un pago, validando que exista. Uso interno.
CREATE FUNCTION fn_bloquear_pago(p_pago_id bigint) RETURNS pago
LANGUAGE plpgsql SECURITY DEFINER SET search_path = cam, pg_temp AS $$
DECLARE v pago;
BEGIN
  SELECT * INTO v FROM pago WHERE id = p_pago_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'CA404', MESSAGE = 'El pago no existe.'; END IF;
  RETURN v;
END $$;

CREATE FUNCTION fn_verificar_pago(p_usuario_id bigint, p_pago_id bigint)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = cam, pg_temp AS $$
DECLARE v pago;
BEGIN
  PERFORM fn_exigir_usuario(p_usuario_id, 'SECRETARIA');
  v := fn_bloquear_pago(p_pago_id);
  IF v.estado = 'VERIFICADO' THEN RAISE EXCEPTION USING ERRCODE = 'CA409', MESSAGE = 'El pago ya estaba verificado.'; END IF;
  IF v.estado = 'ANULADO'    THEN RAISE EXCEPTION USING ERRCODE = 'CA409', MESSAGE = 'No se puede verificar un pago anulado.'; END IF;
  UPDATE pago SET estado = 'VERIFICADO', verificado_en = now(), verificado_por = p_usuario_id WHERE id = p_pago_id;
  PERFORM fn_auditar(p_usuario_id, 'VERIFICAR', 'pago', p_pago_id);
END $$;

-- Revierte una verificación hecha por error (D15). Solo sin comprobante.
CREATE FUNCTION fn_revertir_verificacion(p_usuario_id bigint, p_pago_id bigint, p_motivo text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = cam, pg_temp AS $$
DECLARE v pago;
BEGIN
  PERFORM fn_exigir_usuario(p_usuario_id, 'SECRETARIA');
  v := fn_bloquear_pago(p_pago_id);
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

-- Anulación lógica (D4): el pago queda en el historial y la cuota se libera.
CREATE FUNCTION fn_anular_pago(p_usuario_id bigint, p_pago_id bigint, p_motivo text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = cam, pg_temp AS $$
DECLARE v pago;
BEGIN
  PERFORM fn_exigir_usuario(p_usuario_id, 'SECRETARIA');
  v := fn_bloquear_pago(p_pago_id);
  IF v.estado = 'ANULADO' THEN RAISE EXCEPTION USING ERRCODE = 'CA409', MESSAGE = 'El pago ya estaba anulado.'; END IF;
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

-- =====================================================================
-- COMPROBANTES
-- =====================================================================
CREATE FUNCTION fn_emitir_comprobante(p_usuario_id bigint, p_pago_id bigint)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = cam, pg_temp AS $$
DECLARE
  v_usr  usuario;
  v_pago pago;
  v_ec   v_estado_cuenta;
  v_num  bigint;
  v_id   bigint;
  v_cp   text;
BEGIN
  v_usr  := fn_exigir_usuario(p_usuario_id, 'SECRETARIA');
  v_pago := fn_bloquear_pago(p_pago_id);   -- orden de bloqueo: pago, luego consecutivo

  IF v_pago.estado <> 'VERIFICADO' THEN
    RAISE EXCEPTION USING ERRCODE = 'CA409', MESSAGE = 'Solo se emiten comprobantes de pagos verificados.';
  END IF;
  SELECT numero INTO v_cp FROM comprobante WHERE pago_id = p_pago_id;
  IF FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'CA409', MESSAGE = format('Este pago ya tiene el comprobante %s.', v_cp);
  END IF;

  -- Siguiente número sin saltos. La fila queda bloqueada hasta el final
  -- de la transacción: dos emisiones simultáneas no obtienen el mismo número.
  UPDATE consecutivo_comprobante SET ultimo = ultimo + 1 WHERE id = 1 RETURNING ultimo INTO v_num;

  SELECT * INTO v_ec FROM v_estado_cuenta WHERE adquisicion_id = v_pago.adquisicion_id;

  INSERT INTO comprobante (consecutivo, numero, pago_id, emitido_por, empresa, emisor_nombre,
                           propietario_cedula, propietario_nombre, propietario_correo,
                           semana_numero, numero_cuota, numero_cuotas, valor, fecha_pago,
                           total_abonado, cuotas_pendientes, saldo)
  VALUES (v_num, 'CP-' || lpad(v_num::text, 6, '0'), p_pago_id, p_usuario_id,
          'CAM PROYECTOS INMOBILIARIOS S.A.S.', v_usr.nombre,
          v_ec.cedula, v_ec.nombre_completo, v_ec.correo,
          v_ec.semana_numero, v_pago.numero_cuota, v_ec.numero_cuotas, v_pago.valor, v_pago.fecha_pago,
          v_ec.total_abonado, v_ec.cuotas_pendientes, v_ec.saldo)
  RETURNING id INTO v_id;

  PERFORM fn_auditar(p_usuario_id, 'EMITIR', 'comprobante', v_id,
          jsonb_build_object('numero', 'CP-' || lpad(v_num::text, 6, '0'), 'pago_id', p_pago_id));
  RETURN v_id;
END $$;

-- Registra el resultado de un intento REAL de envío por correo.
CREATE FUNCTION fn_registrar_envio(p_usuario_id bigint, p_comprobante_id bigint, p_correo text,
                                   p_estado text, p_detalle_error text DEFAULT NULL)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = cam, pg_temp AS $$
DECLARE v_id bigint;
BEGIN
  PERFORM fn_exigir_usuario(p_usuario_id, 'SECRETARIA');
  IF NOT EXISTS (SELECT 1 FROM comprobante WHERE id = p_comprobante_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'CA404', MESSAGE = 'El comprobante no existe.';
  END IF;
  IF p_estado NOT IN ('ENVIADO', 'FALLIDO') THEN
    RAISE EXCEPTION USING ERRCODE = 'CA400', MESSAGE = 'Estado de envío inválido.';
  END IF;
  INSERT INTO envio_comprobante (comprobante_id, correo_destino, estado, detalle_error, intentado_por)
  VALUES (p_comprobante_id, p_correo, p_estado,
          CASE WHEN p_estado = 'FALLIDO' THEN COALESCE(NULLIF(left(p_detalle_error, 500), ''), 'Error no especificado') END,
          p_usuario_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- =====================================================================
-- PROPIETARIOS: eliminación solo sin historial.
-- =====================================================================
CREATE FUNCTION fn_eliminar_propietario(p_usuario_id bigint, p_propietario_id bigint)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = cam, pg_temp AS $$
DECLARE v_cuenta bigint;
BEGIN
  PERFORM fn_exigir_usuario(p_usuario_id, 'SECRETARIA');
  PERFORM 1 FROM propietario WHERE id = p_propietario_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'CA404', MESSAGE = 'El propietario no existe.'; END IF;
  IF EXISTS (SELECT 1 FROM adquisicion WHERE propietario_id = p_propietario_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'CA409', MESSAGE = 'El propietario tiene adquisiciones registradas; no se puede eliminar. Puede desactivarlo.';
  END IF;
  SELECT id INTO v_cuenta FROM usuario WHERE propietario_id = p_propietario_id;
  IF v_cuenta IS NOT NULL AND EXISTS (SELECT 1 FROM mensaje WHERE autor_id = v_cuenta) THEN
    RAISE EXCEPTION USING ERRCODE = 'CA409', MESSAGE = 'El propietario tiene mensajes en la comunidad; no se puede eliminar. Puede desactivarlo.';
  END IF;
  DELETE FROM usuario WHERE propietario_id = p_propietario_id;
  DELETE FROM propietario WHERE id = p_propietario_id;
  PERFORM fn_auditar(p_usuario_id, 'ELIMINAR', 'propietario', p_propietario_id);
END $$;

-- =====================================================================
-- COMUNIDAD: ofertas y mensajes
-- =====================================================================
CREATE FUNCTION fn_publicar_oferta(p_usuario_id bigint, p_adquisicion_id bigint, p_tipo text,
                                   p_precio numeric, p_descripcion text)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = cam, pg_temp AS $$
DECLARE
  v_usr usuario;
  v_adq adquisicion;
  v_id  bigint;
BEGIN
  v_usr := fn_exigir_usuario(p_usuario_id, 'PROPIETARIO');

  SELECT * INTO v_adq FROM adquisicion WHERE id = p_adquisicion_id FOR UPDATE;
  -- Semana ajena o sin titularidad actual: misma respuesta, sin revelar datos.
  IF NOT FOUND OR v_adq.propietario_id <> v_usr.propietario_id OR v_adq.estado_titularidad <> 'VIGENTE' THEN
    RAISE EXCEPTION USING ERRCODE = 'CA403', MESSAGE = 'Solo puede ofertar semanas de las que es titular actual.';
  END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('VENTA', 'INTERCAMBIO') THEN
    RAISE EXCEPTION USING ERRCODE = 'CA400', MESSAGE = 'El tipo de oferta debe ser VENTA o INTERCAMBIO.';
  END IF;
  IF p_tipo = 'VENTA' AND (p_precio IS NULL OR p_precio <= 0) THEN
    RAISE EXCEPTION USING ERRCODE = 'CA400', MESSAGE = 'Una oferta de venta requiere un precio mayor que cero.';
  END IF;
  IF p_tipo = 'INTERCAMBIO' AND p_precio IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'CA400', MESSAGE = 'Una oferta de intercambio no lleva precio.';
  END IF;
  IF p_descripcion IS NULL OR length(btrim(p_descripcion)) < 5 THEN
    RAISE EXCEPTION USING ERRCODE = 'CA400', MESSAGE = 'Escriba una descripción (mínimo 5 caracteres).';
  END IF;
  IF EXISTS (SELECT 1 FROM oferta WHERE adquisicion_id = p_adquisicion_id AND estado = 'ACTIVA') THEN
    RAISE EXCEPTION USING ERRCODE = 'CA409', MESSAGE = 'Esta semana ya tiene una oferta activa.';
  END IF;

  INSERT INTO oferta (adquisicion_id, tipo, precio, descripcion, publicada_por)
  VALUES (p_adquisicion_id, p_tipo, p_precio, btrim(p_descripcion), p_usuario_id)
  RETURNING id INTO v_id;
  PERFORM fn_auditar(p_usuario_id, 'PUBLICAR', 'oferta', v_id);
  RETURN v_id;
END $$;

-- Retira o marca como concretada una oferta. NO transfiere la titularidad.
CREATE FUNCTION fn_cerrar_oferta(p_usuario_id bigint, p_oferta_id bigint, p_nuevo_estado text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = cam, pg_temp AS $$
DECLARE
  v_usr  usuario;
  v_of   oferta;
  v_duen bigint;
BEGIN
  v_usr := fn_exigir_usuario(p_usuario_id);
  IF p_nuevo_estado NOT IN ('RETIRADA', 'CONCRETADA') THEN
    RAISE EXCEPTION USING ERRCODE = 'CA400', MESSAGE = 'El nuevo estado debe ser RETIRADA o CONCRETADA.';
  END IF;
  SELECT * INTO v_of FROM oferta WHERE id = p_oferta_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'CA404', MESSAGE = 'La oferta no existe.'; END IF;
  SELECT propietario_id INTO v_duen FROM adquisicion WHERE id = v_of.adquisicion_id;
  IF v_usr.rol = 'PROPIETARIO' AND v_usr.propietario_id <> v_duen THEN
    RAISE EXCEPTION USING ERRCODE = 'CA403', MESSAGE = 'Solo puede cerrar sus propias ofertas.';
  END IF;
  IF v_of.estado <> 'ACTIVA' THEN
    RAISE EXCEPTION USING ERRCODE = 'CA409', MESSAGE = 'La oferta ya está cerrada.';
  END IF;
  UPDATE oferta SET estado = p_nuevo_estado, cerrada_en = now(), cerrada_por = p_usuario_id WHERE id = p_oferta_id;
  PERFORM fn_auditar(p_usuario_id, p_nuevo_estado, 'oferta', p_oferta_id);
END $$;

-- Elimina una oferta publicada por error, solo si no tiene mensajes (D10).
CREATE FUNCTION fn_eliminar_oferta(p_usuario_id bigint, p_oferta_id bigint)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = cam, pg_temp AS $$
DECLARE
  v_usr  usuario;
  v_of   oferta;
  v_duen bigint;
BEGIN
  v_usr := fn_exigir_usuario(p_usuario_id);
  SELECT * INTO v_of FROM oferta WHERE id = p_oferta_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'CA404', MESSAGE = 'La oferta no existe.'; END IF;
  SELECT propietario_id INTO v_duen FROM adquisicion WHERE id = v_of.adquisicion_id;
  IF v_usr.rol = 'PROPIETARIO' AND v_usr.propietario_id <> v_duen THEN
    RAISE EXCEPTION USING ERRCODE = 'CA403', MESSAGE = 'Solo puede eliminar sus propias ofertas.';
  END IF;
  IF EXISTS (SELECT 1 FROM mensaje WHERE oferta_id = p_oferta_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'CA409', MESSAGE = 'La oferta tiene mensajes; no se puede eliminar, solo retirar.';
  END IF;
  DELETE FROM oferta WHERE id = p_oferta_id;
  PERFORM fn_auditar(p_usuario_id, 'ELIMINAR', 'oferta', p_oferta_id);
END $$;

CREATE FUNCTION fn_enviar_mensaje(p_usuario_id bigint, p_oferta_id bigint, p_texto text)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = cam, pg_temp AS $$
DECLARE v_id bigint;
BEGIN
  PERFORM fn_exigir_usuario(p_usuario_id);
  -- FOR SHARE: si otra persona está cerrando la oferta en ese instante, se espera.
  PERFORM 1 FROM oferta WHERE id = p_oferta_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'CA404', MESSAGE = 'La oferta no existe.'; END IF;
  IF p_texto IS NULL OR length(btrim(p_texto)) = 0 OR length(p_texto) > 1000 THEN
    RAISE EXCEPTION USING ERRCODE = 'CA400', MESSAGE = 'El mensaje debe tener entre 1 y 1000 caracteres.';
  END IF;
  -- La regla "oferta cerrada no admite mensajes" la aplica el trigger tg_mensaje_oferta_activa.
  INSERT INTO mensaje (oferta_id, autor_id, texto) VALUES (p_oferta_id, p_usuario_id, btrim(p_texto))
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- =====================================================================
-- REPORTE: adquisiciones SIN PAGO REGISTRADO en un mes.
-- OJO: no significa "cuota vencida" (no hay calendario de cuotas, D6).
-- Incluye adquisiciones vigentes, adquiridas hasta ese mes y no pagadas
-- por completo.
-- =====================================================================
CREATE FUNCTION fn_sin_pago_en_mes(p_anio int, p_mes int)
RETURNS TABLE (adquisicion_id bigint, cedula varchar, nombre_completo varchar, correo varchar,
               semana_numero smallint, cuotas_pagadas bigint, cuotas_registradas bigint, saldo numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = cam, pg_temp AS $$
  SELECT ec.adquisicion_id, ec.cedula, ec.nombre_completo, ec.correo, ec.semana_numero,
         ec.cuotas_pagadas, ec.cuotas_registradas, ec.saldo
    FROM v_estado_cuenta ec
   WHERE ec.estado_titularidad = 'VIGENTE'
     AND ec.cuotas_registradas < ec.numero_cuotas
     AND ec.fecha_adquisicion < (make_date(p_anio, p_mes, 1) + interval '1 month')
     AND NOT EXISTS (SELECT 1 FROM pago p
                      WHERE p.adquisicion_id = ec.adquisicion_id
                        AND p.estado <> 'ANULADO'
                        AND p.fecha_pago >= make_date(p_anio, p_mes, 1)
                        AND p.fecha_pago <  make_date(p_anio, p_mes, 1) + interval '1 month')
   ORDER BY ec.semana_numero;
$$;

-- =====================================================================
-- TRIGGERS: reglas que se cumplen aunque alguien intente saltarse las
-- funciones (protección en profundidad).
-- =====================================================================

-- PAGO: valida la cuota contra el plan de SU adquisición antes de insertar.
CREATE FUNCTION tg_pago_validar() RETURNS trigger
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
  RETURN NEW;
END $$;
CREATE TRIGGER pago_validar BEFORE INSERT ON pago FOR EACH ROW EXECUTE FUNCTION tg_pago_validar();

-- PAGO: no se elimina nunca; con comprobante no cambia; los datos
-- esenciales (adquisición, cuota, valor, fecha) no se editan: un error se
-- corrige anulando y registrando de nuevo, para conservar el historial.
CREATE FUNCTION tg_pago_proteger() RETURNS trigger
LANGUAGE plpgsql SET search_path = cam, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = 'CA409', MESSAGE = 'Los pagos no se eliminan; se anulan conservando el historial.';
  END IF;
  IF EXISTS (SELECT 1 FROM comprobante WHERE pago_id = OLD.id) THEN
    RAISE EXCEPTION USING ERRCODE = 'CA409', MESSAGE = 'El pago tiene comprobante emitido; no se puede anular ni modificar.';
  END IF;
  IF (NEW.adquisicion_id, NEW.numero_cuota, NEW.valor, NEW.fecha_pago, NEW.registrado_en, NEW.registrado_por)
     IS DISTINCT FROM
     (OLD.adquisicion_id, OLD.numero_cuota, OLD.valor, OLD.fecha_pago, OLD.registrado_en, OLD.registrado_por) THEN
    RAISE EXCEPTION USING ERRCODE = 'CA409', MESSAGE = 'Los datos del pago no se editan; anúlelo y regístrelo de nuevo.';
  END IF;
  IF OLD.estado = 'ANULADO' THEN
    RAISE EXCEPTION USING ERRCODE = 'CA409', MESSAGE = 'Un pago anulado no cambia de estado.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pago_proteger BEFORE UPDATE OR DELETE ON pago FOR EACH ROW EXECUTE FUNCTION tg_pago_proteger();

-- COMPROBANTE y PARÁMETROS: inmutables una vez creados.
CREATE FUNCTION tg_inmutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = 'CA409',
    MESSAGE = format('Los registros de %s no se pueden modificar ni eliminar.', TG_TABLE_NAME);
END $$;
CREATE TRIGGER comprobante_inmutable BEFORE UPDATE OR DELETE ON comprobante      FOR EACH ROW EXECUTE FUNCTION tg_inmutable();
CREATE TRIGGER parametro_inmutable   BEFORE UPDATE OR DELETE ON parametro_accion FOR EACH ROW EXECUTE FUNCTION tg_inmutable();
CREATE TRIGGER envio_inmutable       BEFORE UPDATE OR DELETE ON envio_comprobante FOR EACH ROW EXECUTE FUNCTION tg_inmutable();

-- ADQUISICIÓN: las condiciones económicas copiadas y sus partes no cambian (RN09).
CREATE FUNCTION tg_adquisicion_proteger() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = 'CA409', MESSAGE = 'Las adquisiciones no se eliminan; conservan el historial.';
  END IF;
  IF (NEW.propietario_id, NEW.semana_id, NEW.fecha_adquisicion, NEW.parametro_id,
      NEW.valor_accion, NEW.numero_cuotas, NEW.valor_cuota, NEW.creado_en, NEW.creado_por)
     IS DISTINCT FROM
     (OLD.propietario_id, OLD.semana_id, OLD.fecha_adquisicion, OLD.parametro_id,
      OLD.valor_accion, OLD.numero_cuotas, OLD.valor_cuota, OLD.creado_en, OLD.creado_por) THEN
    RAISE EXCEPTION USING ERRCODE = 'CA409', MESSAGE = 'Las condiciones y partes de una adquisición no se modifican.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER adquisicion_proteger BEFORE UPDATE OR DELETE ON adquisicion FOR EACH ROW EXECUTE FUNCTION tg_adquisicion_proteger();

-- MENSAJE: solo en ofertas ACTIVAS (RN11).
CREATE FUNCTION tg_mensaje_oferta_activa() RETURNS trigger
LANGUAGE plpgsql SET search_path = cam, pg_temp AS $$
BEGIN
  IF (SELECT estado FROM oferta WHERE id = NEW.oferta_id) <> 'ACTIVA' THEN
    RAISE EXCEPTION USING ERRCODE = 'CA409', MESSAGE = 'La oferta está cerrada; no admite mensajes nuevos.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER mensaje_oferta_activa BEFORE INSERT ON mensaje FOR EACH ROW EXECUTE FUNCTION tg_mensaje_oferta_activa();
