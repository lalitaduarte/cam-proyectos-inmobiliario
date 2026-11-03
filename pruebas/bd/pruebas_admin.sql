-- =====================================================================
-- pruebas_admin.sql
-- Prueba los TRIGGERS ejecutando como cam_admin (dueño de las tablas):
-- aunque alguien tenga permisos amplios y se salte las funciones, la
-- base de datos sigue protegiendo las reglas críticas.
-- =====================================================================
\set ON_ERROR_STOP on
\encoding UTF8
SET search_path = cam;

SELECT pc.pago_id AS pago_cp, pc.id AS cp FROM comprobante pc ORDER BY pc.id LIMIT 1 \gset
SELECT id AS pago_libre FROM pago p WHERE estado = 'NO_VERIFICADO'
   AND NOT EXISTS (SELECT 1 FROM comprobante c WHERE c.pago_id = p.id) ORDER BY id LIMIT 1 \gset
SELECT id AS adq FROM adquisicion ORDER BY id LIMIT 1 \gset

SELECT pruebas.espera_error('X01 Trigger: modificar un pago con comprobante',
  format('UPDATE pago SET referencia = %L WHERE id = %s', 'cambio', :pago_cp), 'CA409');
SELECT pruebas.espera_error('X02 Trigger: eliminar un pago',
  format('DELETE FROM pago WHERE id = %s', :pago_libre), 'CA409');
SELECT pruebas.espera_error('X03 Trigger: cambiar el valor de un pago sin comprobante',
  format('UPDATE pago SET valor = 1 WHERE id = %s', :pago_libre), 'CA409');
SELECT pruebas.espera_error('X04 Trigger: modificar un comprobante',
  format('UPDATE comprobante SET valor = 1 WHERE id = %s', :cp), 'CA409');
SELECT pruebas.espera_error('X05 Trigger: eliminar un comprobante',
  format('DELETE FROM comprobante WHERE id = %s', :cp), 'CA409');
SELECT pruebas.espera_error('X06 Trigger: modificar parámetros históricos',
  'UPDATE parametro_accion SET valor_cuota = 1', 'CA409');
SELECT pruebas.espera_error('X07 Trigger: cambiar condiciones de una adquisición',
  format('UPDATE adquisicion SET valor_cuota = 1, valor_accion = 24 WHERE id = %s', :adq), 'CA409');
SELECT pruebas.espera_error('X08 Trigger: eliminar una adquisición',
  format('DELETE FROM adquisicion WHERE id = %s', :adq), 'CA409');
SELECT pruebas.espera_error('X09 Trigger: insertar cuota 30 directo en la tabla',
  format('INSERT INTO pago (adquisicion_id, numero_cuota, valor, fecha_pago, registrado_por) VALUES (%s, 30, 750000, current_date, 1)', :adq), 'CA400');
SELECT pruebas.espera_error('X10 Índice único: segundo titular vigente directo en la tabla',
  format($$INSERT INTO adquisicion (propietario_id, semana_id, fecha_adquisicion, parametro_id, valor_accion, numero_cuotas, valor_cuota, creado_por)
          SELECT propietario_id, semana_id, current_date, parametro_id, valor_accion, numero_cuotas, valor_cuota, creado_por
            FROM adquisicion WHERE id = %s$$, :adq), '23505');
SELECT pruebas.espera_error('X11 Índice único: misma cuota dos veces directo en la tabla',
  format($$INSERT INTO pago (adquisicion_id, numero_cuota, valor, fecha_pago, registrado_por)
          SELECT adquisicion_id, numero_cuota, valor, fecha_pago, registrado_por FROM pago WHERE id = %s$$, :pago_libre), '23505');
SELECT pruebas.espera_error('X12 Mensaje directo en oferta cerrada',
  $$INSERT INTO mensaje (oferta_id, autor_id, texto) SELECT id, publicada_por, 'x' FROM oferta WHERE estado <> 'ACTIVA' LIMIT 1$$, 'CA409');
SELECT pruebas.espera_error('X13 CHECK: oferta de intercambio con precio directo en la tabla',
  $$UPDATE oferta SET precio = 100 WHERE tipo = 'INTERCAMBIO'$$, '23514');
