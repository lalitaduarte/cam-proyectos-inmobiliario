// Prueba de VOLUMEN y rendimiento (RNF-REN-01, RNF-REN-02, RNF-ESC-01, CP15).
// 1. Reconstruye cam_test con los datos DEMO (nunca toca cam_db).
// 2. Carga 200 propietarios y 1.248 cuotas con las funciones de negocio (como cam_app).
// 3. Mide, a través del servidor real (HTTP), el tiempo de las consultas y de la
//    exportación a Excel, y comprueba que el Excel tiene las mismas filas que la pantalla.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const ExcelJS = require('exceljs');
const { reconstruirBaseDePruebas, consultaDirecta, iniciarServidor, detenerServidor, Cliente, SECRETARIA } = require('../api/ayuda');

const RAIZ = path.join(__dirname, '..', '..');
const PSQL = process.env.PSQL || 'C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe';
const META_CONSULTA_MS = 3000;   // RNF-REN-01
const META_EXCEL_MS = 10000;     // RNF-REN-02 / CP15
const REPETICIONES = 3;          // se toma el PEOR tiempo de 3 intentos

let srv;
let cli;
const medidas = [];

async function medir(nombre, ruta, meta = META_CONSULTA_MS) {
  let peor = 0;
  let r;
  for (let i = 0; i < REPETICIONES; i += 1) {
    const t0 = performance.now();
    r = await cli.get(ruta);
    peor = Math.max(peor, performance.now() - t0);
    assert.equal(r.estado, 200, `${ruta} respondió ${r.estado}`);
  }
  const filas = Array.isArray(r.datos) ? r.datos.length : (r.datos.filas ? r.datos.filas.length : (r.cabeceras.get('x-filas') ?? '—'));
  medidas.push({ nombre, ruta, ms: Math.round(peor), meta, filas });
  assert.ok(peor <= meta, `${nombre}: ${Math.round(peor)} ms supera la meta de ${meta} ms`);
  return r;
}

before(async () => {
  reconstruirBaseDePruebas();
  const t0 = performance.now();
  execFileSync(PSQL, ['-h', process.env.PGHOST, '-p', process.env.PGPORT, '-U', process.env.CAM_APP_USER,
    '-d', 'cam_test', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', 'pruebas/volumen/cargar_volumen.sql'], {
    cwd: RAIZ, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PGPASSWORD: process.env.CAM_APP_PASSWORD, PGCLIENTENCODING: 'UTF8' },
  });
  medidas.push({ nombre: 'Carga de volumen (funciones de negocio)', ruta: 'cargar_volumen.sql', ms: Math.round(performance.now() - t0), meta: null, filas: '—' });
  srv = await iniciarServidor();
  cli = new Cliente(srv.base);
  await cli.entrar(...SECRETARIA);
});

after(async () => {
  await detenerServidor(srv);
  const fecha = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short' }).format(new Date());
  const lineas = [
    `Prueba de volumen CAM — ${fecha} (hora de Colombia)`,
    `Base: cam_test · Servidor real en ${srv?.base} · peor tiempo de ${REPETICIONES} intentos`,
    `Datos: ${consultaDirecta("SELECT count(*) || ' propietarios, ' || (SELECT count(*) FROM cam.adquisicion) || ' adquisiciones, ' || (SELECT count(*) FROM cam.pago WHERE estado<>'ANULADO') || ' cuotas, ' || (SELECT count(*) FROM cam.comprobante) || ' comprobantes' FROM cam.propietario")}`,
    '',
    'Operación'.padEnd(52) + 'Tiempo'.padStart(9) + 'Meta'.padStart(9) + 'Filas'.padStart(8),
    ...medidas.map((m) => m.nombre.padEnd(52) + `${m.ms} ms`.padStart(9) + (m.meta ? `${m.meta / 1000} s` : '—').padStart(9) + String(m.filas).padStart(8)),
  ];
  const texto = lineas.join('\n');
  console.log(`\n${texto}\n`);
  fs.writeFileSync(path.join(RAIZ, 'pruebas', 'evidencias', `volumen_${fecha.replace(/[: ]/g, (c) => (c === ' ' ? '_' : ''))}.txt`), `${texto}\n`);
});

test('Volumen cargado: 200 propietarios, 52 semanas con titular, 1.248 cuotas', () => {
  const [p, a, c] = consultaDirecta(`SELECT (SELECT count(*) FROM cam.propietario), (SELECT count(*) FROM cam.adquisicion WHERE estado_titularidad='VIGENTE'), (SELECT count(*) FROM cam.pago WHERE estado<>'ANULADO')`).split('|').map(Number);
  assert.deepEqual([p, a, c], [200, 52, 1248]);
});

test('Consultas de la secretaria responden en 3 s o menos (RNF-REN-01)', async () => {
  const ana = consultaDirecta("SELECT a.id FROM cam.adquisicion a JOIN cam.semana s ON s.id=a.semana_id WHERE s.numero=5");
  const prop = consultaDirecta("SELECT propietario_id FROM cam.adquisicion a JOIN cam.semana s ON s.id=a.semana_id WHERE s.numero=5");
  await medir('Panel principal (indicadores y gráfico)', '/api/panel');
  await medir('Listado de propietarios', '/api/propietarios');
  await medir('Búsqueda de propietario por cédula', '/api/propietarios?q=910000150');
  await medir('Semanas con titular', '/api/semanas');
  await medir('Adquisiciones', '/api/adquisiciones');
  await medir('Historial de pagos de un propietario', `/api/pagos?propietario_id=${prop}`);
  await medir('Últimos 5.000 pagos (todos)', '/api/pagos?limite=5000');
  await medir('Estado de cuenta individual', `/api/reportes/estado-cuenta?adquisicion_id=${ana}`);
  await medir('Comprobantes', '/api/comprobantes');
  await medir('Reporte: recaudo mensual', '/api/reportes/recaudo');
  await medir('Reporte: saldos por adquisición', '/api/reportes/saldos');
  await medir('Reporte: pagos por verificar', '/api/reportes/por-verificar');
  await medir('Reporte: sin pago en el mes', '/api/reportes/sin-pago?anio=2025&mes=6');
  const hist = await medir('Reporte: historial completo de pagos', '/api/reportes/pagos');
  assert.equal(hist.datos.filas.length, 1249, 'historial = 1.248 cuotas + 1 pago anulado de los datos DEMO');
});

test('Exportación de 1.248 cuotas a Excel en menos de 10 s y con las mismas filas (RNF-REN-02, CP15)', async () => {
  const pantalla = (await cli.get('/api/reportes/pagos?estado=VERIFICADO')).datos.filas.length
    + (await cli.get('/api/reportes/pagos?estado=NO_VERIFICADO')).datos.filas.length;
  assert.equal(pantalla, 1248);
  for (const estado of ['', '?estado=VERIFICADO']) {
    const enPantalla = (await cli.get(`/api/reportes/pagos${estado}`)).datos.filas;
    const r = await medir(`Excel: historial de pagos${estado ? ' (verificados)' : ' (todo)'}`, `/api/reportes/pagos/excel${estado}`, META_EXCEL_MS);
    assert.equal(Number(r.cabeceras.get('x-filas')), enPantalla.length);
    // Se abre el archivo y se cuentan las filas de datos (las 5 primeras son títulos y encabezado).
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(r.datos);
    const hoja = libro.worksheets[0];
    assert.equal(hoja.rowCount - 5, enPantalla.length, 'el Excel debe tener las mismas filas que la pantalla');
    // Spot check: la primera y la última fila coinciden con la pantalla.
    const cedulas = [hoja.getRow(6).getCell(2).value, hoja.getRow(hoja.rowCount).getCell(2).value];
    assert.deepEqual(cedulas, [enPantalla[0].cedula, enPantalla.at(-1).cedula]);
  }
});
