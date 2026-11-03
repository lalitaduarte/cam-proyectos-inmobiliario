// Conexión a PostgreSQL mediante un "pool": un grupo de conexiones que se reutilizan.
// Todas las consultas usan parámetros ($1, $2...), nunca texto concatenado,
// para evitar inyección SQL.
const { Pool, types } = require('pg');
const config = require('./config');

// Conversión de tipos al leer de la base:
types.setTypeParser(1700, (v) => (v === null ? null : Number(v))); // NUMERIC -> número (dinero < 2^53, sin pérdida)
types.setTypeParser(20, (v) => (v === null ? null : Number(v)));   // BIGINT (ids, conteos) -> número
types.setTypeParser(1082, (v) => v);                               // DATE -> texto 'AAAA-MM-DD' (sin corrimientos de zona)

const pool = new Pool({ ...config.bd, max: 10, idleTimeoutMillis: 30000, application_name: 'cam-web' });

// El esquema (cam) y la zona horaria (America/Bogota, RN14) vienen configurados en la
// base de datos para el rol cam_app (script 00). Se comprueban al iniciar: verificarEntorno().
pool.on('error', (err) => {
  console.error('[bd] Error en una conexión inactiva:', err.code || err.message);
});

async function consulta(texto, valores) {
  return pool.query(texto, valores);
}

async function filas(texto, valores) {
  return (await pool.query(texto, valores)).rows;
}

async function fila(texto, valores) {
  return (await pool.query(texto, valores)).rows[0] || null;
}

// Ejecuta varias sentencias como una sola transacción: o se guardan todas o ninguna.
async function transaccion(trabajo) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await trabajo(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}

// Comprueba que la conexión usa el esquema y la zona horaria correctos y un usuario sin privilegios de administrador.
async function verificarEntorno() {
  const r = await fila(
    `SELECT current_database() AS base, current_user AS usuario, current_setting('search_path') AS esquema,
            current_setting('TimeZone') AS zona, (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS superusuario,
            to_regclass('pago') IS NOT NULL AS tablas_visibles`);
  if (r.superusuario) throw new Error('El backend no debe conectarse con un superusuario.');
  if (!r.tablas_visibles) throw new Error(`No se encuentran las tablas de CAM (search_path=${r.esquema}). Revise sql/00_crear_base_y_roles.sql.`);
  if (r.zona !== config.zonaHoraria) throw new Error(`La zona horaria de la base es ${r.zona}; debe ser ${config.zonaHoraria}.`);
  return r;
}

module.exports = { pool, consulta, filas, fila, transaccion, verificarEntorno };
