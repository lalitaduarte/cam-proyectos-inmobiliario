// Pagos de cuotas y comprobantes (solo SECRETARIA).
const express = require('express');
const bd = require('../db');
const v = require('../validar');
const { ErrorApp } = require('../errores');
const { usuarioId } = require('../seguridad');
const { generarPdfComprobante } = require('../servicios/pdf');

const pagos = express.Router();
const comprobantes = express.Router();

// ---------------------------------------------------------------------
// PAGOS
// ---------------------------------------------------------------------

// GET /api/pagos?propietario_id=&adquisicion_id=&estado=&desde=&hasta=&limite=
pagos.get('/', async (req, res) => {
  const f = {
    propietario: req.query.propietario_id ? v.id(req.query.propietario_id, 'propietario') : null,
    adquisicion: req.query.adquisicion_id ? v.id(req.query.adquisicion_id, 'adquisición') : null,
    estado: v.opcion(req.query.estado, 'estado', ['NO_VERIFICADO', 'VERIFICADO', 'ANULADO'], { opcional: true }),
    desde: v.fecha(req.query.desde, 'desde', { opcional: true }),
    hasta: v.fecha(req.query.hasta, 'hasta', { opcional: true }),
    limite: v.entero(req.query.limite, 'límite', { min: 1, max: 5000, opcional: true }) ?? 500,
  };
  res.json(await bd.filas(
    `SELECT * FROM v_pago_detalle
      WHERE ($1::bigint IS NULL OR propietario_id = $1)
        AND ($2::bigint IS NULL OR adquisicion_id = $2)
        AND ($3::text   IS NULL OR estado = $3)
        AND ($4::date   IS NULL OR fecha_pago >= $4)
        AND ($5::date   IS NULL OR fecha_pago <= $5)
      ORDER BY registrado_en DESC
      LIMIT $6`, [f.propietario, f.adquisicion, f.estado, f.desde, f.hasta, f.limite]));
});

// POST /api/pagos  { adquisicion_id, numero_cuota, valor, fecha_pago, referencia? }
// El usuario y la fecha de registro los determina el servidor (RN13).
pagos.post('/', async (req, res) => {
  const b = req.body || {};
  const r = await bd.fila('SELECT fn_registrar_pago($1, $2, $3, $4, $5, $6) AS id', [
    usuarioId(req),
    v.id(b.adquisicion_id, 'adquisición'),
    v.entero(b.numero_cuota, 'número de cuota', { min: 1, max: 120 }),
    v.monto(b.valor, 'valor'),
    v.fecha(b.fecha_pago, 'fecha del pago'),
    v.texto(b.referencia, 'referencia', { max: 80, opcional: true }),
  ]);
  res.status(201).json(await bd.fila('SELECT * FROM v_pago_detalle WHERE pago_id = $1', [r.id]));
});

const detallePago = async (id) => bd.fila('SELECT * FROM v_pago_detalle WHERE pago_id = $1', [id]);

// POST /api/pagos/:id/verificar
pagos.post('/:id/verificar', async (req, res) => {
  const id = v.id(req.params.id);
  await bd.consulta('SELECT fn_verificar_pago($1, $2)', [usuarioId(req), id]);
  res.json(await detallePago(id));
});

// POST /api/pagos/:id/revertir-verificacion  { motivo }
pagos.post('/:id/revertir-verificacion', async (req, res) => {
  const id = v.id(req.params.id);
  await bd.consulta('SELECT fn_revertir_verificacion($1, $2, $3)',
    [usuarioId(req), id, v.texto(req.body?.motivo, 'motivo', { min: 5, max: 300 })]);
  res.json(await detallePago(id));
});

// POST /api/pagos/:id/anular  { motivo }
pagos.post('/:id/anular', async (req, res) => {
  const id = v.id(req.params.id);
  await bd.consulta('SELECT fn_anular_pago($1, $2, $3)',
    [usuarioId(req), id, v.texto(req.body?.motivo, 'motivo', { min: 5, max: 300 })]);
  res.json(await detallePago(id));
});

// POST /api/pagos/:id/comprobante  -> emite el comprobante (solo pagos verificados)
pagos.post('/:id/comprobante', async (req, res) => {
  const r = await bd.fila('SELECT fn_emitir_comprobante($1, $2) AS id', [usuarioId(req), v.id(req.params.id)]);
  res.status(201).json(await bd.fila('SELECT * FROM v_comprobante_detalle WHERE id = $1', [r.id]));
});

// ---------------------------------------------------------------------
// COMPROBANTES
// ---------------------------------------------------------------------

// GET /api/comprobantes?q=&estado_envio=PENDIENTE|ENVIADO|FALLIDO
comprobantes.get('/', async (req, res) => {
  const q = v.texto(req.query.q, 'búsqueda', { max: 120, opcional: true });
  const envio = v.opcion(req.query.estado_envio, 'estado de envío', ['PENDIENTE', 'ENVIADO', 'FALLIDO'], { opcional: true });
  res.json(await bd.filas(
    `SELECT id, numero, pago_id, emitido_en, emisor_nombre, propietario_cedula, propietario_nombre,
            semana_numero, numero_cuota, numero_cuotas, valor, fecha_pago, estado_envio, ultimo_intento
       FROM v_comprobante_detalle
      WHERE ($1::text IS NULL OR numero ILIKE '%' || $1 || '%' OR propietario_cedula LIKE $1 || '%'
             OR propietario_nombre ILIKE '%' || $1 || '%')
        AND ($2::text IS NULL OR estado_envio = $2)
      ORDER BY consecutivo DESC
      LIMIT 500`, [q, envio]));
});

const buscarComprobante = async (id) => {
  const c = await bd.fila('SELECT * FROM v_comprobante_detalle WHERE id = $1', [id]);
  if (!c) throw new ErrorApp(404, 'El comprobante no existe.');
  return c;
};

// GET /api/comprobantes/:id
comprobantes.get('/:id', async (req, res) => {
  const c = await buscarComprobante(v.id(req.params.id));
  c.envios = await bd.filas('SELECT * FROM envio_comprobante WHERE comprobante_id = $1 ORDER BY intentado_en DESC', [c.id]);
  res.json(c);
});

// GET /api/comprobantes/:id/pdf  -> descarga o impresión
comprobantes.get('/:id/pdf', async (req, res) => {
  const c = await buscarComprobante(v.id(req.params.id));
  const pdf = await generarPdfComprobante(c);
  const disposicion = req.query.descargar === '1' ? 'attachment' : 'inline';
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `${disposicion}; filename="comprobante-${c.numero}.pdf"`,
    'Cache-Control': 'no-store',
  });
  res.send(pdf);
});

// POST /api/comprobantes/:id/enviar
// El correo NO está configurado en esta versión (decisión D11). Se responde con
// claridad y NO se registra ningún envío: nunca se marca "enviado" sin enviarlo.
comprobantes.post('/:id/enviar', async (req, res) => {
  await buscarComprobante(v.id(req.params.id));
  throw new ErrorApp(503, 'El envío por correo aún no está configurado. Descargue el PDF y entréguelo al propietario.');
});

module.exports = { pagos, comprobantes };
