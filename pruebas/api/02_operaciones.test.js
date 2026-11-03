// Pruebas de operaciones de la secretaria: propietarios, semanas, adquisiciones,
// pagos, comprobantes, estado de cuenta y parámetros.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { reconstruirBaseDePruebas, consultaDirecta, iniciarServidor, detenerServidor, Cliente,
  SECRETARIA, hoy } = require('./ayuda');

let srv;
let sec;
before(async () => {
  reconstruirBaseDePruebas();
  srv = await iniciarServidor();
  sec = new Cliente(srv.base);
  await sec.entrar(...SECRETARIA);
});
after(async () => { await detenerServidor(srv); });

const estado = { };   // ids compartidos entre pruebas

// ---------------------------------------------------------------- Propietarios
test('Propietarios: registro válido, búsqueda por cédula y por nombre', async () => {
  const r = await sec.post('/api/propietarios', {
    cedula: '900.000.401', nombre_completo: 'PRUEBA Rosa Mejía', correo: 'Prueba.Rosa@Ejemplo.test',
    telefono: '300 111 2233', clave_temporal: 'Temporal2026',
  });
  assert.equal(r.estado, 201);
  assert.equal(r.datos.cedula, '900000401');           // puntos eliminados, guardada como texto
  assert.equal(r.datos.correo, 'prueba.rosa@ejemplo.test');
  estado.rosa = r.datos.id;
  assert.equal((await sec.get('/api/propietarios?q=900000401')).datos.length, 1);
  assert.equal((await sec.get('/api/propietarios?q=rosa mej')).datos.length, 1);
});

test('Propietarios: cédula duplicada (409), correo duplicado (409), datos inválidos (400)', async () => {
  const base = { nombre_completo: 'PRUEBA Dup', clave_temporal: 'Temporal2026' };
  const a = await sec.post('/api/propietarios', { ...base, cedula: '900000401', correo: 'otro@ejemplo.test' });
  assert.equal(a.estado, 409);
  assert.equal(a.datos.error, 'Ya existe un propietario con esa cédula.');
  const b = await sec.post('/api/propietarios', { ...base, cedula: '900000402', correo: 'PRUEBA.ROSA@ejemplo.test' });
  assert.equal(b.estado, 409);
  assert.equal((await sec.post('/api/propietarios', { ...base, cedula: '12AB', correo: 'x@ejemplo.test' })).estado, 400);
  assert.equal((await sec.post('/api/propietarios', { ...base, cedula: '900000403', correo: 'sin-arroba' })).estado, 400);
  assert.equal(consultaDirecta("SELECT count(*) FROM cam.propietario WHERE cedula IN ('900000402','900000403')"), '0');
});

test('Propietarios: editar, desactivar y no eliminar si tiene historial', async () => {
  const e = await sec.put(`/api/propietarios/${estado.rosa}`, {
    cedula: '900000401', nombre_completo: 'PRUEBA Rosa Mejía Editada', correo: 'prueba.rosa@ejemplo.test',
  });
  assert.equal(e.estado, 200);
  assert.equal(e.datos.nombre_completo, 'PRUEBA Rosa Mejía Editada');
  assert.equal((await sec.patch(`/api/propietarios/${estado.rosa}/estado`, { activo: false })).datos.activo, false);
  assert.equal((await sec.patch(`/api/propietarios/${estado.rosa}/estado`, { activo: true })).datos.activo, true);
  const ana = (await sec.get('/api/propietarios?q=900000101')).datos[0];
  assert.equal((await sec.delete(`/api/propietarios/${ana.id}`)).estado, 409);
});

// ---------------------------------------------------------------- Semanas
test('Semanas: fechas inválidas (400), traslapadas (409) y válidas (201)', async () => {
  const lista = (await sec.get('/api/semanas?anio=2028')).datos.semanas;
  assert.equal(lista.length, 52);
  const s10 = lista.find((s) => s.numero === 10).semana_id;
  const s11 = lista.find((s) => s.numero === 11).semana_id;
  assert.equal((await sec.post(`/api/semanas/${s10}/fechas`, { anio: 2028, fecha_entrada: '2028-03-11', fecha_salida: '2028-03-04' })).estado, 400);
  assert.equal((await sec.post(`/api/semanas/${s10}/fechas`, { anio: 2028, fecha_entrada: '2028-03-04', fecha_salida: '2028-03-04' })).estado, 400);
  assert.equal((await sec.post(`/api/semanas/${s10}/fechas`, { anio: 2028, fecha_entrada: '2028-02-30', fecha_salida: '2028-03-04' })).estado, 400);
  const ok = await sec.post(`/api/semanas/${s10}/fechas`, { anio: 2028, fecha_entrada: '2028-03-04', fecha_salida: '2028-03-11', nota: 'PRUEBA' });
  assert.equal(ok.estado, 201);
  const cruce = await sec.post(`/api/semanas/${s11}/fechas`, { anio: 2028, fecha_entrada: '2028-03-08', fecha_salida: '2028-03-15' });
  assert.equal(cruce.estado, 409);
  assert.equal(cruce.datos.error, 'Las fechas se cruzan con las de otra semana.');
});

test('Semanas: consulta de disponibilidad y titular actual', async () => {
  const lista = (await sec.get('/api/semanas')).datos.semanas;
  const s5 = lista.find((s) => s.numero === 5);
  assert.equal(s5.disponibilidad, 'CON_TITULAR');
  assert.match(s5.titular_nombre, /Ana María/);
  const disponibles = (await sec.get('/api/semanas/disponibles')).datos;
  assert.equal(disponibles.length, 52 - 9);
});

// ---------------------------------------------------------------- Adquisiciones
test('Adquisiciones: semana con titular (409) y asignación válida que copia las condiciones', async () => {
  const semanas = (await sec.get('/api/semanas')).datos.semanas;
  const s5 = semanas.find((s) => s.numero === 5).semana_id;
  const s7 = semanas.find((s) => s.numero === 7).semana_id;
  const ocupada = await sec.post('/api/adquisiciones', { propietario_id: estado.rosa, semana_id: s5, fecha_adquisicion: '2026-01-10' });
  assert.equal(ocupada.estado, 409);
  assert.match(ocupada.datos.error, /ya tiene titular actual/);
  const r = await sec.post('/api/adquisiciones', { propietario_id: estado.rosa, semana_id: s7, fecha_adquisicion: '2026-01-10' });
  assert.equal(r.estado, 201);
  assert.equal(r.datos.valor_accion, 18000000);
  assert.equal(r.datos.numero_cuotas, 24);
  assert.equal(r.datos.valor_cuota, 750000);
  assert.equal(r.datos.saldo, 18000000);
  estado.adq = r.datos.adquisicion_id;
});

// ---------------------------------------------------------------- Pagos
test('Pagos: registro válido; usuario y fecha de registro los pone el servidor', async () => {
  const r = await sec.post('/api/pagos', {
    adquisicion_id: estado.adq, numero_cuota: 1, valor: '750.000', fecha_pago: '2026-02-05', referencia: 'PRUEBA-1',
    registrado_por: 999, registrado_en: '2000-01-01',      // campos intrusos: deben ignorarse
  });
  assert.equal(r.estado, 201);
  assert.equal(r.datos.estado, 'NO_VERIFICADO');
  assert.equal(r.datos.registrado_por_nombre, 'DEMO Secretaria CAM');
  assert.ok(Date.now() - new Date(r.datos.registrado_en).getTime() < 60000);
  assert.equal(r.datos.fecha_pago, '2026-02-05');           // fecha del pago ≠ fecha de registro
  estado.pago1 = r.datos.pago_id;
});

test('Pagos: cuota repetida, fuera del plan, importe incorrecto, cero, negativo y fecha futura', async () => {
  const p = (extra) => sec.post('/api/pagos', { adquisicion_id: estado.adq, numero_cuota: 2, valor: 750000, fecha_pago: '2026-03-05', ...extra });
  const repetida = await p({ numero_cuota: 1 });
  assert.equal(repetida.estado, 409);
  assert.equal(repetida.datos.error, 'La cuota 1 de esta adquisición ya tiene un pago registrado.');
  assert.equal((await p({ numero_cuota: 25 })).estado, 400);
  const importe = await p({ valor: 700000 });
  assert.equal(importe.estado, 400);
  assert.equal(importe.datos.error, 'El valor debe ser el de la cuota completa: $750.000.');
  assert.equal((await p({ valor: 0 })).estado, 400);
  assert.equal((await p({ valor: -750000 })).estado, 400);
  const manana = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  assert.equal((await p({ fecha_pago: manana })).estado, 400);
  assert.equal((await p({ adquisicion_id: 999999 })).estado, 404);
  assert.equal(consultaDirecta(`SELECT count(*) FROM cam.pago WHERE adquisicion_id = ${estado.adq}`), '1');
});

test('Pagos: 8 solicitudes HTTP simultáneas de la misma cuota -> 1 registrada, 7 rechazadas', async () => {
  const respuestas = await Promise.all(Array.from({ length: 8 }, () =>
    sec.post('/api/pagos', { adquisicion_id: estado.adq, numero_cuota: 2, valor: 750000, fecha_pago: '2026-03-05' })));
  const codigos = respuestas.map((r) => r.estado).sort();
  assert.deepEqual(codigos, [201, 409, 409, 409, 409, 409, 409, 409]);
  assert.equal(consultaDirecta(`SELECT count(*) FROM cam.pago WHERE adquisicion_id = ${estado.adq} AND numero_cuota = 2`), '1');
});

// ---------------------------------------------------------------- Verificación y comprobantes
test('Comprobante: no se emite para pago sin verificar; verificar; emitir; no duplicar', async () => {
  const sinVerificar = await sec.post(`/api/pagos/${estado.pago1}/comprobante`);
  assert.equal(sinVerificar.estado, 409);
  assert.equal(sinVerificar.datos.error, 'Solo se emiten comprobantes de pagos verificados.');

  const v = await sec.post(`/api/pagos/${estado.pago1}/verificar`);
  assert.equal(v.estado, 200);
  assert.equal(v.datos.estado, 'VERIFICADO');
  assert.equal(v.datos.verificado_por_nombre, 'DEMO Secretaria CAM');
  assert.equal((await sec.post(`/api/pagos/${estado.pago1}/verificar`)).estado, 409);

  // 5 emisiones simultáneas del mismo pago: solo una
  const rs = await Promise.all(Array.from({ length: 5 }, () => sec.post(`/api/pagos/${estado.pago1}/comprobante`)));
  assert.deepEqual(rs.map((r) => r.estado).sort(), [201, 409, 409, 409, 409]);
  const cp = rs.find((r) => r.estado === 201).datos;
  assert.match(cp.numero, /^CP-\d{6}$/);
  assert.equal(cp.estado_envio, 'PENDIENTE');
  estado.cp = cp.id;
  assert.equal(consultaDirecta(`SELECT count(*) FROM cam.comprobante WHERE pago_id = ${estado.pago1}`), '1');
});

test('Comprobante: PDF descargable con contenido válido', async () => {
  const r = await sec.get(`/api/comprobantes/${estado.cp}/pdf`);
  assert.equal(r.estado, 200);
  assert.equal(r.cabeceras.get('content-type'), 'application/pdf');
  assert.equal(r.datos.subarray(0, 5).toString(), '%PDF-');
  assert.ok(r.datos.length > 1500);
  const d = await sec.get(`/api/comprobantes/${estado.cp}/pdf?descargar=1`);
  assert.match(d.cabeceras.get('content-disposition'), /^attachment; filename="comprobante-CP-\d{6}\.pdf"/);
});

test('Comprobante: incluye los datos exigidos y la aclaración', async () => {
  const c = (await sec.get(`/api/comprobantes/${estado.cp}`)).datos;
  assert.equal(c.empresa, 'CAM PROYECTOS INMOBILIARIOS S.A.S.');
  assert.equal(c.propietario_nombre, 'PRUEBA Rosa Mejía Editada');
  assert.equal(c.semana_numero, 7);
  assert.equal(c.numero_cuota, 1);
  assert.equal(c.valor, 750000);
  assert.equal(c.fecha_pago, '2026-02-05');
  assert.equal(c.emisor_nombre, 'DEMO Secretaria CAM');
  assert.equal(c.nota, 'Soporte interno de pago. No es factura electrónica.');
  assert.ok(c.emitido_en);
});

test('Pago con comprobante: no se anula ni se revierte; el envío por correo no se finge', async () => {
  assert.equal((await sec.post(`/api/pagos/${estado.pago1}/anular`, { motivo: 'PRUEBA anular' })).estado, 409);
  assert.equal((await sec.post(`/api/pagos/${estado.pago1}/revertir-verificacion`, { motivo: 'PRUEBA revertir' })).estado, 409);
  const envio = await sec.post(`/api/comprobantes/${estado.cp}/enviar`);
  assert.equal(envio.estado, 503);
  assert.equal(consultaDirecta(`SELECT count(*) FROM cam.envio_comprobante WHERE comprobante_id = ${estado.cp}`), '0');
  assert.equal((await sec.get(`/api/comprobantes/${estado.cp}`)).datos.estado_envio, 'PENDIENTE');
});

test('Anulación con historial: exige motivo, conserva el registro y libera la cuota', async () => {
  const p2 = consultaDirecta(`SELECT id FROM cam.pago WHERE adquisicion_id = ${estado.adq} AND numero_cuota = 2`);
  assert.equal((await sec.post(`/api/pagos/${p2}/anular`, { motivo: '' })).estado, 400);
  const a = await sec.post(`/api/pagos/${p2}/anular`, { motivo: 'PRUEBA: fecha equivocada' });
  assert.equal(a.estado, 200);
  assert.equal(a.datos.estado, 'ANULADO');
  assert.equal(a.datos.anulado_por_nombre, 'DEMO Secretaria CAM');
  const otra = await sec.post('/api/pagos', { adquisicion_id: estado.adq, numero_cuota: 2, valor: 750000, fecha_pago: '2026-03-06' });
  assert.equal(otra.estado, 201);
  const historial = (await sec.get(`/api/pagos?adquisicion_id=${estado.adq}`)).datos;
  assert.equal(historial.filter((x) => x.numero_cuota === 2).length, 2);
});

// ---------------------------------------------------------------- Estado de cuenta
test('Estado de cuenta: 10 cuotas verificadas = $7.500.000, 14 pendientes, $10.500.000 (DEMO Ana, semana 5)', async () => {
  const lista = (await sec.get('/api/adquisiciones?q=5')).datos;
  const adq = lista.find((x) => x.semana_numero === 5);
  const ec = (await sec.get(`/api/adquisiciones/${adq.adquisicion_id}`)).datos;
  assert.equal(ec.total_abonado, 7500000);
  assert.equal(ec.cuotas_pagadas, 10);
  assert.equal(ec.cuotas_pendientes, 14);
  assert.equal(ec.saldo, 10500000);
  assert.equal(ec.cuotas.length, 24);
  assert.equal(ec.cuotas.filter((c) => c.situacion_cuota === 'PAGADA').length, 10);
  assert.equal(ec.pagos.filter((p) => p.comprobante_numero).length, 8);
});

test('Estado de cuenta: los pagos sin verificar se muestran aparte y no bajan el saldo', async () => {
  const ec = (await sec.get(`/api/adquisiciones/${estado.adq}`)).datos;
  assert.equal(ec.total_registrado, 1500000);   // cuota 1 (verificada) + cuota 2 (sin verificar)
  assert.equal(ec.total_abonado, 750000);       // solo la verificada
  assert.equal(ec.cuotas_por_verificar, 1);
  assert.equal(ec.saldo, 17250000);
});

test('Propietario con dos semanas: cada adquisición tiene su propio plan y saldo', async () => {
  const ana = (await sec.get('/api/propietarios?q=900000101')).datos[0];
  const ficha = (await sec.get(`/api/propietarios/${ana.id}`)).datos;
  assert.equal(ficha.adquisiciones.length, 2);
  const [a, b] = ficha.adquisiciones;
  assert.notEqual(a.saldo, b.saldo);
  assert.deepEqual(ficha.adquisiciones.map((x) => x.semana_numero), [5, 30]);
});

// ---------------------------------------------------------------- Parámetros
test('Parámetros: incoherentes rechazados; un cambio no altera adquisiciones ni pagos anteriores', async () => {
  assert.equal((await sec.post('/api/parametros', { valor_accion: 18000000, numero_cuotas: 24, valor_cuota: 700000 })).estado, 400);
  const nuevo = await sec.post('/api/parametros', { valor_accion: 20000000, numero_cuotas: 20, valor_cuota: 1000000 });
  assert.equal(nuevo.estado, 201);
  assert.equal((await sec.get('/api/parametros')).datos.vigente.valor_cuota, 1000000);
  const antes = (await sec.get(`/api/adquisiciones/${estado.adq}`)).datos;
  assert.equal(antes.valor_cuota, 750000);
  assert.equal(antes.valor_accion, 18000000);
  // Pagar la adquisición antigua con la cuota nueva es rechazado
  assert.equal((await sec.post('/api/pagos', { adquisicion_id: estado.adq, numero_cuota: 3, valor: 1000000, fecha_pago: hoy() })).estado, 400);
  // Una adquisición nueva toma las condiciones nuevas
  const s8 = (await sec.get('/api/semanas')).datos.semanas.find((s) => s.numero === 8).semana_id;
  const n = await sec.post('/api/adquisiciones', { propietario_id: estado.rosa, semana_id: s8, fecha_adquisicion: hoy() });
  assert.equal(n.datos.valor_accion, 20000000);
  assert.equal(n.datos.numero_cuotas, 20);
  assert.equal(consultaDirecta('SELECT count(*) FROM cam.pago WHERE valor <> 750000'), '0');
  await sec.post('/api/parametros', { valor_accion: 18000000, numero_cuotas: 24, valor_cuota: 750000 });
});
