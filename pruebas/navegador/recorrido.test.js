// Recorrido completo desde las PANTALLAS, en un Chrome real sin ventana (headless),
// contra el servidor real conectado a cam_test. Toma capturas en computador y celular.
//   npm.cmd run test:navegador
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { reconstruirBaseDePruebas, iniciarServidor, detenerServidor, consultaDirecta, CLAVE_DEMO, CEDULAS } = require('../api/ayuda');
const { abrirNavegador } = require('./cdp');

const CAPTURAS = path.join(__dirname, '..', 'evidencias', 'capturas');
let srv;
let nav;
const datos = {};

before(async () => {
  fs.mkdirSync(CAPTURAS, { recursive: true });
  reconstruirBaseDePruebas();
  srv = await iniciarServidor(3199);
  nav = await abrirNavegador();
  await nav.tamano(1366, 900);
});
after(async () => {
  if (nav) await nav.cerrar();
  await detenerServidor(srv);
});

// Errores reales de la página (se ignoran las respuestas 4xx esperadas de la API).
function erroresReales() {
  return nav.errores.filter((e) => !/Failed to load resource: the server responded with a status of 4\d\d/.test(e));
}
async function capturar(nombre, { movil = false } = {}) {
  const [ancho, alto] = movil ? [390, 844] : [1366, 900];
  await nav.tamano(ancho, alto);   // ancho fijo de teléfono: mide desbordes reales
  await new Promise((ok) => setTimeout(ok, 300));
  // 1) Primero se mide el desborde horizontal; 2) después se captura.
  const desborda = movil ? await nav.desbordaHorizontal() : false;
  await nav.captura(path.join(CAPTURAS, `${nombre}${movil ? '-celular' : ''}.png`), ancho, alto, movil ? 1700 : 6000);
  if (movil) await nav.tamano(1366, 900);
  assert.equal(desborda, false, `La pantalla ${nombre} no debe desplazarse horizontalmente en celular`);
}
const ir = (hash) => nav.evaluar(`location.hash = ${JSON.stringify(hash)}`);

// ---------------------------------------------------------------- Secretaria
test('Ingreso incorrecto muestra un mensaje claro', async () => {
  await nav.ir(srv.base);
  await nav.esperarTexto('Usuario o cédula');
  await capturar('01-ingreso');
  await capturar('01-ingreso', { movil: true });
  await nav.escribir('input[name=usuario]', 'secretaria');
  await nav.escribir('input[name=clave]', 'Equivocada123');
  await nav.enviarFormulario('form');
  await nav.esperarTexto('Usuario o contraseña incorrectos.');
});

test('Ingreso de la secretaria y panel con cifras calculadas', async () => {
  await nav.escribir('input[name=clave]', 'CamDemo2026!');
  await nav.enviarFormulario('form');
  await nav.esperarTexto('Propietarios registrados');
  const t = await nav.textoVisible();
  assert.match(t, /Total verificado\s*\$\s?36\.000\.000/);
  assert.match(t, /Saldo por cobrar\s*\$\s?126\.000\.000/);
  assert.match(t, /Semanas con titular actual\s*9 de 52/);
  await nav.esperarQue('document.querySelectorAll(".grafico .columna").length === 12', 'gráfico de 12 meses');
  await capturar('02-panel');
  await capturar('02-panel', { movil: true });
  await nav.modo('light');
  await capturar('02-panel-claro');
  await capturar('02-panel-claro', { movil: true });
  await nav.modo('dark');
});

test('Propietarios: registro con contraseña temporal y rechazo de cédula duplicada', async () => {
  await ir('#/propietarios');
  await nav.esperarTexto('DEMO Ana María Pérez Rojas');
  await capturar('03-propietarios', { movil: true });
  await nav.clic('Registrar propietario');
  await nav.escribir('#dialogo input[name=cedula]', '900000101');
  await nav.escribir('#dialogo input[name=nombre_completo]', 'PRUEBA Duplicado');
  await nav.escribir('#dialogo input[name=correo]', 'prueba.dup@ejemplo.test');
  await nav.enviarFormulario('#dialogo form');
  await nav.esperarTexto('Ya existe un propietario con esa cédula.');
  await nav.escribir('#dialogo input[name=cedula]', '900000601');
  await nav.escribir('#dialogo input[name=nombre_completo]', 'PRUEBA Navegador');
  await nav.escribir('#dialogo input[name=correo]', 'prueba.navegador@ejemplo.test');
  datos.claveTemporal = await nav.evaluar('document.querySelector("#dialogo input[name=clave_temporal]").value');
  await nav.enviarFormulario('#dialogo form');
  await nav.esperarTexto('Ya la anoté');
  assert.ok((await nav.textoVisible()).includes(datos.claveTemporal));
  await nav.clic('Ya la anoté');
  await nav.esperarQue('location.hash.startsWith("#/propietarios/") && document.body.innerText.includes("Semanas adquiridas (0)")', 'ficha del propietario');
});

test('Asignar semana en dos pasos (resumen y confirmación)', async () => {
  await nav.clic('Asignar semana');
  await nav.elegir('#dialogo select[name=semana_id]', 'Semana 3');
  await nav.enviarFormulario('#dialogo form');
  await nav.esperarTexto('¿Confirma la asignación?');
  await nav.enviarFormulario('#dialogo form');
  await nav.esperarTexto('Semanas adquiridas (1)');
  assert.equal(consultaDirecta("SELECT count(*) FROM cam.adquisicion a JOIN cam.propietario p ON p.id = a.propietario_id WHERE p.cedula = '900000601'"), '1');
});

test('Pagos: importe incorrecto rechazado; registrar, verificar y emitir comprobante', async () => {
  await ir('#/pagos');
  await nav.escribir('input[type=search]', '900000601');
  await nav.esperarTexto('Registrar un pago');
  await nav.escribir('input[name=valor]', '700000');
  await nav.enviarFormulario('form:has(select[name=numero_cuota])');
  await nav.clic('Registrar', '#dialogo');
  await nav.esperarTexto('El valor debe ser el de la cuota completa: $750.000.');

  await nav.escribir('input[name=valor]', '750000');
  await nav.escribir('input[name=referencia]', 'PRUEBA-NAV-1');
  await nav.enviarFormulario('form:has(select[name=numero_cuota])');
  await nav.esperarTexto('El pago quedará "sin verificar"');
  await nav.clic('Registrar', '#dialogo');
  await nav.esperarTexto('Pago de la cuota 1 registrado');
  await nav.esperarQue('document.querySelector(".cuota.POR_VERIFICAR")', 'cuota 1 por verificar en la cuadrícula');

  await nav.clic('Verificar');
  await nav.clic('Sí, el dinero fue recibido', '#dialogo');
  await nav.esperarTexto('Pago verificado.');
  await nav.esperarQue('document.querySelector(".cuota.PAGADA")', 'cuota 1 pagada en la cuadrícula');

  await nav.clic('Emitir comprobante');
  await nav.clic('Emitir comprobante', '#dialogo');
  await nav.esperarQue('/Comprobante CP-\\d{6} emitido/.test(document.body.innerText)', 'aviso de comprobante emitido');
  datos.comprobante = (await nav.textoVisible()).match(/CP-\d{6}/)[0];
  await capturar('04-pagos');
  await capturar('04-pagos', { movil: true });
  const fila = consultaDirecta("SELECT p.estado || '|' || p.registrado_por || '|' || (c.numero IS NOT NULL) FROM cam.pago p LEFT JOIN cam.comprobante c ON c.pago_id = p.id WHERE p.referencia = 'PRUEBA-NAV-1'");
  assert.equal(fila, `VERIFICADO|${consultaDirecta("SELECT id FROM cam.usuario WHERE login = 'secretaria'")}|true`);
});

test('Comprobante: PDF disponible y listado', async () => {
  await ir('#/comprobantes');
  await nav.esperarTexto(datos.comprobante);
  const tipo = await nav.evaluar(`(async () => { const id = ${consultaDirecta(`SELECT id FROM cam.comprobante WHERE numero = '${datos.comprobante}'`)};
    const r = await fetch('/api/comprobantes/' + id + '/pdf'); return r.headers.get('content-type'); })()`);
  assert.equal(tipo, 'application/pdf');
  await capturar('05-comprobantes', { movil: true });
});

test('Comprobante: registrar la entrega por WhatsApp (D11)', async () => {
  await nav.escribir('input[type=search]', datos.comprobante);
  await nav.esperarTexto('1 comprobante(s)');
  await nav.clic('Marcar entregado');
  await nav.esperarTexto(`Registrar entrega de ${datos.comprobante}`);
  await nav.elegir('#dialogo select[name=medio]', 'WhatsApp');
  await nav.escribir('#dialogo input[name=observacion]', 'PRUEBA-NAV enviado al celular');
  await nav.clic('Registrar entrega', '#dialogo');
  await nav.esperarTexto(`Entrega de ${datos.comprobante} registrada.`);
  await nav.esperarTexto('Enviado por WhatsApp');
  await capturar('15-comprobante-entregado');
  await capturar('15-comprobante-entregado', { movil: true });
  assert.equal(consultaDirecta(`SELECT e.medio || '|' || e.observacion FROM cam.envio_comprobante e JOIN cam.comprobante c ON c.id = e.comprobante_id WHERE c.numero = '${datos.comprobante}'`),
    'WHATSAPP|PRUEBA-NAV enviado al celular');
});

test('Estado de cuenta (DEMO Ana, semana 5): $7.500.000 abonados, 14 pendientes, saldo $10.500.000', async () => {
  await ir('#/estado-cuenta');
  await nav.escribir('input[type=search]', '900000101');
  await nav.elegir('select[name=adquisicion_id]', 'Semana 5 ·');
  await nav.esperarTexto('Total abonado');
  const t = await nav.textoVisible();
  assert.match(t, /Total abonado\s*\$\s?7\.500\.000/);
  assert.match(t, /Cuotas pendientes\s*14/);
  assert.match(t, /Saldo\s*\$\s?10\.500\.000/);
  await capturar('06-estado-cuenta');
  await nav.modo('light');
  await capturar('06-estado-cuenta-claro', { movil: true });
  await nav.modo('dark');
});

test('Reportes: consultar y exportar a Excel con los mismos filtros', async () => {
  await ir('#/reportes/recaudo');
  await nav.esperarQue('document.querySelector(".tarjeta table") && ![...document.querySelectorAll("button")].find((b) => b.textContent === "Exportar a Excel").disabled', 'tabla de recaudo');
  await nav.clic('Exportar a Excel');
  await nav.esperarQue('/Excel descargado con \\d+ fila/.test(document.body.innerText)', 'aviso de Excel descargado');
  await nav.clic('Sin pago en el mes');
  await nav.esperarTexto('NO significa que tengan una cuota vencida');
  await capturar('07-reportes', { movil: true });
});

test('Semanas: fechas inválidas rechazadas y fechas válidas guardadas', async () => {
  await ir('#/semanas');
  await nav.escribir('input[name=anio]', '2029');
  await nav.esperarTexto('sin fechas registradas para 2029');
  await nav.clic('Registrar fechas');
  await nav.escribir('#dialogo input[name=fecha_entrada]', '2029-01-13');
  await nav.escribir('#dialogo input[name=fecha_salida]', '2029-01-06');
  await nav.enviarFormulario('#dialogo form');
  await nav.esperarTexto('La fecha de salida debe ser posterior a la fecha de entrada.');
  await nav.escribir('#dialogo input[name=fecha_salida]', '2029-01-13');
  await nav.escribir('#dialogo input[name=fecha_entrada]', '2029-01-06');
  await nav.enviarFormulario('#dialogo form');
  await nav.esperarTexto('Fechas de la semana 1 guardadas.');
  await capturar('08-semanas', { movil: true });
});

test('Parámetros y supervisión de la comunidad cargan', async () => {
  await ir('#/parametros');
  await nav.esperarTexto('Valor de la acción vigente');
  await nav.esperarTexto('✔ 24 ×');
  await ir('#/comunidad');
  await nav.esperarTexto('Supervisión de ofertas');
  await capturar('09-parametros-comunidad-sec', { movil: true });
});

test('Cambio de titular en dos pasos: el nuevo titular asume el saldo (semana 12, pagada)', async () => {
  await ir('#/adquisiciones');
  await nav.esperarTexto('Titulares actuales');
  // Botón "Cambiar titular" de la fila de la semana 12.
  await nav.esperarQue(`[...document.querySelectorAll('tr')].some((tr) => tr.textContent.includes('Semana 12') && tr.querySelector('button'))`, 'fila de la semana 12');
  await nav.evaluar(`[...document.querySelectorAll('tr')].find((tr) => tr.textContent.includes('Semana 12')).querySelector('button').click()`);
  await nav.esperarTexto('El nuevo titular asume el saldo');
  await nav.elegir('#dialogo select[name=nuevo_propietario_id]', 'PRUEBA Navegador');
  await nav.elegir('#dialogo select[name=tipo]', 'Venta');
  await nav.escribir('#dialogo input[name=soporte]', 'PRUEBA contrato navegador');
  await nav.enviarFormulario('#dialogo form');
  await nav.esperarTexto('¿Confirma el cambio de titular?');
  await capturar('12-cambio-titular');
  await capturar('12-cambio-titular', { movil: true });
  await nav.clic('Confirmar cambio de titular', '#dialogo');
  await nav.esperarTexto('el nuevo titular es PRUEBA Navegador');
  assert.equal(consultaDirecta(`SELECT p.nombre_completo || '|' || a.origen FROM cam.adquisicion a JOIN cam.propietario p ON p.id = a.propietario_id
    JOIN cam.semana s ON s.id = a.semana_id WHERE s.numero = 12 AND a.estado_titularidad = 'VIGENTE'`), 'PRUEBA Navegador|VENTA');

  const nueva = consultaDirecta(`SELECT a.id FROM cam.adquisicion a JOIN cam.semana s ON s.id = a.semana_id WHERE s.numero = 12 AND a.estado_titularidad = 'VIGENTE'`);
  await ir(`#/estado-cuenta/${nueva}`);
  await nav.esperarTexto('Titulares de la semana 12');
  await nav.esperarTexto('Pagos de titulares anteriores');
  const t = await nav.textoVisible();
  assert.match(t, /24 cuota\(s\) \(\$\s?18\.000\.000\) las pagaron titulares anteriores/);
  assert.match(t, /Pagada \(tit\. anterior\)/);
  await capturar('13-estado-cuenta-transferida');
  await capturar('13-estado-cuenta-transferida', { movil: true });
});

test('Auditoría: muestra el cambio de titular con quién, cuándo y el soporte', async () => {
  await ir('#/auditoria');
  await nav.esperarTexto('Registro de quién hizo cada operación');
  await nav.elegir('select[name=accion]', 'Cambio de titular');
  await nav.esperarTexto('Soporte: PRUEBA contrato navegador');
  const t = await nav.textoVisible();
  assert.match(t, /1 registro\(s\)/);
  assert.match(t, /a PRUEBA Navegador por venta/);
  await capturar('14-auditoria');
  await capturar('14-auditoria', { movil: true });
});

test('Cerrar sesión', async () => {
  await nav.clic('Cerrar sesión');
  await nav.esperarTexto('Sesión cerrada correctamente.');
  const r = await nav.evaluar('fetch("/api/panel").then((r) => r.status)');
  assert.equal(r, 401);
});

// ---------------------------------------------------------------- Propietario
test('Propietario: solo ve la comunidad; las rutas administrativas lo devuelven a ella', async () => {
  await nav.escribir('input[name=usuario]', CEDULAS.ana);
  await nav.escribir('input[name=clave]', CLAVE_DEMO);
  await nav.enviarFormulario('form');
  await nav.esperarTexto('Comunidad de propietarios');
  const menu = await nav.evaluar('[...document.querySelectorAll(".menu a")].map((a) => a.textContent)');
  assert.deepEqual(menu, ['Comunidad', 'Cambiar contraseña']);
  await ir('#/pagos');
  await nav.esperarQue('location.hash === "#/comunidad"', 'redirección a comunidad');
  const pagos = await nav.evaluar('fetch("/api/pagos").then((r) => r.status)');
  assert.equal(pagos, 403);
});

test('Propietario: publica una venta (precio 0 rechazado), conversa y la retira', async () => {
  await nav.clic('Publicar oferta');
  await nav.esperarQue('document.querySelector("#dialogo input[value=VENTA]")', 'formulario de oferta');
  await nav.evaluar('document.querySelector("#dialogo input[value=VENTA]").click()');
  await nav.escribir('#dialogo input[name=precio]', '0');
  await nav.escribir('#dialogo textarea[name=descripcion]', 'PRUEBA: vendo la semana 5 desde el navegador');
  await nav.enviarFormulario('#dialogo form');
  await nav.esperarTexto('mayor que cero');
  await nav.escribir('#dialogo input[name=precio]', '21000000');
  await nav.enviarFormulario('#dialogo form');
  await nav.esperarTexto('Oferta publicada.');
  await nav.modo('light');
  await capturar('10-comunidad-propietario-claro');
  await capturar('10-comunidad-propietario-claro', { movil: true });
  await nav.modo('dark');

  await nav.clic('Ver conversación (0)');
  await nav.esperarTexto('Aún no hay mensajes.');
  await nav.escribir('textarea[name=texto]', 'PRUEBA: mensaje desde el navegador');
  await nav.enviarFormulario('form:has(textarea[name=texto])');
  await nav.esperarTexto('PRUEBA: mensaje desde el navegador');
  await capturar('11-conversacion', { movil: true });
  await nav.clic('Retirar');
  await nav.clic('Retirar oferta', '#dialogo');
  await nav.esperarQue('location.hash === "#/comunidad"', 'volver a la comunidad');
  assert.equal(consultaDirecta("SELECT estado FROM cam.oferta WHERE descripcion LIKE 'PRUEBA: vendo la semana 5%'"), 'RETIRADA');
  assert.equal(consultaDirecta(`SELECT a.estado_titularidad || '|' || p.cedula FROM cam.adquisicion a JOIN cam.propietario p ON p.id = a.propietario_id JOIN cam.semana s ON s.id = a.semana_id WHERE s.numero = 5`), `VIGENTE|${CEDULAS.ana}`);
  await nav.clic('Cerrar sesión');
  await nav.esperarTexto('Sesión cerrada correctamente.');
});

test('Propietario nuevo: la contraseña temporal obliga a cambiarla', async () => {
  await nav.escribir('input[name=usuario]', '900000601');
  await nav.escribir('input[name=clave]', datos.claveTemporal);
  await nav.enviarFormulario('form');
  await nav.esperarTexto('Por seguridad, cambie la contraseña temporal');
  await nav.escribir('input[name=actual]', datos.claveTemporal);
  await nav.escribir('input[name=nueva]', 'MiClaveNueva2026');
  await nav.escribir('input[name=repetir]', 'OtraDistinta2026');
  await nav.enviarFormulario('form');
  await nav.esperarTexto('Las dos contraseñas nuevas no coinciden.');
  await nav.escribir('input[name=repetir]', 'MiClaveNueva2026');
  await nav.enviarFormulario('form');
  await nav.esperarTexto('Comunidad de propietarios');
});

test('Sin errores de JavaScript ni violaciones de seguridad en la consola', () => {
  assert.deepEqual(erroresReales(), []);
});
