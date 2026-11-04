-- =====================================================================
-- pruebas_transferencias.sql
-- Pruebas del CAMBIO DE TITULAR (D16: el nuevo titular asume el saldo),
-- ejecutadas como cam_app sobre cam_test. Datos marcados con "PRUEBA".
-- Escenario: la ÚLTIMA semana libre (la 4 la usa la prueba de concurrencia Z02)
-- Escenario: semana libre adquirida hace 300 días por "Cedente", que pagó
-- y se le verificaron 6 cuotas; la vende a "Cesionario", que luego la cede
-- a "Tercero".
-- =====================================================================
\set ON_ERROR_STOP on
\encoding UTF8
SET search_path = cam;

SELECT id AS sec FROM usuario WHERE login = 'secretaria' \gset
SELECT u.id AS u_ana FROM usuario u JOIN propietario p ON p.id = u.propietario_id WHERE p.cedula = '900000101' \gset
SELECT max(numero) AS sem_num, (array_agg(semana_id ORDER BY numero DESC))[1] AS sem
  FROM v_semana_titular WHERE disponibilidad = 'DISPONIBLE' AND activa \gset

INSERT INTO propietario (cedula, nombre_completo, correo, creado_por)
VALUES ('900000301', 'PRUEBA Cedente', 'prueba.cedente@ejemplo.test', :sec) RETURNING id AS p_ced \gset
INSERT INTO propietario (cedula, nombre_completo, correo, creado_por)
VALUES ('900000302', 'PRUEBA Cesionario', 'prueba.cesionario@ejemplo.test', :sec) RETURNING id AS p_ces \gset
INSERT INTO propietario (cedula, nombre_completo, correo, creado_por)
VALUES ('900000303', 'PRUEBA Tercero', 'prueba.tercero@ejemplo.test', :sec) RETURNING id AS p_ter \gset
INSERT INTO usuario (rol, propietario_id, nombre, password_hash)
VALUES ('PROPIETARIO', :p_ced, 'PRUEBA Cedente', '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXY01') RETURNING id AS u_ced \gset

SELECT fn_crear_adquisicion(:sec, :p_ced, :sem, current_date - 300, 'PRUEBA') AS adq_a \gset
SELECT fn_registrar_pago(:sec, :adq_a, n, 750000, current_date - 200, 'PRUEBA') FROM generate_series(1, 6) n;
SELECT fn_verificar_pago(:sec, id) FROM pago WHERE adquisicion_id = :adq_a AND numero_cuota <= 5;
SELECT fn_publicar_oferta(:u_ced, :adq_a, 'VENTA', 20000000, 'PRUEBA venta de semana') AS oferta \gset

-- ---------------------------------------------------------------------
-- Validaciones antes de transferir
-- ---------------------------------------------------------------------
SELECT pruebas.espera_error('TT01 No se transfiere con pagos sin verificar (cuota 6)',
  format($$SELECT fn_transferir_titularidad(%s, %s, %s, current_date - 100, 'VENTA', 'PRUEBA contrato 1')$$, :sec, :adq_a, :p_ces), 'CA409');
SELECT fn_verificar_pago(:sec, id) FROM pago WHERE adquisicion_id = :adq_a AND numero_cuota = 6;

SELECT pruebas.espera_error('TT02 No se transfiere al mismo titular',
  format($$SELECT fn_transferir_titularidad(%s, %s, %s, current_date - 100, 'VENTA', 'PRUEBA contrato 1')$$, :sec, :adq_a, :p_ced), 'CA409');
SELECT pruebas.espera_error('TT03 Fecha de transferencia futura',
  format($$SELECT fn_transferir_titularidad(%s, %s, %s, current_date + 1, 'VENTA', 'PRUEBA contrato 1')$$, :sec, :adq_a, :p_ces), 'CA400');
SELECT pruebas.espera_error('TT04 Fecha anterior a la adquisición del titular actual',
  format($$SELECT fn_transferir_titularidad(%s, %s, %s, current_date - 301, 'VENTA', 'PRUEBA contrato 1')$$, :sec, :adq_a, :p_ces), 'CA400');
SELECT pruebas.espera_error('TT05 Fecha anterior a pagos del titular actual',
  format($$SELECT fn_transferir_titularidad(%s, %s, %s, current_date - 250, 'VENTA', 'PRUEBA contrato 1')$$, :sec, :adq_a, :p_ces), 'CA400');
SELECT pruebas.espera_error('TT06 Un propietario no puede transferir (solo la secretaria)',
  format($$SELECT fn_transferir_titularidad(%s, %s, %s, current_date - 100, 'VENTA', 'PRUEBA contrato 1')$$, :u_ana, :adq_a, :p_ces), 'CA403');
SELECT pruebas.espera_error('TT07 Tipo de transferencia inválido',
  format($$SELECT fn_transferir_titularidad(%s, %s, %s, current_date - 100, 'REGALO', 'PRUEBA contrato 1')$$, :sec, :adq_a, :p_ces), 'CA400');
SELECT pruebas.espera_error('TT08 Soporte obligatorio',
  format($$SELECT fn_transferir_titularidad(%s, %s, %s, current_date - 100, 'VENTA', ' ')$$, :sec, :adq_a, :p_ces), 'CA400');
SELECT pruebas.espera_error('TT09 cam_app no puede cambiar el titular directamente en la tabla',
  format($$UPDATE adquisicion SET propietario_id = %s WHERE id = %s$$, :p_ces, :adq_a), '42501');

-- ---------------------------------------------------------------------
-- Venta: el Cesionario asume el saldo
-- ---------------------------------------------------------------------
SELECT fn_transferir_titularidad(:sec, :adq_a, :p_ces, current_date - 100, 'VENTA', 'PRUEBA contrato 1') AS adq_b \gset

SELECT pruebas.afirma('TT10 La adquisición anterior queda TRANSFERIDA con fecha de fin',
  (SELECT estado_titularidad = 'TRANSFERIDA' AND fecha_fin_titularidad = current_date - 100 FROM adquisicion WHERE id = :adq_a));
SELECT pruebas.afirma('TT11 La nueva adquisición: vigente, mismas condiciones, enlazada, origen VENTA',
  (SELECT estado_titularidad = 'VIGENTE' AND propietario_id = :p_ces AND semana_id = :sem
          AND valor_accion = 18000000 AND numero_cuotas = 24 AND valor_cuota = 750000
          AND origen = 'VENTA' AND adquisicion_anterior_id = :adq_a AND fecha_adquisicion = current_date - 100
     FROM adquisicion WHERE id = :adq_b));
SELECT pruebas.afirma('TT12 Estado de cuenta del nuevo titular: 6 pagadas (heredadas), 18 pendientes, saldo $13.500.000',
  (SELECT cuotas_pagadas = 6 AND cuotas_heredadas = 6 AND total_heredado = 4500000
          AND cuotas_pendientes = 18 AND total_abonado = 4500000 AND saldo = 13500000
     FROM v_estado_cuenta WHERE adquisicion_id = :adq_b));
SELECT pruebas.afirma('TT13 Plan de cuotas: 1-6 pagadas por el titular anterior, 7-24 pendientes',
  (SELECT count(*) FILTER (WHERE situacion_cuota = 'PAGADA' AND de_titular_anterior AND numero_cuota <= 6) = 6
      AND count(*) FILTER (WHERE situacion_cuota = 'PENDIENTE' AND numero_cuota > 6) = 18
     FROM v_plan_cuotas WHERE adquisicion_id = :adq_b));
SELECT pruebas.afirma('TT14 Los pagos siguen a nombre del titular anterior (historial)',
  (SELECT count(*) = 6 AND bool_and(nombre_completo = 'PRUEBA Cedente') FROM v_pago_detalle WHERE adquisicion_id = :adq_a));
SELECT pruebas.afirma('TT15 La oferta activa de la semana quedó CONCRETADA',
  (SELECT estado = 'CONCRETADA' FROM oferta WHERE id = :oferta));
SELECT pruebas.afirma('TT16 La semana tiene un solo titular vigente: el Cesionario',
  (SELECT count(*) = 1 AND min(propietario_id) = :p_ces FROM adquisicion WHERE semana_id = :sem AND estado_titularidad = 'VIGENTE'));

SELECT pruebas.espera_error('TT17 No se cobra dos veces: cuota 3 ya pagada por el titular anterior',
  format($$SELECT fn_registrar_pago(%s, %s, 3, 750000, current_date - 50, 'PRUEBA')$$, :sec, :adq_b), 'CA409');
SELECT pruebas.espera_error('TT18 La adquisición transferida no admite pagos',
  format($$SELECT fn_registrar_pago(%s, %s, 7, 750000, current_date - 50, 'PRUEBA')$$, :sec, :adq_a), 'CA409');
SELECT pruebas.espera_error('TT19 No se anula un pago del titular anterior',
  format($$SELECT fn_anular_pago(%s, (SELECT id FROM pago WHERE adquisicion_id = %s AND numero_cuota = 1), 'PRUEBA motivo')$$, :sec, :adq_a), 'CA409');
SELECT pruebas.espera_error('TT20 No se revierte la verificación de un pago del titular anterior',
  format($$SELECT fn_revertir_verificacion(%s, (SELECT id FROM pago WHERE adquisicion_id = %s AND numero_cuota = 2), 'PRUEBA motivo')$$, :sec, :adq_a), 'CA409');
SELECT pruebas.espera_error('TT21 Una adquisición ya transferida no se transfiere otra vez',
  format($$SELECT fn_transferir_titularidad(%s, %s, %s, current_date - 50, 'CESION', 'PRUEBA contrato 2')$$, :sec, :adq_a, :p_ter), 'CA409');
SELECT pruebas.espera_error('TT22 El titular anterior ya no puede ofertar la semana',
  format($$SELECT fn_publicar_oferta(%s, %s, 'VENTA', 1000, 'PRUEBA otra oferta')$$, :u_ced, :adq_a), 'CA403');

SELECT fn_registrar_pago(:sec, :adq_b, 7, 750000, current_date - 50, 'PRUEBA') AS pago7 \gset
SELECT pruebas.afirma('TT23 El nuevo titular paga la cuota 7: 7 registradas, 6 verificadas',
  (SELECT cuotas_registradas = 7 AND cuotas_pagadas = 6 AND cuotas_por_verificar = 1 FROM v_estado_cuenta WHERE adquisicion_id = :adq_b));

SELECT pruebas.afirma('TT24 Auditoría: TRANSFERIR con de, a, tipo y saldo asumido $13.500.000',
  (SELECT detalle->>'de' = 'PRUEBA Cedente' AND detalle->>'a' = 'PRUEBA Cesionario' AND detalle->>'tipo' = 'VENTA'
          AND (detalle->>'saldo_asumido')::numeric = 13500000 AND usuario_id = :sec
     FROM auditoria WHERE accion = 'TRANSFERIR' AND registro_id = :adq_a));

-- ---------------------------------------------------------------------
-- Segunda transferencia (cesión): cadena de tres titulares
-- ---------------------------------------------------------------------
SELECT fn_verificar_pago(:sec, :pago7);
SELECT fn_transferir_titularidad(:sec, :adq_b, :p_ter, current_date - 10, 'CESION', 'PRUEBA herencia') AS adq_c \gset
SELECT pruebas.afirma('TT25 Tras la cesión: 7 pagadas heredadas de dos titulares, saldo $12.750.000',
  (SELECT cuotas_pagadas = 7 AND cuotas_heredadas = 7 AND saldo = 12750000 AND origen = 'CESION'
     FROM v_estado_cuenta WHERE adquisicion_id = :adq_c));
SELECT pruebas.afirma('TT26 Historial de la semana: tres titulares en orden, con su titular anterior',
  (SELECT string_agg(nombre_completo || '<-' || COALESCE(titular_anterior, '-'), ' | ' ORDER BY adquisicion_id)
        = 'PRUEBA Cedente<--' || ' | PRUEBA Cesionario<-PRUEBA Cedente | PRUEBA Tercero<-PRUEBA Cesionario'
     FROM v_historial_titulares WHERE semana_id = :sem));
SELECT pruebas.afirma('TT27 Panel: el saldo por cobrar cuenta la semana una sola vez',
  (SELECT count(*) = 1 FROM v_estado_cuenta WHERE semana_id = :sem AND estado_titularidad = 'VIGENTE'));
SELECT pruebas.afirma('TT28 Vista de auditoría muestra el nombre de quien transfirió',
  (SELECT count(*) = 2 AND bool_and(usuario_rol = 'SECRETARIA') FROM v_auditoria_detalle WHERE accion = 'TRANSFERIR'
     AND registro_id IN (:adq_a, :adq_b)));
SELECT pruebas.espera_error('TT29 cam_app no puede borrar la auditoría',
  $$DELETE FROM auditoria WHERE accion = 'TRANSFERIR'$$, '42501');
SELECT pruebas.espera_error('TT30 cam_app no puede modificar la auditoría',
  $$UPDATE auditoria SET detalle = NULL WHERE accion = 'TRANSFERIR'$$, '42501');
