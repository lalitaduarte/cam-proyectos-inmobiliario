// Copia de seguridad de la base de TRABAJO (cam_db) con pg_dump 18.
// Uso (PowerShell, desde la carpeta CAM):   npm.cmd run respaldar
// Crea respaldos/cam_db_AAAA-MM-DD_HHMM.dump (formato comprimido "custom").
// La carpeta respaldos/ está excluida de Git porque contiene datos personales.
// Solo LEE la base: no modifica ni borra nada.
const fs = require('node:fs');
const path = require('node:path');
const { RAIZ, ejecutar, consulta, exigir, marcaDeTiempo } = require('./comun');

// Con --neon se respalda la base PUBLICADA en Neon (como cam_admin, con SSL).
const neon = process.argv.includes('--neon');
if (neon) {
  exigir('NEON_DATABASE_URL', 'NEON_CAM_ADMIN_PASSWORD');
  Object.assign(process.env, {
    PGHOST: new URL(process.env.NEON_DATABASE_URL).hostname, PGPORT: '5432', PGSSLMODE: 'require',
    CAM_DB: 'cam_db', CAM_ADMIN_USER: 'cam_admin', CAM_ADMIN_PASSWORD: process.env.NEON_CAM_ADMIN_PASSWORD,
  });
}
exigir('PGHOST', 'PGPORT', 'CAM_DB', 'CAM_ADMIN_USER', 'CAM_ADMIN_PASSWORD');
const base = process.env.CAM_DB;
const carpeta = path.join(RAIZ, 'respaldos');
fs.mkdirSync(carpeta, { recursive: true });
const archivo = path.join(carpeta, `${neon ? 'neon_' : ''}${base}_${marcaDeTiempo()}.dump`);

console.log(`Respaldando la base "${base}"${neon ? ' publicada en Neon' : ''} …`);
const t0 = Date.now();
ejecutar('pg_dump', [
  '--format=custom',                    // comprimido; se restaura con pg_restore
  '--schema=cam', '--schema=ext',       // solo los esquemas de CAM
  '--exclude-table-data=cam.sesion',    // las sesiones abiertas no se respaldan (obliga a ingresar de nuevo)
  '--file', archivo,
], { base });

// Comprobación: el archivo se puede leer y contiene los datos de las tablas.
const contenido = ejecutar('pg_restore', ['--list', archivo]);
const tablas = (contenido.match(/ TABLE DATA cam /g) || []).length;
const resumen = consulta(base, `SELECT (SELECT count(*) FROM cam.propietario) || ' propietarios, ' ||
  (SELECT count(*) FROM cam.pago) || ' pagos, ' || (SELECT count(*) FROM cam.comprobante) || ' comprobantes'`);
const kb = Math.round(fs.statSync(archivo).size / 1024);
console.log(`Listo en ${((Date.now() - t0) / 1000).toFixed(1)} s.`);
console.log(`Archivo: ${path.relative(RAIZ, archivo)} (${kb} KB, datos de ${tablas} tablas)`);
console.log(`Contenido: ${resumen}`);
