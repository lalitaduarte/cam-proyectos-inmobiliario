// Gestión de propietarios (solo SECRETARIA).
const express = require('express');
const bcrypt = require('bcryptjs');
const bd = require('../db');
const v = require('../validar');
const { ErrorApp } = require('../errores');
const { usuarioId } = require('../seguridad');
const { COSTO_HASH } = require('./auth');

const router = express.Router();

function datosPropietario(b) {
  return {
    cedula: v.texto(b.cedula, 'cédula', { max: 12 }).replace(/[.\s]/g, ''),
    nombre: v.texto(b.nombre_completo, 'nombre completo', { min: 3, max: 120 }),
    correo: v.texto(b.correo, 'correo electrónico', { max: 254 }).toLowerCase(),
    telefono: v.texto(b.telefono, 'teléfono', { max: 20, opcional: true }),
  };
}

// GET /api/propietarios?q=texto&activo=true|false
router.get('/', async (req, res) => {
  const q = v.texto(req.query.q, 'búsqueda', { max: 120, opcional: true });
  const activo = req.query.activo === undefined || req.query.activo === '' ? null : v.booleano(req.query.activo, 'activo');
  const rows = await bd.filas(
    `SELECT p.id, p.cedula, p.nombre_completo, p.correo, p.telefono, p.activo, p.creado_en,
            (SELECT count(*) FROM adquisicion a WHERE a.propietario_id = p.id AND a.estado_titularidad = 'VIGENTE') AS semanas_vigentes,
            u.debe_cambiar_clave, u.ultimo_acceso
       FROM propietario p LEFT JOIN usuario u ON u.propietario_id = p.id
      WHERE ($1::text IS NULL OR p.cedula LIKE $1 || '%' OR p.nombre_completo ILIKE '%' || $1 || '%')
        AND ($2::boolean IS NULL OR p.activo = $2)
      ORDER BY p.nombre_completo
      LIMIT 500`, [q, activo]);
  res.json(rows);
});

// GET /api/propietarios/:id  (ficha con sus adquisiciones y estado de cuenta resumido)
router.get('/:id', async (req, res) => {
  const id = v.id(req.params.id);
  const p = await bd.fila(
    `SELECT p.*, u.debe_cambiar_clave, u.ultimo_acceso, u.activo AS cuenta_activa
       FROM propietario p LEFT JOIN usuario u ON u.propietario_id = p.id WHERE p.id = $1`, [id]);
  if (!p) throw new ErrorApp(404, 'El propietario no existe.');
  p.adquisiciones = await bd.filas('SELECT * FROM v_estado_cuenta WHERE propietario_id = $1 ORDER BY semana_numero', [id]);
  res.json(p);
});

// POST /api/propietarios  { cedula, nombre_completo, correo, telefono?, clave_temporal }
router.post('/', async (req, res) => {
  const d = datosPropietario(req.body || {});
  const claveTemporal = v.clave(req.body?.clave_temporal, 'contraseña temporal');
  const hash = await bcrypt.hash(claveTemporal, COSTO_HASH);
  const sec = usuarioId(req);

  const nuevo = await bd.transaccion(async (c) => {
    const { rows: [p] } = await c.query(
      `INSERT INTO propietario (cedula, nombre_completo, correo, telefono, creado_por)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`, [d.cedula, d.nombre, d.correo, d.telefono, sec]);
    await c.query(
      `INSERT INTO usuario (rol, propietario_id, password_hash, debe_cambiar_clave, creado_por)
       VALUES ('PROPIETARIO', $1, $2, true, $3)`, [p.id, hash, sec]);
    await c.query(
      `INSERT INTO auditoria (usuario_id, accion, tabla, registro_id, detalle) VALUES ($1, 'CREAR', 'propietario', $2, $3)`,
      [sec, p.id, { cedula: p.cedula }]);
    return p;
  });
  res.status(201).json(nuevo);
});

// PUT /api/propietarios/:id  { cedula, nombre_completo, correo, telefono? }
router.put('/:id', async (req, res) => {
  const id = v.id(req.params.id);
  const d = datosPropietario(req.body || {});
  const sec = usuarioId(req);
  const p = await bd.transaccion(async (c) => {
    const { rows: [antes] } = await c.query('SELECT cedula, nombre_completo, correo, telefono FROM propietario WHERE id = $1 FOR UPDATE', [id]);
    if (!antes) throw new ErrorApp(404, 'El propietario no existe.');
    const { rows: [despues] } = await c.query(
      `UPDATE propietario SET cedula = $2, nombre_completo = $3, correo = $4, telefono = $5,
              actualizado_en = now(), actualizado_por = $6
        WHERE id = $1 RETURNING *`, [id, d.cedula, d.nombre, d.correo, d.telefono, sec]);
    await c.query(
      `INSERT INTO auditoria (usuario_id, accion, tabla, registro_id, detalle) VALUES ($1, 'EDITAR', 'propietario', $2, $3)`,
      [sec, id, { antes }]);
    return despues;
  });
  res.json(p);
});

// PATCH /api/propietarios/:id/estado  { activo }
router.patch('/:id/estado', async (req, res) => {
  const id = v.id(req.params.id);
  const activo = v.booleano(req.body?.activo, 'activo');
  const sec = usuarioId(req);
  const p = await bd.fila(
    `UPDATE propietario SET activo = $2, actualizado_en = now(), actualizado_por = $3 WHERE id = $1 RETURNING *`,
    [id, activo, sec]);
  if (!p) throw new ErrorApp(404, 'El propietario no existe.');
  await bd.consulta(
    `INSERT INTO auditoria (usuario_id, accion, tabla, registro_id) VALUES ($1, $2, 'propietario', $3)`,
    [sec, activo ? 'ACTIVAR' : 'DESACTIVAR', id]);
  res.json(p);
});

// POST /api/propietarios/:id/restablecer-clave  { clave_temporal }
router.post('/:id/restablecer-clave', async (req, res) => {
  const id = v.id(req.params.id);
  const hash = await bcrypt.hash(v.clave(req.body?.clave_temporal, 'contraseña temporal'), COSTO_HASH);
  const r = await bd.consulta(
    `UPDATE usuario SET password_hash = $2, debe_cambiar_clave = true, intentos_fallidos = 0, bloqueado_hasta = NULL
      WHERE propietario_id = $1`, [id, hash]);
  if (r.rowCount === 0) throw new ErrorApp(404, 'El propietario no existe.');
  await bd.consulta(
    `INSERT INTO auditoria (usuario_id, accion, tabla, registro_id) VALUES ($1, 'RESTABLECER_CLAVE', 'propietario', $2)`,
    [usuarioId(req), id]);
  res.json({ ok: true });
});

// DELETE /api/propietarios/:id  (solo si no tiene historial)
router.delete('/:id', async (req, res) => {
  await bd.consulta('SELECT fn_eliminar_propietario($1, $2)', [usuarioId(req), v.id(req.params.id)]);
  res.json({ ok: true });
});

module.exports = router;
