// Utilidades compartidas por los scripts de respaldo y restauración.
// Las contraseñas se leen del archivo .env y se pasan a las herramientas de
// PostgreSQL por variable de entorno (PGPASSWORD): nunca se muestran ni se escriben.
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
// Herramientas de PostgreSQL 18 (pg_dump 14 no puede respaldar un servidor 18).
const BIN = process.env.PG_BIN || 'C:\\Program Files\\PostgreSQL\\18\\bin';
const herramienta = (nombre) => path.join(BIN, process.platform === 'win32' ? `${nombre}.exe` : nombre);

function exigir(...variables) {
  const faltan = variables.filter((v) => !process.env[v]);
  if (faltan.length) {
    console.error(`Faltan variables en .env: ${faltan.join(', ')}. Copie .env.example como .env y complételo.`);
    process.exit(1);
  }
}

// Ejecuta una herramienta de PostgreSQL como cam_admin (dueño de los objetos, no superusuario).
function ejecutar(nombre, args, { base, entrada } = {}) {
  return execFileSync(herramienta(nombre), [
    '-h', process.env.PGHOST, '-p', process.env.PGPORT, '-U', process.env.CAM_ADMIN_USER,
    ...(base ? ['-d', base] : []), ...args,
  ], {
    cwd: RAIZ,
    encoding: 'utf8',
    input: entrada,
    stdio: [entrada ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, PGPASSWORD: process.env.CAM_ADMIN_PASSWORD, PGCLIENTENCODING: 'UTF8' },
  });
}

// Consulta con psql; el SQL va por la entrada estándar (evita problemas de tildes en Windows).
const consulta = (base, sql) => ejecutar('psql', ['-X', '-q', '-tA', '-v', 'ON_ERROR_STOP=1'], { base, entrada: sql }).trim();

const marcaDeTiempo = () => new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short',
}).format(new Date()).replace(' ', '_').replace(':', '');

module.exports = { RAIZ, ejecutar, consulta, exigir, marcaDeTiempo };
