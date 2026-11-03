// Instala la base de CAM en NEON (publicación). No destructivo.
// Requisito: en .env, la línea NEON_OWNER_URL=... con la cadena de conexión del
// dueño del proyecto (neondb_owner), copiada desde la consola de Neon.
// Uso (PowerShell):  npm.cmd run neon:instalar
//
// 1. Genera contraseñas NUEVAS para cam_admin y cam_app de producción (distintas
//    de las locales) y las guarda en .env sin mostrarlas.
// 2. Como neondb_owner: sql/00_neon_crear_base_y_roles.sql (roles y base cam_db).
// 3. Como cam_admin: sql/ejecutar_todo.sql SIN datos de demostración.
// 4. Escribe en .env NEON_DATABASE_URL (conexión de cam_app), que es el valor
//    de DATABASE_URL que se configura en Render.
// 5. Comprueba la conexión exactamente como lo hará el servidor publicado.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { Client } = require('pg');
const { exigir } = require('./comun');

exigir('NEON_OWNER_URL');
const RAIZ = path.join(__dirname, '..');
const ENV = path.join(RAIZ, '.env');
const PSQL = path.join(process.env.PG_BIN || 'C:\\Program Files\\PostgreSQL\\18\\bin', process.platform === 'win32' ? 'psql.exe' : 'psql');

let duenio;
try { duenio = new URL(process.env.NEON_OWNER_URL); } catch { duenio = null; }
if (!duenio || !/^postgres(ql)?:$/.test(duenio.protocol) || !duenio.hostname.endsWith('.neon.tech')) {
  console.error('NEON_OWNER_URL no parece una cadena de conexión de Neon (postgresql://...neon.tech/...).');
  process.exit(1);
}
const host = duenio.hostname;

// 1. Contraseñas de producción: se generan una sola vez y se agregan al .env.
function asegurarSecreto(nombre) {
  if (process.env[nombre]) return process.env[nombre];
  const valor = crypto.randomBytes(32).toString('base64url');
  fs.appendFileSync(ENV, `\n${nombre}=${valor}`);
  process.env[nombre] = valor;
  return valor;
}
const pwAdmin = asegurarSecreto('NEON_CAM_ADMIN_PASSWORD');
const pwApp = asegurarSecreto('NEON_CAM_APP_PASSWORD');

function psql(usuario, clave, bd, args) {
  return execFileSync(PSQL, ['-h', host, '-p', duenio.port || '5432', '-U', usuario, '-d', bd,
    '-X', '-q', '-v', 'ON_ERROR_STOP=1', ...args], {
    cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PGPASSWORD: clave, PGSSLMODE: 'require', PGCLIENTENCODING: 'UTF8' },
  });
}
function paso(titulo, fn) {
  process.stdout.write(`${titulo} … `);
  try { const r = fn(); console.log('listo.'); return r; } catch (e) {
    console.log('ERROR.');
    console.error(String(e.stderr || e.message).split('\n').filter((l) => /ERROR|FATAL|error/i.test(l)).join('\n') || e.message);
    process.exit(1);
  }
}

paso(`1. Roles y base cam_db en Neon (${host.split('.')[0]}…, como ${decodeURIComponent(duenio.username)})`,
  () => psql(decodeURIComponent(duenio.username), decodeURIComponent(duenio.password), duenio.pathname.slice(1) || 'neondb',
    ['-f', 'sql/00_neon_crear_base_y_roles.sql']));

const yaExiste = psql('cam_admin', pwAdmin, 'cam_db', ['-tA', '-c', "SELECT to_regclass('cam.pago') IS NOT NULL"]).trim() === 't';
if (yaExiste) console.log('2. cam_db ya tiene las tablas de CAM: no se modifica nada.');
else paso('2. Estructura SIN datos de demostración (como cam_admin)', () => psql('cam_admin', pwAdmin, 'cam_db', ['-v', 'sin_demo=1', '-f', 'sql/ejecutar_todo.sql']));

// 4. Cadena de conexión de la aplicación (cam_app) para Render.
const urlApp = `postgresql://cam_app:${encodeURIComponent(pwApp)}@${host}:5432/cam_db?sslmode=verify-full`;   // puerto explícito: si no, pg tomaría PGPORT local
const contenido = fs.readFileSync(ENV, 'utf8');
if (/^NEON_DATABASE_URL=/m.test(contenido)) fs.writeFileSync(ENV, contenido.replace(/^NEON_DATABASE_URL=.*$/m, `NEON_DATABASE_URL=${urlApp}`));
else fs.appendFileSync(ENV, `\nNEON_DATABASE_URL=${urlApp}\n`);
console.log('3. NEON_DATABASE_URL guardada en .env (es el valor de DATABASE_URL para Render).');

// 5. Comprobación con la misma configuración que usará el servidor (src/config.js).
(async () => {
  const c = new Client({ connectionString: urlApp, ssl: { rejectUnauthorized: true } });
  await c.connect();
  const { rows: [r] } = await c.query(`SELECT current_user AS usuario, (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS superusuario,
    current_setting('TimeZone') AS zona, current_setting('search_path') AS ruta, version() AS version,
    (SELECT count(*) FROM pago) AS pagos, (SELECT count(*) FROM usuario) AS usuarios,
    has_table_privilege('pago', 'DELETE') AS puede_borrar_pagos`);
  await c.end();
  console.log(`4. Conexión como la aplicación: usuario ${r.usuario}, superusuario: ${r.superusuario ? 'SÍ (MAL)' : 'no'}, zona ${r.zona}, esquema ${r.ruta}.`);
  console.log(`   ${r.version.split(',')[0]} · ${r.pagos} pagos · ${r.usuarios} usuarios · puede borrar pagos: ${r.puede_borrar_pagos ? 'SÍ (MAL)' : 'no'}.`);
  if (r.usuarios === '0') console.log('   Falta la cuenta de la secretaria de producción: npm.cmd run neon:crear-secretaria -- usuario Nombre');
})().catch((e) => { console.error(`La comprobación falló: ${e.message || e.code || (e.errors || []).map((x) => x.message).join(" / ") || e}`); process.exit(1); });
