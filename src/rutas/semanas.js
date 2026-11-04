// Semanas y su calendario de fechas por año (solo SECRETARIA).
const express = require('express');
const bd = require('../db');
const v = require('../validar');
const { ErrorApp } = require('../errores');
const { usuarioId } = require('../seguridad');

const router = express.Router();

// GET /api/semanas?anio=2027  -> semanas con titular actual y fechas del año pedido
router.get('/', async (req, res) => {
  const anio = v.entero(req.query.anio, 'año', { min: 2000, max: 2100, opcional: true }) ?? new Date().getFullYear();
  const rows = await bd.filas(
    `SELECT st.*, sf.id AS fecha_id, sf.fecha_entrada, sf.fecha_salida, sf.nota
       FROM v_semana_titular st
       LEFT JOIN semana_fecha sf ON sf.semana_id = st.semana_id AND sf.anio = $1
      ORDER BY st.numero`, [anio]);
  res.json({ anio, semanas: rows });
});

// GET /api/semanas/disponibles -> semanas activas sin titular (para asignar)
router.get('/disponibles', async (req, res) => {
  res.json(await bd.filas(
    `SELECT semana_id, numero FROM v_semana_titular WHERE disponibilidad = 'DISPONIBLE' AND activa ORDER BY numero`));
});

// GET /api/semanas/:id  -> semana, titular, calendario completo e historial de titulares
router.get('/:id', async (req, res) => {
  const id = v.id(req.params.id);
  const s = await bd.fila('SELECT * FROM v_semana_titular WHERE semana_id = $1', [id]);
  if (!s) throw new ErrorApp(404, 'La semana no existe.');
  s.fechas = await bd.filas('SELECT * FROM semana_fecha WHERE semana_id = $1 ORDER BY anio', [id]);
  s.historial = await bd.filas(
    `SELECT adquisicion_id AS id, * FROM v_historial_titulares
      WHERE semana_id = $1 ORDER BY fecha_adquisicion DESC, adquisicion_id DESC`, [id]);
  res.json(s);
});

// POST /api/semanas  { numero, descripcion? }
router.post('/', async (req, res) => {
  const numero = v.entero(req.body?.numero, 'número de semana', { min: 1, max: 52 });
  const descripcion = v.texto(req.body?.descripcion, 'descripción', { max: 200, opcional: true });
  const s = await bd.fila(
    'INSERT INTO semana (numero, descripcion, creado_por) VALUES ($1, $2, $3) RETURNING *',
    [numero, descripcion, usuarioId(req)]);
  res.status(201).json(s);
});

// PUT /api/semanas/:id  { descripcion?, activa }
router.put('/:id', async (req, res) => {
  const id = v.id(req.params.id);
  const descripcion = v.texto(req.body?.descripcion, 'descripción', { max: 200, opcional: true });
  const activa = v.booleano(req.body?.activa ?? true, 'activa');
  const s = await bd.fila('UPDATE semana SET descripcion = $2, activa = $3 WHERE id = $1 RETURNING *', [id, descripcion, activa]);
  if (!s) throw new ErrorApp(404, 'La semana no existe.');
  await bd.consulta(`INSERT INTO auditoria (usuario_id, accion, tabla, registro_id) VALUES ($1, 'EDITAR', 'semana', $2)`, [usuarioId(req), id]);
  res.json(s);
});

// Deja constancia de los cambios del calendario (quién, cuándo y qué fechas).
async function auditarFecha(req, accion, f) {
  const sem = await bd.fila('SELECT numero FROM semana WHERE id = $1', [f.semana_id]);
  await bd.consulta(
    `INSERT INTO auditoria (usuario_id, accion, tabla, registro_id, detalle) VALUES ($1, $2, 'semana_fecha', $3, $4)`,
    [usuarioId(req), accion, f.id, { semana: sem && sem.numero, anio: f.anio, entrada: f.fecha_entrada, salida: f.fecha_salida }]);
}

function datosFecha(b) {
  const d = {
    anio: v.entero(b.anio, 'año', { min: 2000, max: 2100 }),
    entrada: v.fecha(b.fecha_entrada, 'fecha de entrada'),
    salida: v.fecha(b.fecha_salida, 'fecha de salida'),
    nota: v.texto(b.nota, 'nota', { max: 200, opcional: true }),
  };
  if (d.salida <= d.entrada) throw new ErrorApp(400, 'La fecha de salida debe ser posterior a la fecha de entrada.');
  return d;
}

// POST /api/semanas/:id/fechas  { anio, fecha_entrada, fecha_salida, nota? }
router.post('/:id/fechas', async (req, res) => {
  const id = v.id(req.params.id);
  const d = datosFecha(req.body || {});
  const f = await bd.fila(
    `INSERT INTO semana_fecha (semana_id, anio, fecha_entrada, fecha_salida, nota, creado_por)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`, [id, d.anio, d.entrada, d.salida, d.nota, usuarioId(req)]);
  await auditarFecha(req, 'CREAR', f);
  res.status(201).json(f);
});

// PUT /api/semanas/fechas/:fechaId
router.put('/fechas/:fechaId', async (req, res) => {
  const d = datosFecha(req.body || {});
  const f = await bd.fila(
    `UPDATE semana_fecha SET anio = $2, fecha_entrada = $3, fecha_salida = $4, nota = $5 WHERE id = $1 RETURNING *`,
    [v.id(req.params.fechaId), d.anio, d.entrada, d.salida, d.nota]);
  if (!f) throw new ErrorApp(404, 'El registro de fechas no existe.');
  await auditarFecha(req, 'EDITAR', f);
  res.json(f);
});

// DELETE /api/semanas/fechas/:fechaId
router.delete('/fechas/:fechaId', async (req, res) => {
  const r = await bd.consulta('DELETE FROM semana_fecha WHERE id = $1 RETURNING *', [v.id(req.params.fechaId)]);
  if (r.rowCount === 0) throw new ErrorApp(404, 'El registro de fechas no existe.');
  await auditarFecha(req, 'ELIMINAR', r.rows[0]);
  res.json({ ok: true });
});

module.exports = router;
