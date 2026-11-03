// Pruebas de reportes (pantalla vs Excel con los mismos filtros) y de la comunidad.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { reconstruirBaseDePruebas, consultaDirecta, iniciarServidor, detenerServidor, Cliente,
  SECRETARIA, CLAVE_DEMO, CEDULAS } = require('./ayuda');

let srv;
let sec;
const p = {};   // clientes de propietarios
before(async () => {
  reconstruirBaseDePruebas();
  srv = await iniciarServidor();
  sec = new Cliente(srv.base);
  await sec.entrar(...SECRETARIA);
  for (const nombre of ['ana', 'carlos', 'diana', 'helena']) {
    p[nombre] = new Cliente(srv.base);
    await p[nombre].entrar(CEDULAS[nombre], CLAVE_DEMO);
  }
});
after(async () => { await detenerServidor(srv); });

// Lee las filas de datos del Excel (la fila 5 es el encabezado).
async function filasExcel(buffer) {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(buffer);
  const hoja = libro.worksheets[0];
  const filas = [];
  hoja.eachRow((fila, n) => { if (n > 5) filas.push(fila.values.slice(1)); });
  return { hoja, filas };
}

// ---------------------------------------------------------------- Reportes
const CASOS = [
  ['recaudo', 'desde=2025-06-01&hasta=2026-03-31'],
  ['recaudo', ''],
  ['pagos', 'estado=VERIFICADO&desde=2025-10-01&hasta=2026-06-30'],
  ['pagos', 'estado=NO_VERIFICADO'],
  ['por-verificar', ''],
  ['saldos', 'situacion=EN_CURSO'],
  ['saldos', 'situacion=PAGADA'],
  ['sin-pago', 'anio=2026&mes=10'],
];

for (const [nombre, filtros] of CASOS) {
  test(`Exportación coherente: ${nombre}?${filtros} tiene las mismas filas en pantalla y en Excel`, async () => {
    const json = await sec.get(`/api/reportes/${nombre}?${filtros}`);
    assert.equal(json.estado, 200);
    const xls = await sec.get(`/api/reportes/${nombre}/excel?${filtros}`);
    assert.equal(xls.estado, 200);
    assert.match(xls.cabeceras.get('content-type'), /spreadsheetml/);
    const { hoja, filas } = await filasExcel(xls.datos);
    assert.equal(filas.length, json.datos.filas.length);
    assert.equal(Number(xls.cabeceras.get('x-filas')), json.datos.filas.length);
    // Encabezados iguales a los títulos de las columnas
    assert.deepEqual(hoja.getRow(5).values.slice(1), json.datos.columnas.map((c) => c.titulo));
    // Primera columna igual fila por fila
    const col = json.datos.columnas[0];
    json.datos.filas.forEach((f, i) => {
      const enExcel = filas[i][0];
      const esperado = col.tipo === 'fecha' ? f[col.clave] : f[col.clave];
      const leido = enExcel instanceof Date ? enExcel.toISOString().slice(0, 10) : enExcel;
      assert.equal(String(leido), String(esperado));
    });
  });
}

test('Reportes: los filtros sí cambian el resultado y coinciden con un cálculo directo en la base', async () => {
  const todos = (await sec.get('/api/reportes/pagos')).datos.filas.length;
  const verif = (await sec.get('/api/reportes/pagos?estado=VERIFICADO')).datos.filas.length;
  assert.ok(verif < todos);
  assert.equal(String(verif), consultaDirecta("SELECT count(*) FROM cam.pago WHERE estado = 'VERIFICADO'"));
  const rec = (await sec.get('/api/reportes/recaudo?desde=2025-06-01&hasta=2026-03-31')).datos.filas;
  const suma = rec.reduce((s, f) => s + f.total_registrado, 0);
  assert.equal(String(suma), consultaDirecta(
    "SELECT sum(valor)::bigint FROM cam.pago WHERE estado <> 'ANULADO' AND fecha_pago BETWEEN '2025-06-01' AND '2026-03-31'"));
});

test('Reportes: "sin pago en el mes" no es mora y excluye a quien pagó ese mes', async () => {
  const r = (await sec.get('/api/reportes/sin-pago?anio=2026&mes=10')).datos;
  assert.equal(r.titulo, 'Adquisiciones sin pago registrado en el mes');
  const semanas = r.filas.map((f) => f.semana_numero);
  assert.ok(!semanas.includes(45));   // DEMO Gabriel pagó el 5 de octubre
  assert.ok(!semanas.includes(12));   // DEMO Carlos ya registró las 24 cuotas
  assert.ok(semanas.includes(22));    // DEMO Esteban no tiene pagos
});

test('Reportes: reporte inexistente (404) y filtros inválidos (400)', async () => {
  assert.equal((await sec.get('/api/reportes/inventado')).estado, 404);
  assert.equal((await sec.get('/api/reportes/__proto__')).estado, 404);
  assert.equal((await sec.get('/api/reportes/recaudo?desde=2026-13-01')).estado, 400);
  assert.equal((await sec.get('/api/reportes/recaudo?desde=2026-05-01&hasta=2026-01-01')).estado, 400);
  assert.equal((await sec.get('/api/reportes/sin-pago?anio=2026')).estado, 400);
});

test('Estado de cuenta exportable a Excel (24 cuotas)', async () => {
  const adq = consultaDirecta("SELECT a.id FROM cam.adquisicion a JOIN cam.semana s ON s.id = a.semana_id WHERE s.numero = 5");
  const xls = await sec.get(`/api/reportes/estado-cuenta/excel?adquisicion_id=${adq}`);
  const { filas } = await filasExcel(xls.datos);
  assert.equal(filas.length, 24);
});

// ---------------------------------------------------------------- Comunidad
const adqDeSemana = (n) => consultaDirecta(
  `SELECT a.id FROM cam.adquisicion a JOIN cam.semana s ON s.id = a.semana_id WHERE s.numero = ${n} AND a.estado_titularidad = 'VIGENTE'`);
const c = {};

test('Comunidad: el propietario ve solo ofertas activas, sin cédula ni correo del autor', async () => {
  const r = await p.carlos.get('/api/ofertas');
  assert.equal(r.estado, 200);
  assert.ok(r.datos.length >= 2);
  assert.ok(r.datos.every((o) => o.estado === 'ACTIVA'));
  for (const o of r.datos) {
    assert.equal(o.cedula, undefined);
    assert.equal(o.correo, undefined);
    assert.equal(o.propietario_id, undefined);
  }
  // Aunque pida otro estado, el propietario solo recibe activas
  const pedido = await p.carlos.get('/api/ofertas?estado=RETIRADA');
  assert.ok(pedido.datos.every((o) => o.estado === 'ACTIVA'));
});

test('Comunidad: filtro por tipo', async () => {
  const ventas = (await p.carlos.get('/api/ofertas?tipo=VENTA')).datos;
  const cambios = (await p.carlos.get('/api/ofertas?tipo=INTERCAMBIO')).datos;
  assert.ok(ventas.length > 0 && ventas.every((o) => o.tipo === 'VENTA'));
  assert.ok(cambios.length > 0 && cambios.every((o) => o.tipo === 'INTERCAMBIO'));
});

test('Comunidad: oferta sobre semana ajena es rechazada (403)', async () => {
  const r = await p.ana.post('/api/ofertas', { adquisicion_id: adqDeSemana(12), tipo: 'VENTA', precio: 1000000, descripcion: 'PRUEBA ajena' });
  assert.equal(r.estado, 403);
  assert.equal(r.datos.error, 'Solo puede ofertar semanas de las que es titular actual.');
});

test('Comunidad: reglas de precio por tipo', async () => {
  const adq = adqDeSemana(5);
  assert.equal((await p.ana.post('/api/ofertas', { adquisicion_id: adq, tipo: 'INTERCAMBIO', precio: 5000, descripcion: 'PRUEBA' })).estado, 400);
  assert.equal((await p.ana.post('/api/ofertas', { adquisicion_id: adq, tipo: 'VENTA', descripcion: 'PRUEBA venta' })).estado, 400);
  assert.equal((await p.ana.post('/api/ofertas', { adquisicion_id: adq, tipo: 'VENTA', precio: 0, descripcion: 'PRUEBA venta' })).estado, 400);
  const ok = await p.ana.post('/api/ofertas', { adquisicion_id: adq, tipo: 'INTERCAMBIO', descripcion: 'PRUEBA: cambio semana 5' });
  assert.equal(ok.estado, 201);
  assert.equal(ok.datos.es_mia, true);
  c.oferta = ok.datos.oferta_id;
});

test('Comunidad: la secretaria no publica; otro propietario no puede retirar ni eliminar la oferta', async () => {
  assert.equal((await sec.post('/api/ofertas', { adquisicion_id: adqDeSemana(5), tipo: 'INTERCAMBIO', descripcion: 'PRUEBA' })).estado, 403);
  assert.equal((await p.carlos.post(`/api/ofertas/${c.oferta}/cerrar`, { estado: 'RETIRADA' })).estado, 403);
  assert.equal((await p.carlos.delete(`/api/ofertas/${c.oferta}`)).estado, 403);
});

test('Comunidad: mensajes en orden cronológico con autor', async () => {
  assert.equal((await p.carlos.post(`/api/ofertas/${c.oferta}/mensajes`, { texto: 'PRUEBA: me interesa' })).estado, 201);
  assert.equal((await p.ana.post(`/api/ofertas/${c.oferta}/mensajes`, { texto: 'PRUEBA: hablemos' })).estado, 201);
  assert.equal((await p.carlos.post(`/api/ofertas/${c.oferta}/mensajes`, { texto: '   ' })).estado, 400);
  const m = (await p.ana.get(`/api/ofertas/${c.oferta}/mensajes`)).datos;
  assert.deepEqual(m.map((x) => x.texto), ['PRUEBA: me interesa', 'PRUEBA: hablemos']);
  assert.match(m[0].autor_nombre, /Carlos/);
  assert.equal(m[1].es_mio, true);
});

test('Comunidad: oferta retirada no admite mensajes y solo la ven quienes participaron', async () => {
  const r = await p.ana.post(`/api/ofertas/${c.oferta}/cerrar`, { estado: 'RETIRADA' });
  assert.equal(r.estado, 200);
  assert.equal(r.datos.estado, 'RETIRADA');
  const tarde = await p.carlos.post(`/api/ofertas/${c.oferta}/mensajes`, { texto: 'PRUEBA tarde' });
  assert.equal(tarde.estado, 409);
  assert.equal(tarde.datos.error, 'La oferta está cerrada; no admite mensajes nuevos.');
  assert.equal((await p.carlos.get(`/api/ofertas/${c.oferta}/mensajes`)).estado, 200);   // participó
  assert.equal((await p.helena.get(`/api/ofertas/${c.oferta}`)).estado, 404);            // no participó
  assert.ok(!(await p.helena.get('/api/ofertas')).datos.some((o) => o.oferta_id === c.oferta));
  assert.equal((await p.ana.delete(`/api/ofertas/${c.oferta}`)).estado, 409);            // tiene mensajes
});

test('Comunidad: concretar una oferta NO transfiere la titularidad', async () => {
  const adq = adqDeSemana(30);
  const of = (await p.ana.get('/api/ofertas/mias')).datos.ofertas.find((o) => o.semana_numero === 30 && o.estado === 'ACTIVA');
  const r = await p.ana.post(`/api/ofertas/${of.oferta_id}/cerrar`, { estado: 'CONCRETADA' });
  assert.equal(r.datos.estado, 'CONCRETADA');
  assert.equal((await p.diana.post(`/api/ofertas/${of.oferta_id}/mensajes`, { texto: 'PRUEBA' })).estado, 409);
  assert.equal(consultaDirecta(
    `SELECT p.cedula || '|' || a.estado_titularidad FROM cam.adquisicion a JOIN cam.propietario p ON p.id = a.propietario_id WHERE a.id = ${adq}`),
  `${CEDULAS.ana}|VIGENTE`);
});

test('Comunidad: eliminar oferta propia publicada por error (sin mensajes)', async () => {
  const of = await p.ana.post('/api/ofertas', { adquisicion_id: adqDeSemana(5), tipo: 'VENTA', precio: 25000000, descripcion: 'PRUEBA error' });
  assert.equal(of.estado, 201);
  assert.equal((await p.ana.delete(`/api/ofertas/${of.datos.oferta_id}`)).estado, 200);
  assert.equal(consultaDirecta(`SELECT count(*) FROM cam.oferta WHERE id = ${of.datos.oferta_id}`), '0');
});

test('Comunidad: la secretaria supervisa todas las ofertas y puede cerrar cualquiera', async () => {
  const todas = (await sec.get('/api/ofertas?estado=TODAS')).datos;
  assert.ok(todas.some((o) => o.estado === 'RETIRADA'));
  assert.ok(todas.some((o) => o.estado === 'CONCRETADA'));
  const activa = todas.find((o) => o.estado === 'ACTIVA');
  assert.equal((await sec.post(`/api/ofertas/${activa.oferta_id}/mensajes`, { texto: 'PRUEBA: mensaje de CAM' })).estado, 201);
  assert.equal((await sec.post(`/api/ofertas/${activa.oferta_id}/cerrar`, { estado: 'RETIRADA' })).estado, 200);
});

test('Comunidad: "mis semanas" solo lista semanas propias con titularidad vigente', async () => {
  const r = (await p.ana.get('/api/ofertas/mias')).datos;
  assert.deepEqual(r.semanas.map((s) => s.semana_numero), [5, 30]);
  assert.equal((await sec.get('/api/ofertas/mias')).estado, 403);
});
