// Instala la base de datos de CAM en un PostgreSQL LOCAL (no destructivo).
// Uso (PowerShell, desde la carpeta CAM):
//   npm.cmd run bd:instalar                 -> estructura + datos de DEMOSTRACIÓN
//   npm.cmd run bd:instalar -- --sin-demo   -> solo estructura (para uso real)
// Paso 1 (como "postgres"): sql/00_crear_base_y_roles.sql -> roles cam_admin/cam_app y bases.
// Paso 2 (como cam_admin):  sql/ejecutar_todo.sql         -> esquemas, tablas, vistas, funciones, permisos.
// Si la base ya tiene las tablas, el paso 2 se detiene SIN borrar nada.
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { exigir } = require('./comun');

exigir('PGHOST', 'PGPORT', 'CAM_DB', 'PG_SUPERUSER_PASSWORD', 'CAM_ADMIN_USER', 'CAM_ADMIN_PASSWORD',
  'CAM_APP_USER', 'CAM_APP_PASSWORD');
const RAIZ = path.join(__dirname, '..');
const PSQL = path.join(process.env.PG_BIN || 'C:\\Program Files\\PostgreSQL\\18\\bin', process.platform === 'win32' ? 'psql.exe' : 'psql');
const sinDemo = process.argv.includes('--sin-demo');
const base = process.env.CAM_DB;

function psql(usuario, clave, bd, args) {
  return execFileSync(PSQL, ['-h', process.env.PGHOST, '-p', process.env.PGPORT, '-U', usuario, '-d', bd,
    '-X', '-q', '-v', 'ON_ERROR_STOP=1', ...args], {
    cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PGPASSWORD: clave, PGCLIENTENCODING: 'UTF8' },
  });
}

function paso(titulo, fn) {
  process.stdout.write(`${titulo} … `);
  try {
    const salida = fn();
    console.log('listo.');
    return salida;
  } catch (e) {
    console.log('ERROR.');
    console.error(String(e.stderr || e.message).trim().split('\n').filter((l) => /ERROR|FATAL|error/i.test(l)).join('\n') || e.message);
    process.exit(1);
  }
}

paso('1. Roles y bases (como postgres, sql/00)', () => psql('postgres', process.env.PG_SUPERUSER_PASSWORD, 'postgres',
  ['-f', 'sql/00_crear_base_y_roles.sql']));

const yaExiste = psql(process.env.CAM_ADMIN_USER, process.env.CAM_ADMIN_PASSWORD, base,
  ['-tA', '-c', "SELECT to_regclass('cam.pago') IS NOT NULL"]).trim() === 't';
if (yaExiste) {
  console.log(`2. La base "${base}" ya tiene las tablas de CAM: no se modifica nada.`);
  console.log('   (Para empezar de cero se necesita una base vacía; este programa nunca borra datos.)');
  process.exit(0);
}
paso(`2. Estructura${sinDemo ? ' sin datos de demostración' : ' y datos de DEMOSTRACIÓN'} en "${base}" (como ${process.env.CAM_ADMIN_USER})`,
  () => psql(process.env.CAM_ADMIN_USER, process.env.CAM_ADMIN_PASSWORD, base,
    [...(sinDemo ? ['-v', 'sin_demo=1'] : []), '-f', 'sql/ejecutar_todo.sql']));

const resumen = psql(process.env.CAM_APP_USER, process.env.CAM_APP_PASSWORD, base, ['-tA', '-c',
  "SELECT (SELECT count(*) FROM cam.semana) || ' semanas, ' || (SELECT count(*) FROM cam.propietario) || ' propietarios, ' || (SELECT count(*) FROM cam.usuario) || ' usuarios'"]).trim();
console.log(`3. Comprobación como ${process.env.CAM_APP_USER}: ${resumen}.`);
if (sinDemo) console.log('   Siguiente paso: crear la cuenta de la secretaria (ver docs/instalacion.md, sección 5).');
