// Persistencia: los datos y la sesión sobreviven a reiniciar el servidor,
// porque se guardan en PostgreSQL (no en memoria ni en el navegador).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { reconstruirBaseDePruebas, iniciarServidor, detenerServidor, Cliente, SECRETARIA } = require('./ayuda');

let srv;
before(() => { reconstruirBaseDePruebas(); });
after(async () => { await detenerServidor(srv); });

test('Datos y sesión se conservan después de reiniciar el servidor', async () => {
  srv = await iniciarServidor();
  const cli = new Cliente(srv.base);
  await cli.entrar(...SECRETARIA);
  const creado = await cli.post('/api/propietarios', {
    cedula: '900000501', nombre_completo: 'PRUEBA Persistencia', correo: 'prueba.persistencia@ejemplo.test',
    clave_temporal: 'Temporal2026',
  });
  assert.equal(creado.estado, 201);

  // Se detiene el servidor por completo y se inicia un proceso nuevo.
  await detenerServidor(srv);
  srv = await iniciarServidor();
  const mismoNavegador = new Cliente(srv.base);
  mismoNavegador.cookie = cli.cookie;   // la misma cookie que tenía el navegador

  const r = await mismoNavegador.get('/api/propietarios?q=900000501');
  assert.equal(r.estado, 200, 'la sesión debe seguir activa tras el reinicio');
  assert.equal(r.datos.length, 1);
  assert.equal(r.datos[0].nombre_completo, 'PRUEBA Persistencia');

  // Otro "dispositivo" (sin cookie) que inicia sesión también ve el dato.
  const otro = new Cliente(srv.base);
  await otro.entrar(...SECRETARIA);
  assert.equal((await otro.get('/api/propietarios?q=900000501')).datos.length, 1);
});
