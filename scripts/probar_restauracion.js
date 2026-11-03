// Prueba de RESTAURACIÓN (RNF-FIA-02): restaura un respaldo en la base de
// PRUEBAS (cam_test) y comprueba que los datos son idénticos a los de cam_db.
// NUNCA restaura sobre cam_db: así se prueba la copia sin arriesgar los datos.
// Uso (PowerShell):  npm.cmd run probar-restauracion                (usa el respaldo más reciente)
//                    npm.cmd run probar-restauracion -- respaldos\archivo.dump
const fs = require('node:fs');
const path = require('node:path');
const { RAIZ, ejecutar, consulta, exigir, marcaDeTiempo } = require('./comun');

exigir('PGHOST', 'PGPORT', 'CAM_DB', 'CAM_TEST_DB', 'CAM_ADMIN_USER', 'CAM_ADMIN_PASSWORD', 'CAM_APP_USER');
const origen = process.env.CAM_DB;
const destino = process.env.CAM_TEST_DB;
if (destino !== 'cam_test' || destino === origen) {
  console.error('Por seguridad, la restauración de prueba solo se hace en cam_test.');
  process.exit(1);
}

let archivo = process.argv[2];
if (!archivo) {
  const carpeta = path.join(RAIZ, 'respaldos');
  const lista = fs.existsSync(carpeta) ? fs.readdirSync(carpeta).filter((f) => f.startsWith('cam_db_') && f.endsWith('.dump')).sort() : [];   // solo respaldos locales
  if (!lista.length) { console.error('No hay respaldos. Ejecute primero: npm.cmd run respaldar'); process.exit(1); }
  archivo = path.join(carpeta, lista.at(-1));
}
archivo = path.resolve(RAIZ, archivo);
console.log(`Respaldo: ${path.relative(RAIZ, archivo)}`);

// 1. Vaciar cam_test (solo los esquemas de CAM; es la base de pruebas, se puede recrear).
console.log(`1. Vaciando la base de pruebas "${destino}" …`);
consulta(destino, `DO $$ BEGIN
    IF current_database() <> 'cam_test' THEN RAISE EXCEPTION 'Solo en cam_test'; END IF;
  END $$;
  SET client_min_messages = warning;
  DROP SCHEMA IF EXISTS pruebas CASCADE;
  DROP SCHEMA IF EXISTS cam CASCADE;
  DROP SCHEMA IF EXISTS ext CASCADE;`);

// 2. Restaurar (todo o nada: si algo falla, no queda una restauración a medias).
console.log('2. Restaurando …');
const t0 = Date.now();
ejecutar('pg_restore', ['--exit-on-error', '--single-transaction', '--dbname', destino, archivo]);
const segundos = ((Date.now() - t0) / 1000).toFixed(1);

// 3. Comparar tabla por tabla: cantidad de filas y una "huella" (md5) de todo su contenido.
console.log('3. Comparando con la base de trabajo …');
const tablas = consulta(origen, `SELECT string_agg(table_name, ',' ORDER BY table_name) FROM information_schema.tables
  WHERE table_schema = 'cam' AND table_type = 'BASE TABLE' AND table_name <> 'sesion'`).split(',');
const huella = (base, t) => consulta(base,
  `SELECT count(*) || ' ' || coalesce(md5(string_agg(x::text, '|' ORDER BY x::text)), '-') FROM cam.${t} x`);
let iguales = 0;
const filas = [];
for (const t of tablas) {
  const a = huella(origen, t);
  const b = huella(destino, t);
  if (a === b) iguales += 1;
  filas.push(`${a === b ? 'IGUAL    ' : 'DIFERENTE'}  ${t.padEnd(24)} ${a.split(' ')[0].padStart(6)} filas`);
}

// Objetos de programación (vistas, funciones, triggers) y permisos del backend.
const objetos = (base) => consulta(base, `SELECT
  (SELECT count(*) FROM information_schema.views WHERE table_schema = 'cam') || ' vistas, ' ||
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'cam') || ' funciones, ' ||
  (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'cam' AND NOT t.tgisinternal) || ' triggers'`);
const [objA, objB] = [objetos(origen), objetos(destino)];
const app = process.env.CAM_APP_USER;
const permisos = consulta(destino, `SELECT has_table_privilege('${app}', 'cam.pago', 'SELECT')
  AND NOT has_table_privilege('${app}', 'cam.pago', 'DELETE')`);

const todoBien = iguales === tablas.length && objA === objB && permisos === 't';
const informe = [
  `Prueba de restauración CAM — ${marcaDeTiempo().replace('_', ' ')} (hora de Colombia)`,
  `Respaldo: ${path.basename(archivo)} · restaurado en "${destino}" en ${segundos} s`,
  '',
  ...filas,
  '',
  `Objetos en ${origen}: ${objA}`,
  `Objetos en ${destino}: ${objB}`,
  `Permisos de ${app} restaurados (lee pagos, no puede borrarlos): ${permisos === 't' ? 'sí' : 'NO'}`,
  '',
  todoBien
    ? `RESULTADO: RESTAURACIÓN CORRECTA — ${iguales}/${tablas.length} tablas idénticas.`
    : `RESULTADO: HAY DIFERENCIAS — ${iguales}/${tablas.length} tablas idénticas. `
      + 'Si alguien usó la aplicación después del respaldo, las diferencias son esperables: haga un respaldo nuevo y repita.',
].join('\n');
console.log(`\n${informe}\n`);
const evid = path.join(RAIZ, 'pruebas', 'evidencias', `restauracion_${marcaDeTiempo()}.txt`);
fs.mkdirSync(path.dirname(evid), { recursive: true });
fs.writeFileSync(evid, `${informe}\n`);
console.log(`Evidencia: ${path.relative(RAIZ, evid)}`);
console.log('Nota: cam_test quedó con la copia restaurada. Las pruebas automáticas la reconstruyen solas.');
process.exit(todoBien ? 0 : 1);
