-- =====================================================================
-- 06_datos_demo.sql
-- Proyecto CAM · Datos FICTICIOS de demostración.
--
-- * Todos los nombres empiezan por "DEMO" y los correos usan el dominio
--   reservado ejemplo.test (no puede recibir correos reales).
-- * Las cédulas son inventadas (rango 9000001xx).
-- * Las fechas del calendario 2027 son de EJEMPLO, no son las de CAM.
-- * Adquisiciones, pagos, comprobantes y ofertas se crean con las mismas
--   funciones que usa la aplicación, así que cumplen todas las reglas.
--
-- Contraseñas de demostración (cámbielas antes de publicar):
--   secretaria             -> login: secretaria      clave: CamDemo2026!
--   propietarios DEMO      -> login: su cédula       clave: Propietario2026!
--
-- Se ejecuta como cam_admin, una sola vez, sobre una base recién creada.
-- =====================================================================
\set ON_ERROR_STOP on
\encoding UTF8
SET search_path = cam;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM propietario) OR EXISTS (SELECT 1 FROM usuario) THEN
    RAISE EXCEPTION 'La base ya tiene datos. Los datos DEMO solo se cargan en una base vacía.';
  END IF;
END $$;

DO $$
DECLARE
  v_sec   bigint;                 -- usuario secretaria
  v_adq   bigint[] := '{}';       -- adquisiciones creadas (en orden)
  v_prop  bigint[];
  v_pago  bigint;
  v_of    bigint;
  i       int;
  -- Plan de demostración: propietario (índice), semana, fecha de adquisición,
  -- cuotas registradas, cuotas verificadas (las primeras), comprobantes (las primeras)
  plan CONSTANT jsonb := '[
    {"p":1,"s":5, "f":"2025-06-01","reg":10,"ver":10,"cp":8},
    {"p":1,"s":30,"f":"2025-09-10","reg":3, "ver":2, "cp":0},
    {"p":2,"s":12,"f":"2024-08-01","reg":24,"ver":24,"cp":2},
    {"p":2,"s":40,"f":"2026-01-15","reg":1, "ver":0, "cp":0},
    {"p":3,"s":18,"f":"2025-11-01","reg":5, "ver":5, "cp":0},
    {"p":4,"s":22,"f":"2026-05-01","reg":0, "ver":0, "cp":0},
    {"p":5,"s":33,"f":"2025-12-01","reg":2, "ver":2, "cp":1},
    {"p":6,"s":45,"f":"2026-08-01","reg":3, "ver":1, "cp":0},
    {"p":8,"s":50,"f":"2025-04-01","reg":4, "ver":4, "cp":0}
  ]';
  e jsonb;
  k int;
  v_fecha date;
BEGIN
  -- 1. Cuenta de secretaria ------------------------------------------------
  INSERT INTO usuario (rol, login, nombre, password_hash, debe_cambiar_clave)
  VALUES ('SECRETARIA', 'secretaria', 'DEMO Secretaria CAM',
          ext.crypt('CamDemo2026!', ext.gen_salt('bf', 10)), false)
  RETURNING id INTO v_sec;

  -- 2. Parámetros iniciales: $18.000.000 en 24 cuotas de $750.000 ----------
  PERFORM fn_nuevo_parametro(v_sec, 18000000, 24, 750000);

  -- 3. Semanas 1 a 52 y calendario de EJEMPLO para 2027 --------------------
  INSERT INTO semana (numero, creado_por)
  SELECT n, v_sec FROM generate_series(1, 52) n;

  INSERT INTO semana_fecha (semana_id, anio, fecha_entrada, fecha_salida, nota, creado_por)
  SELECT s.id, 2027,
         date '2027-01-02' + (s.numero - 1) * 7,
         date '2027-01-02' + s.numero * 7,
         'DEMO: fechas de ejemplo; reemplazar por las reales de CAM', v_sec
    FROM semana s;

  -- 4. Propietarios DEMO y sus cuentas -------------------------------------
  WITH nuevos AS (
    INSERT INTO propietario (cedula, nombre_completo, correo, telefono, creado_por)
    VALUES ('900000101', 'DEMO Ana María Pérez Rojas',     'ana.perez@ejemplo.test',      '3000000101', v_sec),
           ('900000102', 'DEMO Carlos Andrés Ruiz Gómez',  'carlos.ruiz@ejemplo.test',    NULL,         v_sec),
           ('900000103', 'DEMO Diana Patricia Vargas León','diana.vargas@ejemplo.test',   '3000000103', v_sec),
           ('900000104', 'DEMO Esteban Mora Castillo',     'esteban.mora@ejemplo.test',   NULL,         v_sec),
           ('900000105', 'DEMO Fernanda Ortiz Díaz',       'fernanda.ortiz@ejemplo.test', '3000000105', v_sec),
           ('900000106', 'DEMO Gabriel Suárez Niño',       'gabriel.suarez@ejemplo.test', NULL,         v_sec),
           ('900000107', 'DEMO Helena Cárdenas Pinto',     'helena.cardenas@ejemplo.test',NULL,         v_sec),
           ('900000108', 'DEMO Iván Rincón Blanco',        'ivan.rincon@ejemplo.test',    NULL,         v_sec)
    RETURNING id, cedula
  )
  SELECT array_agg(id ORDER BY cedula) INTO v_prop FROM nuevos;

  INSERT INTO usuario (rol, propietario_id, password_hash, debe_cambiar_clave, creado_por)
  SELECT 'PROPIETARIO', id, ext.crypt('Propietario2026!', ext.gen_salt('bf', 10)), false, v_sec
    FROM propietario;

  -- 5. Adquisiciones, pagos y comprobantes según el plan --------------------
  FOR e IN SELECT * FROM jsonb_array_elements(plan) LOOP
    v_adq := v_adq || fn_crear_adquisicion(
               v_sec, v_prop[(e->>'p')::int],
               (SELECT id FROM semana WHERE numero = (e->>'s')::int),
               (e->>'f')::date, 'DEMO');
    FOR k IN 1 .. (e->>'reg')::int LOOP
      -- Pago el día 5 de cada mes desde el mes de adquisición.
      v_fecha := (date_trunc('month', (e->>'f')::date) + (k - 1) * interval '1 month')::date + 4;
      IF v_fecha < (e->>'f')::date THEN v_fecha := (e->>'f')::date; END IF;
      v_pago := fn_registrar_pago(v_sec, v_adq[array_upper(v_adq, 1)], k, 750000, v_fecha, 'DEMO-' || k);
      IF k <= (e->>'ver')::int THEN
        PERFORM fn_verificar_pago(v_sec, v_pago);
      END IF;
      IF k <= (e->>'cp')::int THEN
        PERFORM fn_emitir_comprobante(v_sec, v_pago);
      END IF;
    END LOOP;
  END LOOP;

  -- 6. Pago anulado de ejemplo (Diana, semana 18): se registra la cuota 6 con
  --    fecha equivocada, se anula y se registra de nuevo correctamente.
  v_pago := fn_registrar_pago(v_sec, v_adq[5], 6, 750000, date '2026-04-15', 'DEMO-6-error');
  PERFORM fn_anular_pago(v_sec, v_pago, 'DEMO: fecha de pago digitada por error');
  PERFORM fn_registrar_pago(v_sec, v_adq[5], 6, 750000, date '2026-04-05', 'DEMO-6');

  -- 7. Comunidad -------------------------------------------------------------
  -- Ana vende la semana 30
  v_of := fn_publicar_oferta((SELECT id FROM usuario WHERE propietario_id = v_prop[1]), v_adq[2], 'VENTA', 19500000,
                             'DEMO: vendo mi semana 30. Incluye el plan de pagos en curso.');
  PERFORM fn_enviar_mensaje((SELECT id FROM usuario WHERE propietario_id = v_prop[2]), v_of, 'DEMO: Hola Ana, ¿el precio es negociable?');
  PERFORM fn_enviar_mensaje((SELECT id FROM usuario WHERE propietario_id = v_prop[1]), v_of, 'DEMO: Hola Carlos, podemos conversarlo.');
  PERFORM fn_enviar_mensaje((SELECT id FROM usuario WHERE propietario_id = v_prop[3]), v_of, 'DEMO: Me interesa también, ¿qué fechas tiene?');

  -- Carlos ofrece intercambio de la semana 40
  v_of := fn_publicar_oferta((SELECT id FROM usuario WHERE propietario_id = v_prop[2]), v_adq[4], 'INTERCAMBIO', NULL,
                             'DEMO: cambio semana 40 por una semana de diciembre.');
  PERFORM fn_enviar_mensaje((SELECT id FROM usuario WHERE propietario_id = v_prop[5]), v_of, 'DEMO: Tengo la semana 33, ¿le sirve?');

  -- Diana publicó y luego retiró su oferta
  v_of := fn_publicar_oferta((SELECT id FROM usuario WHERE propietario_id = v_prop[3]), v_adq[5], 'VENTA', 18000000,
                             'DEMO: vendo semana 18.');
  PERFORM fn_enviar_mensaje(v_sec, v_of, 'DEMO: Recuerde que la venta debe formalizarse en la oficina de CAM.');
  PERFORM fn_cerrar_oferta((SELECT id FROM usuario WHERE propietario_id = v_prop[3]), v_of, 'RETIRADA');

  -- Fernanda concretó un intercambio (la titularidad NO cambia sola)
  v_of := fn_publicar_oferta((SELECT id FROM usuario WHERE propietario_id = v_prop[5]), v_adq[7], 'INTERCAMBIO', NULL,
                             'DEMO: intercambio semana 33 por semana de Semana Santa.');
  PERFORM fn_cerrar_oferta((SELECT id FROM usuario WHERE propietario_id = v_prop[5]), v_of, 'CONCRETADA');

  -- 8. Iván queda inactivo (conserva su adquisición e historial) -------------
  UPDATE propietario SET activo = false, actualizado_en = now(), actualizado_por = v_sec WHERE id = v_prop[8];
END $$;

-- Resumen de lo cargado
SELECT * FROM v_panel;
