// Adquisiciones (asignaciones), estado de cuenta y plan de cuotas (solo SECRETARIA).
const express = require('express');
const bd = require('../db');
const v = require('../validar');
const { ErrorApp } = require('../errores');
const { usuarioId } = require('../seguridad');

const router = express.Router();

// GET /api/adquisiciones?propietario_id=&q=&situacion=EN_CURSO|PAGADA
router.get('/', async (req, res) => {
  const propietario = req.query.propietario_id ? v.id(req.query.propietario_id, 'propietario') : null;
  const q = v.texto(req.query.q, 'búsqueda', { max: 120, opcional: true });
  const situacion = v.opcion(req.query.situacion, 'situación', ['EN_CURSO', 'PAGADA'], { opcional: true });
  res.json(await bd.filas(
    `SELECT * FROM v_estado_cuenta
      WHERE ($1::bigint IS NULL OR propietario_id = $1)
        AND ($2::text IS NULL OR cedula LIKE $2 || '%' OR nombre_completo ILIKE '%' || $2 || '%' OR semana_numero::text = $2)
        AND ($3::text IS NULL OR situacion_pago = $3)
      ORDER BY semana_numero`, [propietario, q, situacion]));
});

// GET /api/adquisiciones/:id  -> ESTADO DE CUENTA completo de una adquisición
router.get('/:id', async (req, res) => {
  const id = v.id(req.params.id);
  const ec = await bd.fila('SELECT * FROM v_estado_cuenta WHERE adquisicion_id = $1', [id]);
  if (!ec) throw new ErrorApp(404, 'La adquisición no existe.');
  ec.cuotas = await bd.filas('SELECT * FROM v_plan_cuotas WHERE adquisicion_id = $1 ORDER BY numero_cuota', [id]);
  ec.pagos = await bd.filas('SELECT * FROM v_pago_detalle WHERE adquisicion_id = $1 ORDER BY numero_cuota, registrado_en', [id]);
  res.json(ec);
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
