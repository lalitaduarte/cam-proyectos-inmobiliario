-- =====================================================================
-- pruebas_app.sql
-- Pruebas de reglas del negocio y permisos, ejecutadas como cam_app
-- (el mismo usuario técnico que usa la aplicación) sobre cam_test.
-- Cada caso deja una fila en pruebas.resultado (ok = true/false).
-- Los datos creados aquí se identifican con "PRUEBA".
-- =====================================================================
\set ON_ERROR_STOP on
\encoding UTF8
SET search_path = cam;

SELECT id AS sec FROM usuario WHERE login = 'secretaria' \gset
SELECT u.id AS u_ana,    p.id AS p_ana    FROM usuario u JOIN propietario p ON p.id = u.propietario_id WHERE p.cedula = '900000101' \gset
SELECT u.id AS u_carlos, p.id AS p_carlos FROM usuario u JOIN propietario p ON p.id = u.propietario_id WHERE p.cedula = '900000102' \gset
SELECT p.id AS p_ivan FROM propietario p WHERE p.cedula = '900000108' \gset
SELECT u.id AS u_ivan FROM usuario u WHERE u.propietario_id = :p_ivan \gset

-- ---------------------------------------------------------------------
-- PROPIETARIOS
-- ---------------------------------------------------------------------
SELECT pruebas.espera_error('P01 Propietario con cédula duplicada',
  $$INSERT INTO propietario (cedula, nombre_completo, correo) VALUES ('900000101', 'PRUEBA Duplicado', 'prueba.dup@ejemplo.test')$$, '23505');
SELECT pruebas.espera_error('P02 Propietario con correo duplicado (otra mayúscula)',
  $$INSERT INTO propietario (cedula, nombre_completo, correo) VALUES ('900000999', 'PRUEBA Duplicado', 'ANA.PEREZ@ejemplo.test')$$, '23505');
SELECT pruebas.espera_error('P03 Cédula con letras',
  $$INSERT INTO propietario (cedula, nombre_completo, correo) VALUES ('12AB45', 'PRUEBA Letras', 'prueba.letras@ejemplo.test')$$, '23514');
SELECT pruebas.espera_error('P04 Correo inválido',
  $$INSERT INTO propietario (cedula, nombre_completo, correo) VALUES ('900000998', 'PRUEBA Correo', 'sin-arroba')$$, '23514');

INSERT INTO propietario (cedula, nombre_completo, correo, creado_por)
VALUES ('900000201', 'PRUEBA Propietario Uno', 'prueba.uno@ejemplo.test', :sec) RETURNING id AS p_uno \gset
INSERT INTO propietario (cedula, nombre_completo, correo, creado_por)
VALUES ('900000202', 'PRUEBA Propietario Dos', 'prueba.dos@ejemplo.test', :sec) RETURNING id AS p_dos \gset
INSERT INTO propietario (cedula, nombre_completo, correo, creado_por)
VALUES ('900000203', 'PRUEBA Sin Historial', 'prueba.sinhist@ejemplo.test', :sec) RETURNING id AS p_sinhist \gset
SELECT pruebas.afirma('P05 Registro válido de propietario (cédula guardada como texto)',
  (SELECT cedula = '900000201' AND pg_typeof(cedula)::text = 'character varying' FROM propietario WHERE id = :p_uno));

-- ---------------------------------------------------------------------
-- SEMANAS Y CALENDARIO
-- ---------------------------------------------------------------------
SELECT pruebas.espera_error('S01 Semana con salida igual a la entrada',
  format($$INSERT INTO semana_fecha (semana_id, anio, fecha_entrada, fecha_salida) VALUES (%s, 2028, '2028-03-04', '2028-03-04')$$,
         (SELECT id FROM semana WHERE numero = 10)), '23514');
SELECT pruebas.espera_error('S02 Semana con salida anterior a la entrada',
  format($$INSERT INTO semana_fecha (semana_id, anio, fecha_entrada, fecha_salida) VALUES (%s, 2028, '2028-03-11', '2028-03-04')$$,
         (SELECT id FROM semana WHERE numero = 10)), '23514');
SELECT pruebas.espera_error('S03 Fechas que se cruzan con otra semana',
  format($$INSERT INTO semana_fecha (semana_id, anio, fecha_entrada, fecha_salida) VALUES (%s, 2028, '2027-01-05', '2027-01-12')$$,
         (SELECT id FROM semana WHERE numero = 10)), '23P01');
SELECT pruebas.espera_error('S04 Número de semana repetido',
  $$INSERT INTO semana (numero) VALUES (5)$$, '23505');
SELECT pruebas.espera_error('S05 Número de semana fuera de 1..52',
  $$INSERT INTO semana (numero) VALUES (53)$$, '23514');

-- ---------------------------------------------------------------------
-- ADQUISICIONES
-- ---------------------------------------------------------------------
SELECT pruebas.espera_error('A01 Asignar semana que ya tiene titular (semana 5)',
  format('SELECT fn_crear_adquisicion(%s, %s, %s, current_date)', :sec, :p_uno, (SELECT id FROM semana WHERE numero = 5)), 'CA409');
SELECT pruebas.espera_error('A02 Asignar a propietario inactivo',
  format('SELECT fn_crear_adquisicion(%s, %s, %s, current_date)', :sec, :p_ivan, (SELECT id FROM semana WHERE numero = 1)), 'CA409');
SELECT pruebas.espera_error('A03 Fecha de adquisición futura',
  format('SELECT fn_crear_adquisicion(%s, %s, %s, current_date + 1)', :sec, :p_uno, (SELECT id FROM semana WHERE numero = 1)), 'CA400');
SELECT pruebas.espera_error('A04 Propietario sin rol de secretaria no puede asignar',
  format('SELECT fn_crear_adquisicion(%s, %s, %s, current_date)', :u_ana, :p_uno, (SELECT id FROM semana WHERE numero = 1)), 'CA403');
SELECT pruebas.espera_error('A05 cam_app no puede insertar adquisiciones directamente',
  format($$INSERT INTO adquisicion (propietario_id, semana_id, fecha_adquisicion, parametro_id, valor_accion, numero_cuotas, valor_cuota, creado_por)
          VALUES (%s, %s, current_date, 1, 18000000, 24, 750000, %s)$$, :p_uno, (SELECT id FROM semana WHERE numero = 1), :sec), '42501');

SELECT fn_crear_adquisicion(:sec, :p_uno, (SELECT id FROM semana WHERE numero = 1), current_date - 400, 'PRUEBA') AS adq1 \gset
SELECT pruebas.afirma('A06 Adquisición válida copia las condiciones vigentes',
  (SELECT valor_accion = 18000000 AND numero_cuotas = 24 AND valor_cuota = 750000 AND estado_titularidad = 'VIGENTE'
     FROM adquisicion WHERE id = :adq1));
-- Un propietario puede tener varias semanas
SELECT fn_crear_adquisicion(:sec, :p_uno, (SELECT id FROM semana WHERE numero = 2), current_date - 400, 'PRUEBA') AS adq2 \gset
SELECT pruebas.afirma('A07 Un propietario con dos semanas tiene dos planes separados',
  (SELECT count(*) = 2 FROM v_estado_cuenta WHERE propietario_id = :p_uno));

-- ---------------------------------------------------------------------
-- PAGOS
-- ---------------------------------------------------------------------
SELECT fn_registrar_pago(:sec, :adq1, 1, 750000, current_date - 300, 'PRUEBA') AS pago1 \gset
SELECT pruebas.afirma('G01 Pago válido: queda NO_VERIFICADO, con usuario y fecha del servidor',
  (SELECT estado = 'NO_VERIFICADO' AND registrado_por = :sec AND registrado_en > now() - interval '1 minute'
          AND fecha_pago = current_date - 300 FROM pago WHERE id = :pago1));
SELECT pruebas.espera_error('G02 Cuota repetida en la misma adquisición',
  format('SELECT fn_registrar_pago(%s, %s, 1, 750000, current_date, NULL)', :sec, :adq1), 'CA409');
SELECT pruebas.espera_error('G03 Cuota 25 (fuera del plan de 24)',
  format('SELECT fn_registrar_pago(%s, %s, 25, 750000, current_date, NULL)', :sec, :adq1), 'CA400');
SELECT pruebas.espera_error('G04 Cuota 0',
  format('SELECT fn_registrar_pago(%s, %s, 0, 750000, current_date, NULL)', :sec, :adq1), 'CA400');
SELECT pruebas.espera_error('G05 Valor cero',
  format('SELECT fn_registrar_pago(%s, %s, 2, 0, current_date, NULL)', :sec, :adq1), 'CA400');
SELECT pruebas.espera_error('G06 Valor negativo',
  format('SELECT fn_registrar_pago(%s, %s, 2, -750000, current_date, NULL)', :sec, :adq1), 'CA400');
SELECT pruebas.espera_error('G07 Importe distinto a la cuota completa ($700.000)',
  format('SELECT fn_registrar_pago(%s, %s, 2, 700000, current_date, NULL)', :sec, :adq1), 'CA400');
SELECT pruebas.espera_error('G08 Fecha de pago futura',
  format('SELECT fn_registrar_pago(%s, %s, 2, 750000, current_date + 1, NULL)', :sec, :adq1), 'CA400');
SELECT pruebas.espera_error('G09 Adquisición inexistente',
  format('SELECT fn_registrar_pago(%s, 999999, 2, 750000, current_date, NULL)', :sec), 'CA404');
SELECT pruebas.espera_error('G10 Un propietario no puede registrar pagos',
  format('SELECT fn_registrar_pago(%s, %s, 2, 750000, current_date, NULL)', :u_ana, :adq1), 'CA403');
SELECT pruebas.espera_error('G11 cam_app no puede insertar pagos directamente',
  format($$INSERT INTO pago (adquisicion_id, numero_cuota, valor, fecha_pago, registrado_por) VALUES (%s, 2, 750000, current_date, %s)$$, :adq1, :sec), '42501');
SELECT pruebas.espera_error('G12 cam_app no puede modificar pagos directamente',
  format('UPDATE pago SET valor = 1 WHERE id = %s', :pago1), '42501');
SELECT pruebas.espera_error('G13 cam_app no puede eliminar pagos',
  format('DELETE FROM pago WHERE id = %s', :pago1), '42501');

-- Verificación
SELECT pruebas.espera_error('V01 No se emite comprobante de un pago sin verificar',
  format('SELECT fn_emitir_comprobante(%s, %s)', :sec, :pago1), 'CA409');
SELECT fn_verificar_pago(:sec, :pago1);
SELECT pruebas.afirma('V02 Verificación guarda usuario y fecha',
  (SELECT estado = 'VERIFICADO' AND verificado_por = :sec AND verificado_en IS NOT NULL FROM pago WHERE id = :pago1));
SELECT pruebas.espera_error('V03 Verificar dos veces',
  format('SELECT fn_verificar_pago(%s, %s)', :sec, :pago1), 'CA409');

-- Comprobantes
SELECT fn_emitir_comprobante(:sec, :pago1) AS cp1 \gset
SELECT pruebas.afirma('K01 Comprobante con número CP-, empresa y aclaración',
  (SELECT numero ~ '^CP-[0-9]{6}$' AND empresa = 'CAM PROYECTOS INMOBILIARIOS S.A.S.'
          AND nota = 'Soporte interno de pago. No es factura electrónica.'
          AND propietario_nombre = 'PRUEBA Propietario Uno' AND semana_numero = 1 AND numero_cuota = 1
          AND valor = 750000 AND emisor_nombre = 'DEMO Secretaria CAM'
     FROM comprobante WHERE id = :cp1));
SELECT pruebas.espera_error('K02 Segundo comprobante para el mismo pago',
  format('SELECT fn_emitir_comprobante(%s, %s)', :sec, :pago1), 'CA409');
SELECT pruebas.espera_error('K03 Anular un pago con comprobante',
  format($$SELECT fn_anular_pago(%s, %s, 'PRUEBA motivo')$$, :sec, :pago1), 'CA409');
SELECT pruebas.espera_error('K04 Revertir verificación de un pago con comprobante',
  format($$SELECT fn_revertir_verificacion(%s, %s, 'PRUEBA motivo')$$, :sec, :pago1), 'CA409');
SELECT pruebas.espera_error('K05 cam_app no puede modificar comprobantes',
  format($$UPDATE comprobante SET valor = 1 WHERE id = %s$$, :cp1), '42501');
-- La fotografía histórica no cambia si se edita el propietario
UPDATE propietario SET nombre_completo = 'PRUEBA Propietario Uno Editado', actualizado_por = :sec, actualizado_en = now() WHERE id = :p_uno;
SELECT pruebas.afirma('K06 El comprobante conserva el nombre original tras editar el propietario',
  (SELECT propietario_nombre = 'PRUEBA Propietario Uno' FROM comprobante WHERE id = :cp1));
SELECT pruebas.afirma('K07 Comprobante nace pendiente de envío',
  (SELECT estado_envio = 'PENDIENTE' FROM v_comprobante_detalle WHERE id = :cp1));
SELECT fn_registrar_envio(:sec, :cp1, 'prueba.uno@ejemplo.test', 'FALLIDO', 'PRUEBA: servidor de correo no configurado');
SELECT pruebas.afirma('K08 Envío fallido queda FALLIDO (no se marca enviado)',
  (SELECT estado_envio = 'FALLIDO' FROM v_comprobante_detalle WHERE id = :cp1));

-- Anulación lógica
SELECT fn_registrar_pago(:sec, :adq1, 2, 750000, current_date - 270, 'PRUEBA-error') AS pago2 \gset
SELECT pruebas.espera_error('N01 Anular sin motivo',
  format($$SELECT fn_anular_pago(%s, %s, '')$$, :sec, :pago2), 'CA400');
SELECT fn_anular_pago(:sec, :pago2, 'PRUEBA: valor digitado en la adquisición equivocada');
SELECT pruebas.afirma('N02 Pago anulado conserva historial (usuario, fecha y motivo)',
  (SELECT estado = 'ANULADO' AND anulado_por = :sec AND anulado_en IS NOT NULL AND motivo_anulacion LIKE 'PRUEBA%' FROM pago WHERE id = :pago2));
SELECT fn_registrar_pago(:sec, :adq1, 2, 750000, current_date - 270, 'PRUEBA') AS pago2b \gset
SELECT pruebas.afirma('N03 La cuota anulada se puede registrar de nuevo', :pago2b IS NOT NULL);
SELECT pruebas.espera_error('N04 Un pago anulado no se puede verificar',
  format('SELECT fn_verificar_pago(%s, %s)', :sec, :pago2), 'CA409');

-- ---------------------------------------------------------------------
-- ESTADO DE CUENTA (FUN-EDC-01 con regla D2)
-- adq2: 10 cuotas verificadas + 2 registradas sin verificar.
-- ---------------------------------------------------------------------
DO $$
DECLARE v_sec bigint := (SELECT id FROM cam.usuario WHERE login = 'secretaria');
        v_adq bigint := (SELECT a.id FROM cam.adquisicion a JOIN cam.semana s ON s.id = a.semana_id WHERE s.numero = 2 AND a.estado_titularidad = 'VIGENTE');
        v_p bigint;
BEGIN
  FOR k IN 1..12 LOOP
    v_p := cam.fn_registrar_pago(v_sec, v_adq, k, 750000, current_date - 365 + k * 20, 'PRUEBA');
    IF k <= 10 THEN PERFORM cam.fn_verificar_pago(v_sec, v_p); END IF;
  END LOOP;
END $$;
SELECT pruebas.afirma('E01 10 cuotas verificadas: abonado $7.500.000, 14 pendientes, saldo $10.500.000',
  (SELECT total_abonado = 7500000 AND cuotas_pendientes = 14 AND saldo = 10500000 AND cuotas_pagadas = 10
     FROM v_estado_cuenta WHERE adquisicion_id = :adq2),
  (SELECT format('abonado=%s pendientes=%s saldo=%s', total_abonado, cuotas_pendientes, saldo) FROM v_estado_cuenta WHERE adquisicion_id = :adq2));
SELECT pruebas.afirma('E02 Los 2 pagos sin verificar se ven como registrados pero NO bajan el saldo',
  (SELECT total_registrado = 9000000 AND cuotas_por_verificar = 2 AND saldo = 10500000 FROM v_estado_cuenta WHERE adquisicion_id = :adq2));
SELECT pruebas.afirma('E03 El plan de cuotas muestra 10 PAGADA, 2 POR_VERIFICAR y 12 PENDIENTE',
  (SELECT count(*) FILTER (WHERE situacion_cuota = 'PAGADA') = 10
      AND count(*) FILTER (WHERE situacion_cuota = 'POR_VERIFICAR') = 2
      AND count(*) FILTER (WHERE situacion_cuota = 'PENDIENTE') = 12
     FROM v_plan_cuotas WHERE adquisicion_id = :adq2));
SELECT pruebas.afirma('E04 Cada adquisición de un mismo propietario tiene su propio saldo',
  (SELECT count(DISTINCT saldo) = 2 FROM v_estado_cuenta WHERE propietario_id = :p_uno));

-- Terminar de pagar NO libera la semana (Carlos, semana 12: 24/24 verificadas)
SELECT pruebas.afirma('E05 Adquisición pagada por completo conserva su titular',
  (SELECT ec.situacion_pago = 'PAGADA' AND ec.estado_titularidad = 'VIGENTE' AND st.disponibilidad = 'CON_TITULAR'
     FROM v_estado_cuenta ec JOIN v_semana_titular st ON st.adquisicion_id = ec.adquisicion_id WHERE ec.semana_numero = 12));
SELECT pruebas.espera_error('E06 No se puede asignar la semana 12 aunque esté pagada',
  format('SELECT fn_crear_adquisicion(%s, %s, %s, current_date)', :sec, :p_dos, (SELECT id FROM semana WHERE numero = 12)), 'CA409');

-- ---------------------------------------------------------------------
-- PARÁMETROS: conservación de condiciones históricas (CP12)
-- ---------------------------------------------------------------------
SELECT pruebas.espera_error('R01 Parámetros incoherentes (24 × $700.000 ≠ $18.000.000)',
  format('SELECT fn_nuevo_parametro(%s, 18000000, 24, 700000)', :sec), 'CA400');
SELECT pruebas.espera_error('R02 Un propietario no puede cambiar parámetros',
  format('SELECT fn_nuevo_parametro(%s, 20000000, 20, 1000000)', :u_ana), 'CA403');
SELECT fn_nuevo_parametro(:sec, 20000000, 20, 1000000);
SELECT fn_crear_adquisicion(:sec, :p_dos, (SELECT id FROM semana WHERE numero = 3), current_date - 10, 'PRUEBA') AS adq_nueva \gset
SELECT pruebas.afirma('R03 La nueva adquisición toma $20.000.000 / 20 / $1.000.000',
  (SELECT valor_accion = 20000000 AND numero_cuotas = 20 AND valor_cuota = 1000000 FROM adquisicion WHERE id = :adq_nueva));
SELECT pruebas.afirma('R04 Las adquisiciones anteriores conservan $18.000.000 / 24 / $750.000',
  (SELECT bool_and(valor_accion = 18000000 AND numero_cuotas = 24 AND valor_cuota = 750000) FROM adquisicion WHERE id <> :adq_nueva));
SELECT pruebas.afirma('R05 Los pagos históricos no cambian',
  (SELECT bool_and(valor = 750000) FROM pago WHERE adquisicion_id <> :adq_nueva));
SELECT pruebas.espera_error('R06 Adquisición antigua sigue exigiendo cuota de $750.000',
  format('SELECT fn_registrar_pago(%s, %s, 13, 1000000, current_date, NULL)', :sec, :adq2), 'CA400');
SELECT pruebas.espera_error('R07 Adquisición nueva: la cuota 21 está fuera de su plan de 20',
  format('SELECT fn_registrar_pago(%s, %s, 21, 1000000, current_date, NULL)', :sec, :adq_nueva), 'CA400');
SELECT fn_nuevo_parametro(:sec, 18000000, 24, 750000);   -- se restablece

-- ---------------------------------------------------------------------
-- COMUNIDAD
-- adquisiciones DEMO: Ana tiene semanas 5 y 30 (la 30 ya tiene oferta activa).
-- ---------------------------------------------------------------------
SELECT a.id AS adq_ana5 FROM adquisicion a JOIN semana s ON s.id = a.semana_id WHERE s.numero = 5 \gset
SELECT a.id AS adq_carlos12 FROM adquisicion a JOIN semana s ON s.id = a.semana_id WHERE s.numero = 12 \gset

SELECT pruebas.espera_error('C01 Ofertar una semana ajena (Ana oferta la semana 12 de Carlos)',
  format($$SELECT fn_publicar_oferta(%s, %s, 'VENTA', 1000000, 'PRUEBA ajena')$$, :u_ana, :adq_carlos12), 'CA403');
SELECT pruebas.espera_error('C02 Intercambio con precio',
  format($$SELECT fn_publicar_oferta(%s, %s, 'INTERCAMBIO', 500000, 'PRUEBA intercambio')$$, :u_ana, :adq_ana5), 'CA400');
SELECT pruebas.espera_error('C03 Venta sin precio',
  format($$SELECT fn_publicar_oferta(%s, %s, 'VENTA', NULL, 'PRUEBA venta')$$, :u_ana, :adq_ana5), 'CA400');
SELECT pruebas.espera_error('C04 Venta con precio cero',
  format($$SELECT fn_publicar_oferta(%s, %s, 'VENTA', 0, 'PRUEBA venta')$$, :u_ana, :adq_ana5), 'CA400');
SELECT pruebas.espera_error('C05 La secretaria no publica ofertas',
  format($$SELECT fn_publicar_oferta(%s, %s, 'INTERCAMBIO', NULL, 'PRUEBA secretaria')$$, :sec, :adq_ana5), 'CA403');
SELECT pruebas.espera_error('C06 Propietario inactivo no puede publicar',
  format($$SELECT fn_publicar_oferta(%s, %s, 'INTERCAMBIO', NULL, 'PRUEBA inactivo')$$, :u_ivan,
         (SELECT a.id FROM adquisicion a JOIN semana s ON s.id = a.semana_id WHERE s.numero = 50)), 'CA403');
SELECT fn_publicar_oferta(:u_ana, :adq_ana5, 'INTERCAMBIO', NULL, 'PRUEBA intercambio semana 5') AS of1 \gset
SELECT pruebas.afirma('C07 Intercambio sin precio sobre semana propia: publicado y ACTIVO',
  (SELECT estado = 'ACTIVA' AND precio IS NULL FROM oferta WHERE id = :of1));
SELECT pruebas.espera_error('C08 Segunda oferta activa para la misma semana',
  format($$SELECT fn_publicar_oferta(%s, %s, 'VENTA', 1000000, 'PRUEBA duplicada')$$, :u_ana, :adq_ana5), 'CA409');
SELECT pruebas.espera_error('C09 Carlos no puede retirar la oferta de Ana',
  format($$SELECT fn_cerrar_oferta(%s, %s, 'RETIRADA')$$, :u_carlos, :of1), 'CA403');
SELECT fn_enviar_mensaje(:u_carlos, :of1, 'PRUEBA: me interesa');
SELECT pruebas.afirma('C10 Mensaje en oferta activa queda registrado', (SELECT total_mensajes = 1 FROM v_oferta_detalle WHERE oferta_id = :of1));
SELECT pruebas.espera_error('C11 cam_app no puede insertar mensajes directamente',
  format($$INSERT INTO mensaje (oferta_id, autor_id, texto) VALUES (%s, %s, 'x')$$, :of1, :u_carlos), '42501');
SELECT fn_cerrar_oferta(:u_ana, :of1, 'CONCRETADA');
SELECT pruebas.espera_error('C12 Mensaje en oferta CONCRETADA',
  format($$SELECT fn_enviar_mensaje(%s, %s, 'PRUEBA tarde')$$, :u_carlos, :of1), 'CA409');
SELECT pruebas.afirma('C13 Concretar la oferta NO transfiere la titularidad',
  (SELECT propietario_id = :p_ana AND estado_titularidad = 'VIGENTE' FROM adquisicion WHERE id = :adq_ana5));
SELECT pruebas.espera_error('C14 Mensaje en oferta RETIRADA (DEMO Diana)',
  format($$SELECT fn_enviar_mensaje(%s, %s, 'PRUEBA')$$, :u_carlos, (SELECT id FROM oferta WHERE estado = 'RETIRADA' LIMIT 1)), 'CA409');
SELECT pruebas.espera_error('C15 Eliminar oferta que tiene mensajes',
  format('SELECT fn_eliminar_oferta(%s, %s)', :u_ana, :of1), 'CA409');
SELECT pruebas.afirma('C16 La vista de ofertas no expone cédula ni correo',
  NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'cam' AND table_name = 'v_oferta_detalle'
               AND column_name IN ('cedula', 'correo')));

-- ---------------------------------------------------------------------
-- ELIMINACIÓN DE PROPIETARIOS
-- ---------------------------------------------------------------------
SELECT pruebas.espera_error('D01 No se elimina un propietario con adquisiciones',
  format('SELECT fn_eliminar_propietario(%s, %s)', :sec, :p_uno), 'CA409');
SELECT pruebas.espera_error('D02 cam_app no tiene DELETE directo sobre propietarios',
  format('DELETE FROM propietario WHERE id = %s', :p_sinhist), '42501');
SELECT fn_eliminar_propietario(:sec, :p_sinhist);
SELECT pruebas.afirma('D03 Propietario sin historial se puede eliminar', NOT EXISTS (SELECT 1 FROM propietario WHERE id = :p_sinhist));

-- ---------------------------------------------------------------------
-- SEGURIDAD DE CUENTAS Y PRIVILEGIOS
-- ---------------------------------------------------------------------
SELECT pruebas.espera_error('U01 Contraseña en texto plano es rechazada',
  $$INSERT INTO usuario (rol, login, nombre, password_hash) VALUES ('SECRETARIA', 'prueba.plano', 'PRUEBA', 'Clave123')$$, '23514');
SELECT pruebas.espera_error('U02 cam_app no puede cambiar el rol de una cuenta',
  format($$UPDATE usuario SET rol = 'SECRETARIA' WHERE id = %s$$, :u_ana), '42501');
SELECT pruebas.espera_error('U03 cam_app no puede crear tablas',
  $$CREATE TABLE cam.intrusa (id int)$$, '42501');
SELECT pruebas.espera_error('U04 cam_app no puede borrar tablas',
  $$DROP TABLE cam.pago$$, '42501');
SELECT pruebas.afirma('U05 Ningún hash es legible: todos tienen formato bcrypt',
  (SELECT bool_and(password_hash ~ '^\$2[aby]\$') FROM usuario));
UPDATE usuario SET activo = false WHERE id = :u_carlos;
SELECT pruebas.espera_error('U06 Usuario desactivado no puede operar',
  format($$SELECT fn_enviar_mensaje(%s, (SELECT id FROM oferta WHERE estado = 'ACTIVA' LIMIT 1), 'PRUEBA')$$, :u_carlos), 'CA403');
UPDATE usuario SET activo = true WHERE id = :u_carlos;

-- ---------------------------------------------------------------------
-- REPORTES
-- ---------------------------------------------------------------------
SELECT pruebas.afirma('T01 Sin pago en oct-2026: excluye a quien pagó en octubre (DEMO Gabriel, semana 45)',
  NOT EXISTS (SELECT 1 FROM fn_sin_pago_en_mes(2026, 10) WHERE semana_numero = 45));
SELECT pruebas.afirma('T02 Sin pago en oct-2026: excluye adquisiciones con todas las cuotas registradas (semana 12)',
  NOT EXISTS (SELECT 1 FROM fn_sin_pago_en_mes(2026, 10) WHERE semana_numero = 12));
SELECT pruebas.afirma('T03 Sin pago en oct-2026: incluye a DEMO Esteban (semana 22, sin pagos)',
  EXISTS (SELECT 1 FROM fn_sin_pago_en_mes(2026, 10) WHERE semana_numero = 22));
SELECT pruebas.afirma('T04 Recaudo mensual = suma de pagos no anulados',
  (SELECT sum(total_registrado) FROM v_recaudo_mensual) = (SELECT sum(valor) FROM pago WHERE estado <> 'ANULADO'));
SELECT pruebas.afirma('T05 Panel: saldo por cobrar = suma de saldos de adquisiciones vigentes',
  (SELECT saldo_por_cobrar FROM v_panel) = (SELECT sum(valor_accion) FROM adquisicion WHERE estado_titularidad = 'VIGENTE')
                                          - (SELECT sum(p.valor) FROM pago p JOIN adquisicion a ON a.id = p.adquisicion_id
                                              WHERE p.estado = 'VERIFICADO' AND a.estado_titularidad = 'VIGENTE'));
SELECT pruebas.afirma('T06 Auditoría registra quién hizo cada operación',
  (SELECT count(*) >= 5 FROM auditoria WHERE usuario_id = :sec AND tabla = 'pago'));
