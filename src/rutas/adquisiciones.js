// Adquisiciones (asignaciones), estado de cuenta y plan de cuotas (solo SECRETARIA).
const express = require('express');
const bd = require('../db');
const v = require('../validar');
const { ErrorApp } = require('../errores');
const { usuarioId } = require('../seguridad');

const router = express.Router();

// GET /api/adquisiciones?propietario_id=&q=&situacion=EN_CURSO|PAGADA&titularidad=VIGENTE|TRANSFERIDA
router.get('/', async (req, res) => {
  const propietario = req.query.propietario_id ? v.id(req.query.propietario_id, 'propietario') : null;
  const q = v.texto(req.query.q, 'búsqueda', { max: 120, opcional: true });
  const situacion = v.opcion(req.query.situacion, 'situación', ['EN_CURSO', 'PAGADA'], { opcional: true });
  const titularidad = v.opcion(req.query.titularidad, 'titularidad', ['VIGENTE', 'TRANSFERIDA'], { opcional: true });
  res.json(await bd.filas(
    `SELECT * FROM v_estado_cuenta
      WHERE ($1::bigint IS NULL OR propietario_id = $1)
        AND ($2::text IS NULL OR cedula LIKE $2 || '%' OR nombre_completo ILIKE '%' || $2 || '%' OR semana_numero::text = $2)
        AND ($3::text IS NULL OR situacion_pago = $3)
        AND ($4::text IS NULL OR estado_titularidad = $4)
      ORDER BY semana_numero, fecha_adquisicion, adquisicion_id`, [propietario, q, situacion, titularidad]));
});

// GET /api/adquisiciones/:id  -> ESTADO DE CUENTA completo de una adquisición
router.get('/:id', async (req, res) => {
  const id = v.id(req.params.id);
  const ec = await bd.fila('SELECT * FROM v_estado_cuenta WHERE adquisicion_id = $1', [id]);
  if (!ec) throw new ErrorApp(404, 'La adquisición no existe.');
  ec.cuotas = await bd.filas('SELECT * FROM v_plan_cuotas WHERE adquisicion_id = $1 ORDER BY numero_cuota', [id]);
  ec.pagos = await bd.filas('SELECT * FROM v_pago_detalle WHERE adquisicion_id = $1 ORDER BY numero_cuota, registrado_en', [id]);
  // Titulares de la semana (actual y anteriores) y pagos hechos por los anteriores.
  ec.titulares = await bd.filas('SELECT * FROM v_historial_titulares WHERE semana_id = $1 ORDER BY fecha_adquisicion DESC, adquisicion_id DESC', [ec.semana_id]);
  ec.pagos_anteriores = await bd.filas(
    `SELECT pd.* FROM v_pago_detalle pd JOIN v_adquisicion_linaje l ON l.ancestro_id = pd.adquisicion_id
      WHERE l.adquisicion_id = $1 AND l.nivel > 0 AND pd.estado <> 'ANULADO' ORDER BY pd.numero_cuota`, [id]);
  res.json(ec);
});

// POST /api/adquisiciones/:id/transferir  { nuevo_propietario_id, fecha, tipo, soporte }
// Cambio de titular (D16): el nuevo titular asume el saldo. Toda la regla está en
// fn_transferir_titularidad, que se ejecuta como una sola transacción.
router.post('/:id/transferir', async (req, res) => {
  const b = req.body || {};
  const r = await bd.fila('SELECT fn_transferir_titularidad($1, $2, $3, $4, $5, $6) AS id', [
    usuarioId(req),
    v.id(req.params.id, 'adquisición'),
    v.id(b.nuevo_propietario_id, 'nuevo titular'),
    v.fecha(b.fecha, 'fecha de la transferencia'),
    v.opcion(b.tipo, 'tipo', ['VENTA', 'CESION', 'INTERCAMBIO', 'OTRO']),
    v.texto(b.soporte, 'soporte', { min: 5, max: 300 }),
  ]);
  res.status(201).json(await bd.fila('SELECT * FROM v_estado_cuenta WHERE adquisicion_id = $1', [r.id]));
});

// POST /api/adquisiciones  { propietario_id, semana_id, fecha_adquisicion, observacion? }
router.post('/', async (req, res) => {
  const b = req.body || {};
  const r = await bd.fila('SELECT fn_crear_adquisicion($1, $2, $3, $4, $5) AS id', [
    usuarioId(req),
    v.id(b.propietario_id, 'propietario'),
    v.id(b.semana_id, 'semana'),
    v.fecha(b.fecha_adquisicion, 'fecha de adquisición'),
    v.texto(b.observacion, 'observación', { max: 300, opcional: true }),
  ]);
  res.status(201).json(await bd.fila('SELECT * FROM v_estado_cuenta WHERE adquisicion_id = $1', [r.id]));
});

module.exports = router;
