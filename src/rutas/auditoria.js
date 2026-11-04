// Consulta de la auditoría (solo SECRETARIA): quién hizo cada acción y cuándo.
// Solo lectura: la aplicación no tiene ninguna ruta para editar ni borrar la auditoría.
const express = require('express');
const bd = require('../db');
const v = require('../validar');

const router = express.Router();
const POR_PAGINA = 50;

// GET /api/auditoria?desde=&hasta=&accion=&tabla=&usuario_id=&registro_id=&pagina=
router.get('/', async (req, res) => {
  const f = [
    v.fecha(req.query.desde, 'desde', { opcional: true }),
    v.fecha(req.query.hasta, 'hasta', { opcional: true }),
    v.texto(req.query.accion, 'acción', { max: 40, opcional: true }),
    v.texto(req.query.tabla, 'tabla', { max: 40, opcional: true }),
    req.query.usuario_id ? v.id(req.query.usuario_id, 'usuario') : null,
    req.query.registro_id ? v.id(req.query.registro_id, 'registro') : null,
  ];
  const pagina = v.entero(req.query.pagina, 'página', { min: 1, max: 100000, opcional: true }) ?? 1;
  // Las fechas se comparan en la zona horaria de la sesión de la base (America/Bogota).
  const filtro = `WHERE ($1::date   IS NULL OR ocurrido_en >= $1::date)
                    AND ($2::date   IS NULL OR ocurrido_en <  $2::date + 1)
                    AND ($3::text   IS NULL OR accion = $3)
                    AND ($4::text   IS NULL OR tabla = $4)
                    AND ($5::bigint IS NULL OR usuario_id = $5)
                    AND ($6::bigint IS NULL OR registro_id = $6)`;
  const [conteo, filas, acciones, tablas, usuarios] = await Promise.all([
    bd.fila(`SELECT count(*) AS total FROM v_auditoria_detalle ${filtro}`, f),
    bd.filas(`SELECT * FROM v_auditoria_detalle ${filtro} ORDER BY ocurrido_en DESC, id DESC LIMIT $7 OFFSET $8`,
      [...f, POR_PAGINA, (pagina - 1) * POR_PAGINA]),
    bd.filas('SELECT DISTINCT accion FROM auditoria ORDER BY 1'),
    bd.filas('SELECT DISTINCT tabla FROM auditoria ORDER BY 1'),
    bd.filas(`SELECT DISTINCT u.id, COALESCE(u.nombre, p.nombre_completo) AS nombre, u.rol
                FROM auditoria a JOIN usuario u ON u.id = a.usuario_id
                LEFT JOIN propietario p ON p.id = u.propietario_id ORDER BY 2`),
  ]);
  res.json({
    total: conteo.total, pagina, porPagina: POR_PAGINA, filas,
    acciones: acciones.map((r) => r.accion), tablas: tablas.map((r) => r.tabla), usuarios,
  });
});

module.exports = router;
