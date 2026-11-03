// Pruebas de inicio de sesión, permisos por rol y protección de sesiones.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { reconstruirBaseDePruebas, consultaDirecta, iniciarServidor, detenerServidor, Cliente,
  SECRETARIA, CLAVE_DEMO, CEDULAS } = require('./ayuda');

let srv;
before(async () => { reconstruirBaseDePruebas(); srv = await iniciarServidor(); });
after(async () => { await detenerServidor(srv); });
const nuevo = () => new Cliente(srv.base);

test('Salud: el servidor responde y la base está conectada', async () => {
  const r = await nuevo().get('/api/salud');
  assert.equal(r.estado, 200);
  assert.equal(r.datos.baseDatos, 'conectada');
});

test('Sin sesión, las páginas privadas responden 401', async () => {
  for (const ruta of ['/api/panel', '/api/pagos', '/api/propietarios', '/api/ofertas', '/api/reportes/saldos']) {
    const r = await nuevo().get(ruta);
    assert.equal(r.estado, 401, ruta);
  }
});

test('Acceso incorrecto: mismo mensaje para clave errada y usuario inexistente', async () => {
  const a = await nuevo().post('/api/auth/login', { usuario: 'secretaria', clave: 'Equivocada1' });
  const b = await nuevo().post('/api/auth/login', { usuario: 'no.existe', clave: 'Equivocada1' });
  const c = await nuevo().post('/api/auth/login', { usuario: '123456789', clave: 'Equivocada1' });
  assert.equal(a.estado, 401);
  assert.equal(b.estado, 401);
  assert.equal(c.estado, 401);
  assert.equal(a.datos.error, 'Usuario o contraseña incorrectos.');
  assert.equal(b.datos.error, a.datos.error);
  assert.equal(c.datos.error, a.datos.error);
});

test('Acceso correcto de la secretaria: entra al panel con cifras calculadas', async () => {
  const cli = nuevo();
  const u = await cli.entrar(...SECRETARIA);
  assert.equal(u.rol, 'SECRETARIA');
  const r = await cli.get('/api/panel');
  assert.equal(r.estado, 200);
  assert.equal(r.datos.indicadores.semanas_con_titular, 9);
  assert.equal(r.datos.indicadores.total_verificado, 36000000);
  assert.equal(r.datos.recaudo.length, 12);
});

test('Propietario entra con cédula + contraseña y NO accede a opciones administrativas (403)', async () => {
  const cli = nuevo();
  const u = await cli.entrar(CEDULAS.ana, CLAVE_DEMO);
  assert.equal(u.rol, 'PROPIETARIO');
  for (const [m, ruta] of [['GET', '/api/panel'], ['GET', '/api/pagos'], ['GET', '/api/propietarios'],
    ['GET', '/api/comprobantes'], ['GET', '/api/reportes/saldos'], ['GET', '/api/parametros'],
    ['POST', '/api/pagos'], ['GET', '/api/adquisiciones']]) {
    const r = await cli.pedir(m, ruta, m === 'POST' ? {} : undefined);
    assert.equal(r.estado, 403, `${m} ${ruta}`);
  }
  const ofertas = await cli.get('/api/ofertas');
  assert.equal(ofertas.estado, 200);
});

test('La cédula sola no basta: cédula con clave vacía o incorrecta es rechazada', async () => {
  assert.equal((await nuevo().post('/api/auth/login', { usuario: CEDULAS.ana, clave: '' })).estado, 400);
  assert.equal((await nuevo().post('/api/auth/login', { usuario: CEDULAS.ana, clave: 'x' })).estado, 401);
});

test('Propietario inactivo no puede entrar (mensaje genérico)', async () => {
  const r = await nuevo().post('/api/auth/login', { usuario: CEDULAS.ivan, clave: CLAVE_DEMO });
  assert.equal(r.estado, 401);
  assert.equal(r.datos.error, 'Usuario o contraseña incorrectos.');
});

test('Bloqueo temporal tras 5 intentos fallidos, incluso con la clave correcta después', async () => {
  for (let i = 0; i < 5; i += 1) {
    const r = await nuevo().post('/api/auth/login', { usuario: CEDULAS.helena, clave: 'Incorrecta9' });
    assert.equal(r.estado, 401);
  }
  const r = await nuevo().post('/api/auth/login', { usuario: CEDULAS.helena, clave: CLAVE_DEMO });
  assert.equal(r.estado, 429);
});

test('Cierre de sesión efectivo: la cookie anterior deja de servir', async () => {
  const cli = nuevo();
  await cli.entrar(...SECRETARIA);
  const cookieVieja = cli.cookie;
  assert.equal((await cli.post('/api/auth/logout')).estado, 200);
  assert.equal((await cli.get('/api/panel')).estado, 401);
  const intruso = nuevo();
  intruso.cookie = cookieVieja;
  assert.equal((await intruso.get('/api/panel')).estado, 401);
});

test('Contraseña temporal: debe cambiarse antes de usar la aplicación', async () => {
  const sec = nuevo();
  await sec.entrar(...SECRETARIA);
  const creado = await sec.post('/api/propietarios', {
    cedula: '900000301', nombre_completo: 'PRUEBA Temporal', correo: 'prueba.temporal@ejemplo.test',
    clave_temporal: 'Temporal2026',
  });
  assert.equal(creado.estado, 201);

  const p = nuevo();
  const u = await p.entrar('900000301', 'Temporal2026');
  assert.equal(u.debeCambiarClave, true);
  assert.equal((await p.get('/api/ofertas')).estado, 403);
  assert.equal((await p.post('/api/auth/cambiar-clave', { actual: 'Temporal2026', nueva: 'corta' })).estado, 400);
  assert.equal((await p.post('/api/auth/cambiar-clave', { actual: 'Mala12345', nueva: 'NuevaClave2026' })).estado, 400);
  assert.equal((await p.post('/api/auth/cambiar-clave', { actual: 'Temporal2026', nueva: 'NuevaClave2026' })).estado, 200);
  assert.equal((await p.get('/api/ofertas')).estado, 200);
  assert.equal((await nuevo().post('/api/auth/login', { usuario: '900000301', clave: 'Temporal2026' })).estado, 401);
  await nuevo().entrar('900000301', 'NuevaClave2026');
});

test('Las contraseñas se guardan solo como hash bcrypt', () => {
  const r = consultaDirecta("SELECT count(*) FROM cam.usuario WHERE password_hash !~ '^\\$2[aby]\\$'");
  assert.equal(r, '0');
  const visible = consultaDirecta("SELECT count(*) FROM cam.usuario WHERE password_hash LIKE '%Temporal2026%' OR password_hash LIKE '%NuevaClave2026%'");
  assert.equal(visible, '0');
});

test('Protección CSRF: se rechazan solicitudes desde otro sitio o con formato de formulario', async () => {
  const cli = nuevo();
  await cli.entrar(...SECRETARIA);
  const otroSitio = await cli.pedir('POST', '/api/pagos/1/verificar', {}, { Origin: 'https://sitio-malicioso.example' });
  assert.equal(otroSitio.estado, 403);
  const formulario = await cli.pedir('POST', '/api/parametros', 'valor_accion=1', { 'Content-Type': 'application/x-www-form-urlencoded' });
  assert.equal(formulario.estado, 415);
});

test('La cookie de sesión es HttpOnly y SameSite', async () => {
  const r = await fetch(`${srv.base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: SECRETARIA[0], clave: SECRETARIA[1] }),
  });
  const c = r.headers.getSetCookie().find((x) => x.startsWith('cam.sid='));
  assert.match(c, /HttpOnly/i);
  assert.match(c, /SameSite=Lax/i);
});

test('Errores inesperados no exponen SQL; rutas inexistentes dan 404', async () => {
  const cli = nuevo();
  await cli.entrar(...SECRETARIA);
  const r = await cli.get('/api/no-existe');
  assert.equal(r.estado, 404);
  const malId = await cli.get('/api/propietarios/abc');
  assert.equal(malId.estado, 400);
  assert.doesNotMatch(JSON.stringify(malId.datos), /select|from|cam\./i);
});
