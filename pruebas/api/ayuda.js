// Utilidades para las pruebas del backend.
// - Reconstruye la base de PRUEBAS cam_test (nunca cam_db).
// - Inicia el servidor real como proceso aparte, conectado a cam_test.
// - Cliente HTTP que conserva la cookie de sesión, como un navegador.
const { execFileSync, spawn } = require('node:child_process');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..', '..');
const PSQL = process.env.PSQL || 'C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe';
const BD_PRUEBAS = 'cam_test';

function psqlAdmin(args) {
  return execFileSync(PSQL, ['-h', process.env.PGHOST, '-p', process.env.PGPORT, '-U', process.env.CAM_ADMIN_USER,
    '-d', BD_PRUEBAS, '-X', '-q', '-v', 'ON_ERROR_STOP=1', ...args], {
    cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PGPASSWORD: process.env.CAM_ADMIN_PASSWORD, PGCLIENTENCODING: 'UTF8' },
  });
}

// Reconstruye cam_test con estructura + datos DEMO.
function reconstruirBaseDePruebas() {
  psqlAdmin(['-f', 'pruebas/bd/preparar_pruebas.sql']);
}

// Consulta directa (como cam_admin) para comprobar lo que quedó guardado.
function consultaDirecta(sql) {
  return psqlAdmin(['-tA', '-c', sql]).trim();
}

async function iniciarServidor(puerto = 3199) {
  const proceso = spawn(process.execPath, ['src/server.js'], {
    cwd: RAIZ,
    env: { ...process.env, CAM_DB: BD_PRUEBAS, DATABASE_URL: '', PORT: String(puerto), NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let salida = '';
  proceso.stdout.on('data', (d) => { salida += d; });
  proceso.stderr.on('data', (d) => { salida += d; });
  const base = `http://localhost:${puerto}`;
  for (let i = 0; i < 60; i += 1) {
    try {
      const r = await fetch(`${base}/api/salud`);
      if (r.ok) return { base, proceso, salida: () => salida };
    } catch { /* aún no inicia */ }
    if (proceso.exitCode !== null) break;
    await new Promise((ok) => setTimeout(ok, 250));
  }
  proceso.kill();
  throw new Error(`El servidor de pruebas no inició:\n${salida}`);
}

function detenerServidor(srv) {
  return new Promise((ok) => {
    if (!srv || srv.proceso.exitCode !== null) return ok();
    srv.proceso.once('exit', () => ok());
    srv.proceso.kill();
  });
}

class Cliente {
  constructor(base) { this.base = base; this.cookie = null; }

  async pedir(metodo, ruta, cuerpo, cabeceras = {}) {
    const h = { ...cabeceras };
    if (cuerpo !== undefined && !h['Content-Type']) h['Content-Type'] = 'application/json';
    if (this.cookie) h.Cookie = this.cookie;
    const r = await fetch(this.base + ruta, {
      method: metodo,
      headers: h,
      body: cuerpo === undefined ? undefined : (typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)),
    });
    for (const c of r.headers.getSetCookie()) {
      if (c.startsWith('cam.sid=')) {
        const valor = c.split(';')[0];
        this.cookie = valor === 'cam.sid=' ? null : valor;
      }
    }
    const tipo = r.headers.get('content-type') || '';
    const datos = tipo.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer());
    return { estado: r.status, datos, cabeceras: r.headers };
  }

  get(ruta) { return this.pedir('GET', ruta); }
  post(ruta, cuerpo = {}) { return this.pedir('POST', ruta, cuerpo); }
  put(ruta, cuerpo = {}) { return this.pedir('PUT', ruta, cuerpo); }
  patch(ruta, cuerpo = {}) { return this.pedir('PATCH', ruta, cuerpo); }
  delete(ruta) { return this.pedir('DELETE', ruta); }

  async entrar(usuario, clave) {
    const r = await this.post('/api/auth/login', { usuario, clave });
    if (r.estado !== 200) throw new Error(`No pudo iniciar sesión ${usuario}: ${r.estado} ${JSON.stringify(r.datos)}`);
    return r.datos.usuario;
  }
}

const SECRETARIA = ['secretaria', 'CamDemo2026!'];
const CLAVE_DEMO = 'Propietario2026!';
const CEDULAS = { ana: '900000101', carlos: '900000102', diana: '900000103', esteban: '900000104',
  fernanda: '900000105', gabriel: '900000106', helena: '900000107', ivan: '900000108' };

const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());

module.exports = { reconstruirBaseDePruebas, consultaDirecta, iniciarServidor, detenerServidor, Cliente,
  SECRETARIA, CLAVE_DEMO, CEDULAS, hoy };
