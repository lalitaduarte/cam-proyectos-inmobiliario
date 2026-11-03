// Panel principal, reportes con exportación a Excel y parámetros (solo SECRETARIA).
const express = require('express');
const bd = require('../db');
const v = require('../validar');
const { usuarioId } = require('../seguridad');
const { obtenerReporte } = require('../servicios/reportes');
const { generarExcel } = require('../servicios/excel');

const panel = express.Router();
const reportes = express.Router();
const parametros = express.Router();

// GET /api/panel  -> indicadores calculados en la base (ninguna cifra fija)
panel.get('/', async (req, res) => {
  const [indicadores, ultimosPagos, recaudo] = await Promise.all([
    bd.fila('SELECT * FROM v_panel'),
    bd.filas(`SELECT pago_id, fecha_pago, nombre_completo, semana_numero, numero_cuota, valor, estado, registrado_en
                FROM v_pago_detalle WHERE estado <> 'ANULADO' ORDER BY registrado_en DESC LIMIT 8`),
    // Últimos 12 meses (incluye meses sin pagos, en cero).
    bd.filas(`SELECT to_char(m, 'YYYY-MM') AS mes,
                     COALESCE(r.total_registrado, 0) AS total_registrado,
                     COALESCE(r.total_verificado, 0) AS total_verificado
                FROM generate_series(date_trunc('month', current_date) - interval '11 months',
                                     date_trunc('month', current_date), interval '1 month') AS m
                LEFT JOIN v_recaudo_mensual r ON r.mes = m::date
               ORDER BY m`),
  ]);
  res.json({ indicadores, ultimosPagos, recaudo });
});

// GET /api/reportes/:nombre?filtros  -> filas en JSON
reportes.get('/:nombre', async (req, res) => {
  const rep = obtenerReporte(req.params.nombre);
  const { sql, valores, filtros } = rep.consulta(req.query);
  res.json({ titulo: rep.titulo, columnas: rep.columnas, filtros, filas: await bd.filas(sql, valores) });
});

// GET /api/reportes/:nombre/excel?filtros  -> mismo reporte, mismas filas, en .xlsx
reportes.get('/:nombre/excel', async (req, res) => {
  const rep = obtenerReporte(req.params.nombre);
  const { sql, valores, filtros } = rep.consulta(req.query);
  const filas = await bd.filas(sql, valores);
  const archivo = await generarExcel(rep, filtros, filas);
  const nombre = `cam-${req.params.nombre}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="${nombre}"`,
    'X-Filas': String(filas.length),
    'Cache-Control': 'no-store',
  });
  res.send(Buffer.from(archivo));
});

// GET /api/parametros -> vigente + historial
parametros.get('/', async (req, res) => {
  const historial = await bd.filas(
    `SELECT pa.*, u.nombre AS creado_por_nombre,
            (SELECT count(*) FROM adquisicion a WHERE a.parametro_id = pa.id) AS adquisiciones
       FROM parametro_accion pa LEFT JOIN usuario u ON u.id = pa.creado_por
      ORDER BY pa.vigente_desde DESC, pa.id DESC`);
  res.json({ vigente: historial[0] || null, historial });
});

// POST /api/parametros { valor_accion, numero_cuotas, valor_cuota }
// Crea nuevas condiciones; las adquisiciones anteriores conservan las suyas.
parametros.post('/', async (req, res) => {
  const b = req.body || {};
  const r = await bd.fila('SELECT fn_nuevo_parametro($1, $2, $3, $4) AS id', [
    usuarioId(req),
    v.monto(b.valor_accion, 'valor de la acción'),
    v.entero(b.numero_cuotas, 'número de cuotas', { min: 1, max: 120 }),
    v.monto(b.valor_cuota, 'valor de la cuota'),
  ]);
  res.status(201).json(await bd.fila('SELECT * FROM parametro_accion WHERE id = $1', [r.id]));
});

module.exports = { panel, reportes, parametros };
