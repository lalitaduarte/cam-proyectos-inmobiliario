-- =====================================================================
-- cargar_volumen.sql
-- Carga de VOLUMEN para medir rendimiento (RNF-REN-01/02, RNF-ESC-01, CP15).
-- Solo se ejecuta en cam_test, después de reconstruirla con los datos DEMO.
-- Todo pasa por las MISMAS funciones de negocio que usa la aplicación
-- (fn_crear_adquisicion, fn_registrar_pago, fn_verificar_pago,
-- fn_emitir_comprobante), así que las reglas se validan también aquí.
--
-- Resultado: 200 propietarios, 52 semanas con titular y 24 cuotas pagadas
-- en cada una = 1.248 cuotas (el máximo posible de una vivienda de 52 semanas).
-- =====================================================================
\set ON_ERROR_STOP on
\encoding UTF8
DO $$
DECLARE
  v_sec   bigint := (SELECT id FROM cam.usuario WHERE login = 'secretaria');
  v_prop  bigint;
  v_adq   cam.adquisicion;
  v_pago  bigint;
  v_fecha date;
  n       int := 0;
BEGIN
  IF current_database() <> 'cam_test' THEN
    RAISE EXCEPTION 'cargar_volumen.sql solo se ejecuta en cam_test (base actual: %).', current_database();
  END IF;

  -- 1. Completar 200 propietarios (los DEMO son 8).
  INSERT INTO cam.propietario (cedula, nombre_completo, correo, creado_por)
  SELECT (910000000 + g)::text, 'VOLUMEN Propietario ' || lpad(g::text, 3, '0'),
         'volumen' || g || '@ejemplo.test', v_sec
    FROM generate_series(1, 200 - (SELECT count(*) FROM cam.propietario)) g;

  -- 2. Asignar todas las semanas libres (una por propietario de volumen).
  FOR v_prop IN
    SELECT s.id FROM cam.semana s
     WHERE NOT EXISTS (SELECT 1 FROM cam.adquisicion a WHERE a.semana_id = s.id AND a.estado_titularidad = 'VIGENTE')
     ORDER BY s.numero
  LOOP
    PERFORM cam.fn_crear_adquisicion(
      v_sec,
      (SELECT p.id FROM cam.propietario p
        WHERE p.activo AND NOT EXISTS (SELECT 1 FROM cam.adquisicion a WHERE a.propietario_id = p.id)
        ORDER BY p.id LIMIT 1),
      v_prop, date '2024-01-10', 'VOLUMEN');
  END LOOP;

  -- 3. Pagar las 24 cuotas de todas las adquisiciones (las que falten).
  --    Se verifica el 90 % y se emite comprobante a la mitad de los verificados.
  FOR v_adq IN SELECT * FROM cam.adquisicion WHERE estado_titularidad = 'VIGENTE' ORDER BY id LOOP
    FOR k IN 1 .. v_adq.numero_cuotas LOOP
      CONTINUE WHEN EXISTS (SELECT 1 FROM cam.pago
                             WHERE adquisicion_id = v_adq.id AND numero_cuota = k AND estado <> 'ANULADO');
      v_fecha := LEAST(current_date,
                       GREATEST(v_adq.fecha_adquisicion,
                                (date_trunc('month', v_adq.fecha_adquisicion) + k * interval '1 month')::date + 4));
      v_pago := cam.fn_registrar_pago(v_sec, v_adq.id, k, v_adq.valor_cuota, v_fecha, 'VOL-' || k);
      n := n + 1;
      IF n % 10 <> 0 THEN
        PERFORM cam.fn_verificar_pago(v_sec, v_pago);
        IF n % 2 = 0 THEN PERFORM cam.fn_emitir_comprobante(v_sec, v_pago); END IF;
      END IF;
    END LOOP;
  END LOOP;
END $$;

SELECT (SELECT count(*) FROM cam.propietario)                          AS propietarios,
       (SELECT count(*) FROM cam.adquisicion WHERE estado_titularidad = 'VIGENTE') AS semanas_con_titular,
       (SELECT count(*) FROM cam.pago WHERE estado <> 'ANULADO')       AS cuotas_pagadas,
       (SELECT count(*) FROM cam.pago WHERE estado = 'VERIFICADO')     AS verificadas,
       (SELECT count(*) FROM cam.comprobante)                          AS comprobantes;
