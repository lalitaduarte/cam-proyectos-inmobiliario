// Pruebas del CAMBIO DE TITULAR (D16: el nuevo titular asume el saldo) y de la
// consulta de AUDITORÍA, a través de la API real (servidor + cam_test).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { reconstruirBaseDePruebas, iniciarServidor, detenerServidor, Cliente,
  SECRETARIA, CLAVE_DEMO, CEDULAS, hoy } = require('./ayuda');

let srv;
let sec;
let ana;
const e = {};   // datos compartidos entre pruebas

before(async () => {
  reconstruirBaseDePruebas();
  srv = await iniciarServidor();
  sec = new Cliente(srv.base);
  await sec.entrar(...SECRETARIA);
  ana = new Cliente(srv.base);
  await ana.entrar(CEDULAS.ana, CLAVE_DEMO);
  const adqs = (await sec.get('/api/adquisiciones')).datos;
  e.carlos = adqs.find((a) => a.cedula === CEDULAS.carlos && a.semana_numero === 12);   // 24/24 pagada (DEMO)
  e.conPendientes = adqs.find((a) => a.cuotas_por_verificar > 0);
  e.diana = (await sec.get(`/api/propietarios?q=${CEDULAS.diana}`)).datos[0];
  e.panelAntes = (await sec.get('/api/panel')).datos;
});
after(async () => { await detenerServidor(srv); });

const cuerpo = (extra = {}) => ({ nuevo_propietario_id: e.diana.id, fecha: hoy(), tipo: 'VENTA', soporte: 'PRUEBA contrato 001', ...extra });

test('Cambio de titular: solo la secretaria (propietario 403, sin sesión 401)', async () => {
  assert.equal((await ana.post(`/api/adquisiciones/${e.carlos.adquisicion_id}/transferir`, cuerpo())).estado, 403);
  assert.equal((await new Cliente(srv.base).post(`/api/adquisiciones/${e.carlos.adquisicion_id}/transferir`, cuerpo())).estado, 401);
});

test('Cambio de titular: datos inválidos (400) y pagos sin verificar (409)', async () => {
  const url = `/api/adquisiciones/${e.carlos.adquisicion_id}/transferir`;
  assert.equal((await sec.post(url, cuerpo({ tipo: 'REGALO' }))).estado, 400);
  assert.equal((await sec.post(url, cuerpo({ soporte: 'x' }))).estado, 400);
  assert.equal((await sec.post(url, cuerpo({ fecha: '2999-01-01' }))).estado, 400);
  assert.equal((await sec.post(url, cuerpo({ nuevo_propietario_id: e.carlos.propietario_id }))).estado, 409);
  assert.ok(e.conPendientes, 'los datos DEMO tienen pagos sin verificar');
  const r = await sec.post(`/api/adquisiciones/${e.conPendientes.adquisicion_id}/transferir`,
    cuerpo({ nuevo_propietario_id: e.conPendientes.propietario_id === e.diana.id ? e.carlos.propietario_id : e.diana.id }));
  assert.equal(r.estado, 409);
  assert.match(r.datos.error, /sin verificar/);
});

test('Cambio de titular: venta de una semana pagada; el nuevo titular asume saldo $0', async () => {
  const r = await sec.post(`/api/adquisiciones/${e.carlos.adquisicion_id}/transferir`, cuerpo());
  assert.equal(r.estado, 201);
  assert.equal(r.datos.propietario_id, e.diana.id);
  assert.equal(r.datos.estado_titularidad, 'VIGENTE');
  assert.equal(r.datos.origen, 'VENTA');
  assert.equal(r.datos.adquisicion_anterior_id, e.carlos.adquisicion_id);
  assert.equal(r.datos.cuotas_pagadas, 24);
  assert.equal(r.datos.cuotas_heredadas, 24);
  assert.equal(r.datos.saldo, 0);
  assert.equal(r.datos.situacion_pago, 'PAGADA');
  e.nueva = r.datos.adquisicion_id;
});

test('Estado de cuenta tras la venta: titulares, pagos anteriores y plan heredado', async () => {
  const ec = (await sec.get(`/api/adquisiciones/${e.nueva}`)).datos;
  assert.equal(ec.titulares.length, 2);
  assert.equal(ec.titulares[0].nombre_completo, e.diana.nombre_completo);   // el más reciente primero
  assert.equal(ec.titulares[0].titular_anterior, e.carlos.nombre_completo);
  assert.equal(ec.titulares[1].fecha_fin_titularidad, hoy());
  assert.equal(ec.pagos.length, 0);                    // la nueva titular aún no ha pagado nada
  assert.equal(ec.pagos_anteriores.length, 24);
  assert.ok(ec.cuotas.every((c) => c.situacion_cuota === 'PAGADA' && c.de_titular_anterior));
  const vieja = (await sec.get(`/api/adquisiciones/${e.carlos.adquisicion_id}`)).datos;
  assert.equal(vieja.estado_titularidad, 'TRANSFERIDA');
  assert.equal(vieja.pagos.length >= 24, true);        // los pagos siguen a nombre de Carlos
});

test('Listado por titularidad y semana con un solo titular vigente', async () => {
  const vigentes = (await sec.get('/api/adquisiciones?titularidad=VIGENTE&q=12')).datos;
  assert.deepEqual(vigentes.map((a) => a.propietario_id), [e.diana.id]);
  const anteriores = (await sec.get('/api/adquisiciones?titularidad=TRANSFERIDA')).datos;
  assert.ok(anteriores.some((a) => a.adquisicion_id === e.carlos.adquisicion_id));
  const panel = (await sec.get('/api/panel')).datos;
  assert.equal(panel.semanas_con_titular, e.panelAntes.semanas_con_titular);
  assert.equal(panel.saldo_por_cobrar, e.panelAntes.saldo_por_cobrar);   // la semana estaba pagada: el saldo no cambia
});

test('Después de transferir: no se cobra dos veces ni se transfiere otra vez la adquisición anterior', async () => {
  const p = await sec.post('/api/pagos', { adquisicion_id: e.nueva, numero_cuota: 1, valor: 750000, fecha_pago: hoy() });
  assert.equal(p.estado, 409);
  const p2 = await sec.post('/api/pagos', { adquisicion_id: e.carlos.adquisicion_id, numero_cuota: 1, valor: 750000, fecha_pago: hoy() });
  assert.equal(p2.estado, 409);
  const t = await sec.post(`/api/adquisiciones/${e.carlos.adquisicion_id}/transferir`, cuerpo());
  assert.equal(t.estado, 409);
});

test('Auditoría: el cambio de titular queda registrado con quién, cuándo y el detalle', async () => {
  const r = await sec.get('/api/auditoria?accion=TRANSFERIR');
  assert.equal(r.estado, 200);
  assert.equal(r.datos.total, 1);
  const f = r.datos.filas[0];
  assert.equal(f.usuario_rol, 'SECRETARIA');
  assert.equal(f.detalle.de, e.carlos.nombre_completo);
  assert.equal(f.detalle.a, e.diana.nombre_completo);
  assert.equal(f.detalle.soporte, 'PRUEBA contrato 001');
  assert.ok(r.datos.acciones.includes('TRANSFERIR'));
});

test('Auditoría: filtros por fecha y usuario, paginación y validación', async () => {
  const todo = (await sec.get('/api/auditoria')).datos;
  assert.equal(todo.porPagina, 50);
  assert.ok(todo.filas.length <= 50);
  assert.ok(todo.total >= todo.filas.length);
  const fechas = todo.filas.map((f) => f.ocurrido_en);
  assert.deepEqual([...fechas].sort().reverse(), fechas);     // la más reciente primero
  assert.equal((await sec.get('/api/auditoria?desde=2001-01-01&hasta=2001-01-31')).datos.total, 0);
  const secId = todo.usuarios.find((u) => u.rol === 'SECRETARIA').id;
  const deSec = (await sec.get(`/api/auditoria?usuario_id=${secId}`)).datos;
  assert.ok(deSec.filas.every((f) => f.usuario_id === secId));
  assert.equal((await sec.get('/api/auditoria?desde=ayer')).estado, 400);
});

test('Auditoría: los propietarios no pueden consultarla (403)', async () => {
  assert.equal((await ana.get('/api/auditoria')).estado, 403);
});

test('Auditoría: los cambios del calendario de semanas quedan registrados', async () => {
  const semana = (await sec.get('/api/semanas?anio=2031')).datos.semanas.find((s) => s.numero === 40);
  const r = await sec.post(`/api/semanas/${semana.semana_id}/fechas`, { anio: 2031, fecha_entrada: '2031-10-04', fecha_salida: '2031-10-11' });
  assert.equal(r.estado, 201);
  const a = (await sec.get(`/api/auditoria?accion=CREAR&registro_id=${r.datos.id}`)).datos.filas
    .find((f) => f.tabla === 'semana_fecha');
  assert.ok(a, 'hay registro de auditoría de la fecha creada');
  assert.equal(a.detalle.semana, 40);
  assert.equal(a.detalle.anio, 2031);
});
