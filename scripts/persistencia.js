// Prueba de PERSISTENCIA tras reiniciar el servicio de PostgreSQL (CP14, RNF-FIA).
// Es de SOLO LECTURA: no escribe nada en cam_db.
//   1. npm.cmd run persistencia -- antes     -> guarda la huella (filas + md5) de cada tabla
//   2. Reiniciar el servicio "postgresql-x64-18" (Servicios de Windows)
//   3. npm.cmd run persistencia -- despues   -> comprueba que PostgreSQL SÍ se reinició
//                                              y que los datos son idénticos
const fs = require('node:fs');
const path = require('node:path');
const { RAIZ, consulta, exigir, marcaDeTiempo } = require('./comun');

exigir('PGHOST', 'PGPORT', 'CAM_DB', 'CAM_ADMIN_USER', 'CAM_ADMIN_PASSWORD');
const base = process.env.CAM_DB;
const modo = process.argv[2];
const estadoArchivo = path.join(RAIZ, 'pruebas', 'evidencias', 'persistencia_antes.json');

function fotografia() {
  const tablas = consulta(base, `SELECT string_agg(table_name, ',' ORDER BY table_name) FROM information_schema.tables
    WHERE table_schema = 'cam' AND table_type = 'BASE TABLE' AND table_name NOT IN ('sesion', 'auditoria')`).split(',');
  // Una sola consulta para todas las tablas: filas y huella md5 de su contenido.
  const sql = tablas.map((t) => `SELECT '${t}' || '=' || (SELECT count(*) || ' ' || coalesce(md5(string_agg(x::text, '|' ORDER BY x::text)), '-') FROM cam.${t} x)`)
    .concat("SELECT 'inicio=' || to_char(pg_postmaster_start_time(), 'YYYY-MM-DD HH24:MI:SS')")
    .join(' UNION ALL ');
  const filas = Object.fromEntries(consulta(base, sql).split(/\r?\n/).map((l) => l.split('=')));
  const { inicio, ...huellas } = filas;
  return { momento: marcaDeTiempo(), inicioServidor: inicio, huellas };
}

if (modo === 'antes') {
  const f = fotografia();
  fs.mkdirSync(path.dirname(estadoArchivo), { recursive: true });
  fs.writeFileSync(estadoArchivo, JSON.stringify(f, null, 2));
  console.log(`Huella guardada (${Object.keys(f.huellas).length} tablas). PostgreSQL encendido desde ${f.inicioServidor}.`);
  console.log('Ahora reinicie el servicio postgresql-x64-18 y ejecute: npm.cmd run persistencia -- despues');
} else if (modo === 'despues') (async () => {
  if (!fs.existsSync(estadoArchivo)) { console.error('Primero ejecute: npm.cmd run persistencia -- antes'); process.exit(1); }
  const a = JSON.parse(fs.readFileSync(estadoArchivo, 'utf8'));
  const d = fotografia();
  const reiniciado = d.inicioServidor !== a.inicioServidor;
  const lineas = Object.keys(a.huellas).map((t) => {
    const igual = a.huellas[t] === d.huellas[t];
    return `${igual ? 'IGUAL    ' : 'DIFERENTE'}  ${t.padEnd(24)} ${String(a.huellas[t]).split(' ')[0].padStart(5)} → ${String(d.huellas[t]).split(' ')[0]} filas`;
  });
  const iguales = lineas.filter((l) => l.startsWith('IGUAL')).length;
  // Si la aplicación estaba encendida, debe recuperarse sola (el pool abre conexiones nuevas).
  let app = 'no estaba encendida (no se comprobó)';
  try {
    const r = await fetch(`http://localhost:${process.env.PORT || 3100}/api/salud`);
    const d = await r.json();
    app = r.ok && d.ok ? 'respondió correctamente sin reiniciarla' : `respondió ${r.status}`;
  } catch { /* la aplicación no está encendida */ }
  const ok = reiniciado && iguales === lineas.length;
  const informe = [
    `Prueba de persistencia tras reiniciar PostgreSQL — ${d.momento.replace('_', ' ')} (hora de Colombia)`,
    `Base: ${base}. Huella tomada antes: ${a.momento.replace('_', ' ')}`,
    `PostgreSQL encendido desde: antes ${a.inicioServidor} · después ${d.inicioServidor} → ${reiniciado ? 'SÍ se reinició' : 'NO se reinició'}`,
    '',
    ...lineas,
    '',
    `Aplicación en http://localhost:${process.env.PORT || 3100}: ${app}`,
    '',
    ok ? `RESULTADO: LOS DATOS PERSISTEN — ${iguales}/${lineas.length} tablas idénticas después del reinicio.`
      : (reiniciado ? `RESULTADO: HAY DIFERENCIAS (${iguales}/${lineas.length}). ¿Se usó la aplicación entre las dos tomas?`
        : 'RESULTADO: NO VÁLIDO — PostgreSQL no se reinició entre las dos tomas.'),
  ].join('\n');
  console.log(`\n${informe}\n`);
  const evid = path.join(RAIZ, 'pruebas', 'evidencias', `persistencia_${d.momento}.txt`);
  fs.writeFileSync(evid, `${informe}\n`);
  console.log(`Evidencia: ${path.relative(RAIZ, evid)}`);
  process.exit(ok ? 0 : 1);
})(); else {
  console.error('Uso: npm.cmd run persistencia -- antes   |   npm.cmd run persistencia -- despues');
  process.exit(1);
}
