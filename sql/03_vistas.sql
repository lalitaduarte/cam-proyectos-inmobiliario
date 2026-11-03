-- =====================================================================
-- 03_vistas.sql
-- Proyecto CAM · Vistas de consulta y reportes.
-- Una VISTA es una consulta guardada con nombre: siempre muestra los
-- datos actuales. Ninguna cifra queda escrita a mano.
--
-- Regla de saldo (decisión D2): solo los pagos VERIFICADOS descuentan el
-- saldo. Los pagos registrados (verificados o no) se muestran aparte.
-- Los pagos ANULADOS no cuentan para nada.
-- =====================================================================
\set ON_ERROR_STOP on
\encoding UTF8
SET search_path = cam;

-- ---------------------------------------------------------------------
-- Totales de pagos por adquisición (base de las demás vistas).
-- ---------------------------------------------------------------------
CREATE VIEW v_totales_adquisicion AS
SELECT adquisicion_id,
       count(*)                                              AS cuotas_registradas,
       count(*) FILTER (WHERE estado = 'VERIFICADO')         AS cuotas_verificadas,
       COALESCE(sum(valor), 0)                               AS total_registrado,
       COALESCE(sum(valor) FILTER (WHERE estado = 'VERIFICADO'), 0) AS total_verificado
  FROM pago
 WHERE estado <> 'ANULADO'
 GROUP BY adquisicion_id;

-- ---------------------------------------------------------------------
-- ESTADO DE CUENTA por adquisición (FUN-EDC-01, RN08 con regla D2).
-- Ejemplo: 10 cuotas verificadas de $750.000 → abonado $7.500.000,
-- 14 pendientes, saldo $10.500.000.
-- ---------------------------------------------------------------------
CREATE VIEW v_estado_cuenta AS
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
            THEN 'PAGADA' ELSE 'EN_CURSO' END                          AS situacion_pago
  FROM adquisicion a
  JOIN propietario pr ON pr.id = a.propietario_id
  JOIN semana s       ON s.id  = a.semana_id
  LEFT JOIN v_totales_adquisicion t ON t.adquisicion_id = a.id;

-- ---------------------------------------------------------------------
-- PLAN DE CUOTAS: una fila por cuota (1..N) con su situación.
--   PAGADA         : tiene pago verificado.
--   POR_VERIFICAR  : tiene pago registrado sin verificar.
--   PENDIENTE      : sin pago (no significa "vencida": no hay calendario, D6).
-- ---------------------------------------------------------------------
CREATE VIEW v_plan_cuotas AS
SELECT a.id AS adquisicion_id,
       c.numero_cuota,
       a.valor_cuota,
       p.id         AS pago_id,
       p.fecha_pago,
       p.estado     AS estado_pago,
       CASE WHEN p.id IS NULL              THEN 'PENDIENTE'
            WHEN p.estado = 'VERIFICADO'   THEN 'PAGADA'
            ELSE 'POR_VERIFICAR' END       AS situacion_cuota,
       cp.numero    AS comprobante_numero
  FROM adquisicion a
 CROSS JOIN LATERAL generate_series(1, a.numero_cuotas) AS c(numero_cuota)
  LEFT JOIN pago p ON p.adquisicion_id = a.id AND p.numero_cuota = c.numero_cuota AND p.estado <> 'ANULADO'
  LEFT JOIN comprobante cp ON cp.pago_id = p.id;

-- ---------------------------------------------------------------------
-- ESTADO DE ENVÍO de cada comprobante:
--   ENVIADO   : existe al menos un envío exitoso.
--   FALLIDO   : el último intento falló y ninguno fue exitoso.
--   PENDIENTE : nunca se intentó enviar.
-- ---------------------------------------------------------------------
CREATE VIEW v_comprobante_detalle AS
SELECT c.*,
       CASE WHEN EXISTS (SELECT 1 FROM envio_comprobante e WHERE e.comprobante_id = c.id AND e.estado = 'ENVIADO') THEN 'ENVIADO'
            WHEN EXISTS (SELECT 1 FROM envio_comprobante e WHERE e.comprobante_id = c.id) THEN 'FALLIDO'
            ELSE 'PENDIENTE' END AS estado_envio,
       (SELECT max(e.intentado_en) FROM envio_comprobante e WHERE e.comprobante_id = c.id) AS ultimo_intento
  FROM comprobante c;

-- ---------------------------------------------------------------------
-- DETALLE DE PAGOS (historial FUN-PAG-04) con propietario, semana,
-- usuarios que intervinieron y comprobante.
-- ---------------------------------------------------------------------
CREATE VIEW v_pago_detalle AS
SELECT p.id AS pago_id,
       p.adquisicion_id,
       a.propietario_id,
       pr.cedula,
       pr.nombre_completo,
       s.numero          AS semana_numero,
       p.numero_cuota,
       a.numero_cuotas,
       p.valor,
       p.fecha_pago,
       p.referencia,
       p.estado,
       p.registrado_en,
       ur.nombre         AS registrado_por_nombre,
       p.verificado_en,
       uv.nombre         AS verificado_por_nombre,
       p.anulado_en,
       ua.nombre         AS anulado_por_nombre,
       p.motivo_anulacion,
       cd.id             AS comprobante_id,
       cd.numero         AS comprobante_numero,
       cd.estado_envio
  FROM pago p
  JOIN adquisicion a  ON a.id  = p.adquisicion_id
  JOIN propietario pr ON pr.id = a.propietario_id
  JOIN semana s       ON s.id  = a.semana_id
  JOIN usuario ur     ON ur.id = p.registrado_por
  LEFT JOIN usuario uv ON uv.id = p.verificado_por
  LEFT JOIN usuario ua ON ua.id = p.anulado_por
  LEFT JOIN v_comprobante_detalle cd ON cd.pago_id = p.id;

-- ---------------------------------------------------------------------
-- RECAUDO MENSUAL por mes de la fecha de pago. Registrado y verificado
-- por separado (D2). No incluye anulados.
-- ---------------------------------------------------------------------
CREATE VIEW v_recaudo_mensual AS
SELECT date_trunc('month', fecha_pago)::date                          AS mes,
       count(*)                                                       AS pagos_registrados,
       sum(valor)                                                     AS total_registrado,
       count(*) FILTER (WHERE estado = 'VERIFICADO')                  AS pagos_verificados,
       COALESCE(sum(valor) FILTER (WHERE estado = 'VERIFICADO'), 0)   AS total_verificado
  FROM pago
 WHERE estado <> 'ANULADO'
 GROUP BY 1;

-- ---------------------------------------------------------------------
-- SEMANAS con su titular actual (o DISPONIBLE).
-- ---------------------------------------------------------------------
CREATE VIEW v_semana_titular AS
SELECT s.id AS semana_id,
       s.numero,
       s.descripcion,
       s.activa,
       a.id               AS adquisicion_id,
       a.propietario_id,
       pr.cedula          AS titular_cedula,
       pr.nombre_completo AS titular_nombre,
       a.fecha_adquisicion,
       CASE WHEN a.id IS NULL THEN 'DISPONIBLE' ELSE 'CON_TITULAR' END AS disponibilidad
  FROM semana s
  LEFT JOIN adquisicion a  ON a.semana_id = s.id AND a.estado_titularidad = 'VIGENTE'
  LEFT JOIN propietario pr ON pr.id = a.propietario_id;

-- ---------------------------------------------------------------------
-- OFERTAS con datos públicos de la comunidad. Por la Ley 1581 NO se
-- exponen cédula ni correo del autor; solo su nombre.
-- ---------------------------------------------------------------------
CREATE VIEW v_oferta_detalle AS
SELECT o.id AS oferta_id,
       o.adquisicion_id,
       a.propietario_id,
       pr.nombre_completo AS autor_nombre,
       s.numero           AS semana_numero,
       o.tipo,
       o.precio,
       o.descripcion,
       o.estado,
       o.publicada_en,
       o.cerrada_en,
       (SELECT count(*) FROM mensaje m WHERE m.oferta_id = o.id) AS total_mensajes
  FROM oferta o
  JOIN adquisicion a  ON a.id  = o.adquisicion_id
  JOIN propietario pr ON pr.id = a.propietario_id
  JOIN semana s       ON s.id  = a.semana_id;

-- ---------------------------------------------------------------------
-- MENSAJES con nombre y rol del autor (sin cédula ni correo).
-- ---------------------------------------------------------------------
CREATE VIEW v_mensaje_detalle AS
SELECT m.id AS mensaje_id,
       m.oferta_id,
       m.autor_id,
       u.rol AS autor_rol,
       CASE WHEN u.rol = 'SECRETARIA' THEN u.nombre || ' (CAM)' ELSE pr.nombre_completo END AS autor_nombre,
       m.texto,
       m.enviado_en
  FROM mensaje m
  JOIN usuario u ON u.id = m.autor_id
  LEFT JOIN propietario pr ON pr.id = u.propietario_id;

-- ---------------------------------------------------------------------
-- PANEL PRINCIPAL: todos los indicadores en una fila, calculados.
-- ---------------------------------------------------------------------
CREATE VIEW v_panel AS
SELECT
  (SELECT count(*) FROM propietario WHERE activo)                                    AS propietarios_activos,
  (SELECT count(*) FROM propietario)                                                 AS propietarios_registrados,
  (SELECT count(*) FROM semana)                                                      AS semanas_total,
  (SELECT count(*) FROM adquisicion WHERE estado_titularidad = 'VIGENTE')            AS semanas_con_titular,
  (SELECT COALESCE(sum(numero_cuotas), 0) FROM adquisicion WHERE estado_titularidad = 'VIGENTE') AS cuotas_plan_total,
  (SELECT count(*) FROM pago WHERE estado = 'VERIFICADO')                            AS cuotas_pagadas_verificadas,
  (SELECT count(*) FROM pago WHERE estado <> 'ANULADO')                              AS cuotas_registradas,
  (SELECT count(*) FROM pago WHERE estado = 'NO_VERIFICADO')                         AS pagos_por_verificar,
  (SELECT COALESCE(sum(valor), 0) FROM pago WHERE estado <> 'ANULADO')               AS total_registrado,
  (SELECT COALESCE(sum(valor), 0) FROM pago WHERE estado = 'VERIFICADO')             AS total_verificado,
  (SELECT COALESCE(sum(saldo), 0) FROM v_estado_cuenta WHERE estado_titularidad = 'VIGENTE') AS saldo_por_cobrar,
  (SELECT count(*) FROM v_comprobante_detalle WHERE estado_envio <> 'ENVIADO')       AS comprobantes_por_enviar,
  (SELECT count(*) FROM oferta WHERE estado = 'ACTIVA')                              AS ofertas_activas;
