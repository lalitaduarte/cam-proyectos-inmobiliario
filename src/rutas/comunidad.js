// Comunidad: ofertas de venta o intercambio y mensajes.
// PROPIETARIO: publica sobre sus semanas, retira las suyas, conversa.
// SECRETARIA: supervisa (ve todas, cierra o elimina, puede escribir).
// Publicar o cerrar una oferta NUNCA cambia la titularidad.
const express = require('express');
const bd = require('../db');
const v = require('../validar');
const { ErrorApp } = require('../errores');
const { usuarioId } = require('../seguridad');

const router = express.Router();
const esSecretaria = (req) => req.session.usuario.rol === 'SECRETARIA';

// Columnas públicas de la oferta (sin cédula ni correo: Ley 1581).
const COLUMNAS = `oferta_id, adquisicion_id, autor_nombre, semana_numero, tipo, precio, descripcion,
                  estado, publicada_en, cerrada_en, total_mensajes`;

// ¿Puede este usuario ver la oferta y su conversación?
// Secretaria: todas. Propietario: las activas, las suyas y aquellas en las que escribió.
async function ofertaVisible(req, ofertaId) {
  const o = await bd.fila(`SELECT ${COLUMNAS}, propietario_id FROM v_oferta_detalle WHERE oferta_id = $1`, [ofertaId]);
  if (!o) throw new ErrorApp(404, 'La oferta no existe.');
  const u = req.session.usuario;
  const visible = u.rol === 'SECRETARIA' || o.estado === 'ACTIVA' || o.propietario_id === u.propietarioId
    || (await bd.fila('SELECT 1 FROM mensaje WHERE oferta_id = $1 AND autor_id = $2 LIMIT 1', [ofertaId, u.id]));
  if (!visible) throw new ErrorApp(404, 'La oferta no existe.');
  o.es_mia = o.propietario_id === u.propietarioId;
  delete o.propietario_id;
  return o;
}

// GET /api/ofertas?tipo=VENTA|INTERCAMBIO&desde=AAAA-MM-DD&estado=(solo secretaria)
router.get('/', async (req, res) => {
  const tipo = v.opcion(req.query.tipo, 'tipo', ['VENTA', 'INTERCAMBIO'], { opcional: true });
  const desde = v.fecha(req.query.desde, 'desde', { opcional: true });
  // El propietario solo ve ofertas ACTIVAS (RN11). La secretaria puede filtrar cualquier estado.
  const estado = esSecretaria(req)
    ? v.opcion(req.query.estado, 'estado', ['ACTIVA', 'RETIRADA', 'CONCRETADA', 'TODAS'], { opcional: true }) ?? 'ACTIVA'
    : 'ACTIVA';
  const rows = await bd.filas(
    `SELECT ${COLUMNAS}, (propietario_id = $4) AS es_mia FROM v_oferta_detalle
      WHERE ($1::text IS NULL OR tipo = $1)
        AND ($2::date IS NULL OR publicada_en >= $2::date)
        AND ($3 = 'TODAS' OR estado = $3)
      ORDER BY publicada_en DESC LIMIT 300`,
    [tipo, desde, estado, req.session.usuario.propietarioId ?? -1]);
  res.json(rows);
});

// GET /api/ofertas/mias -> (propietario) sus ofertas en todos los estados y sus semanas ofertables
router.get('/mias', async (req, res) => {
  if (esSecretaria(req)) throw new ErrorApp(403, 'Opción solo para propietarios.');
  const pid = req.session.usuario.propietarioId;
  const [ofertas, semanas] = await Promise.all([
    bd.filas(`SELECT ${COLUMNAS}, true AS es_mia FROM v_oferta_detalle WHERE propietario_id = $1 ORDER BY publicada_en DESC`, [pid]),
    bd.filas(
      `SELECT a.id AS adquisicion_id, s.numero AS semana_numero,
              EXISTS (SELECT 1 FROM oferta o WHERE o.adquisicion_id = a.id AND o.estado = 'ACTIVA') AS tiene_oferta_activa,
              (SELECT json_agg(json_build_object('anio', sf.anio, 'entrada', sf.fecha_entrada, 'salida', sf.fecha_salida) ORDER BY sf.anio)
                 FROM semana_fecha sf WHERE sf.semana_id = s.id AND sf.fecha_salida >= current_date) AS proximas_fechas
         FROM adquisicion a JOIN semana s ON s.id = a.semana_id
        WHERE a.propietario_id = $1 AND a.estado_titularidad = 'VIGENTE'
        ORDER BY s.numero`, [pid]),
  ]);
  res.json({ ofertas, semanas });
});

// GET /api/ofertas/:id
router.get('/:id', async (req, res) => {
  res.json(await ofertaVisible(req, v.id(req.params.id)));
});

// POST /api/ofertas  { adquisicion_id, tipo, precio?, descripcion }  (solo propietario; lo valida la función)
router.post('/', async (req, res) => {
  const b = req.body || {};
  const tipo = v.opcion(b.tipo, 'tipo', ['VENTA', 'INTERCAMBIO']);
  const precio = tipo === 'VENTA' ? v.monto(b.precio, 'precio') : null;
  if (tipo === 'INTERCAMBIO' && b.precio !== undefined && b.precio !== null && b.precio !== '') {
    throw new ErrorApp(400, 'Una oferta de intercambio no lleva precio.');
  }
  const r = await bd.fila('SELECT fn_publicar_oferta($1, $2, $3, $4, $5) AS id', [
    usuarioId(req), v.id(b.adquisicion_id, 'semana'), tipo, precio,
    v.texto(b.descripcion, 'descripción', { min: 5, max: 1000 }),
  ]);
  res.status(201).json(await ofertaVisible(req, r.id));
});

// POST /api/ofertas/:id/cerrar  { estado: RETIRADA | CONCRETADA }
router.post('/:id/cerrar', async (req, res) => {
  const id = v.id(req.params.id);
  await bd.consulta('SELECT fn_cerrar_oferta($1, $2, $3)',
    [usuarioId(req), id, v.opcion(req.body?.estado, 'estado', ['RETIRADA', 'CONCRETADA'])]);
  res.json(await ofertaVisible(req, id));
});

// DELETE /api/ofertas/:id  (publicada por error y sin mensajes)
router.delete('/:id', async (req, res) => {
  await bd.consulta('SELECT fn_eliminar_oferta($1, $2)', [usuarioId(req), v.id(req.params.id)]);
  res.json({ ok: true });
});

// GET /api/ofertas/:id/mensajes
router.get('/:id/mensajes', async (req, res) => {
  const id = v.id(req.params.id);
  await ofertaVisible(req, id);
  res.json(await bd.filas(
    `SELECT mensaje_id, autor_rol, autor_nombre, texto, enviado_en, (autor_id = $2) AS es_mio
       FROM v_mensaje_detalle WHERE oferta_id = $1 ORDER BY enviado_en, mensaje_id`, [id, usuarioId(req)]));
});

// POST /api/ofertas/:id/mensajes  { texto }
router.post('/:id/mensajes', async (req, res) => {
  const id = v.id(req.params.id);
  await ofertaVisible(req, id);
  const r = await bd.fila('SELECT fn_enviar_mensaje($1, $2, $3) AS id',
    [usuarioId(req), id, v.texto(req.body?.texto, 'mensaje', { min: 1, max: 1000 })]);
  res.status(201).json(await bd.fila(
    `SELECT mensaje_id, autor_rol, autor_nombre, texto, enviado_en, true AS es_mio FROM v_mensaje_detalle WHERE mensaje_id = $1`, [r.id]));
});

module.exports = router;
