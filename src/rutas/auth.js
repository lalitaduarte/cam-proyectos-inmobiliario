// Inicio y cierre de sesión, consulta de la sesión y cambio de contraseña.
const express = require('express');
const bcrypt = require('bcryptjs');
const bd = require('../db');
const config = require('../config');
const v = require('../validar');
const { ErrorApp } = require('../errores');

const router = express.Router();
const COSTO_HASH = 10;
// Hash de relleno: si el usuario no existe se compara igual, para que el
// tiempo de respuesta no revele qué cuentas existen.
const HASH_RELLENO = bcrypt.hashSync('relleno-no-es-una-clave-real', COSTO_HASH);
const credencialesIncorrectas = () => new ErrorApp(401, 'Usuario o contraseña incorrectos.');

const regenerar = (req) => new Promise((ok, falla) => req.session.regenerate((e) => (e ? falla(e) : ok())));
const guardar = (req) => new Promise((ok, falla) => req.session.save((e) => (e ? falla(e) : ok())));

function datosSesion(u) {
  return {
    id: u.id,
    rol: u.rol,
    nombre: u.nombre_mostrar,
    propietarioId: u.propietario_id,
    debeCambiarClave: u.debe_cambiar_clave,
  };
}

// POST /api/auth/login  { usuario, clave }
// "usuario" es el login de la secretaria o la cédula del propietario.
router.post('/login', async (req, res) => {
  const identificador = v.texto(req.body?.usuario, 'usuario o cédula', { max: 40 }).toLowerCase();
  const clave = typeof req.body?.clave === 'string' ? req.body.clave : '';
  if (!clave) throw new ErrorApp(400, 'Escriba su contraseña.');

  const u = /^\d+$/.test(identificador)
    ? await bd.fila(
        `SELECT u.*, p.nombre_completo AS nombre_mostrar, p.activo AS ficha_activa
           FROM usuario u JOIN propietario p ON p.id = u.propietario_id
          WHERE u.rol = 'PROPIETARIO' AND p.cedula = $1`, [identificador])
    : await bd.fila(
        `SELECT u.*, u.nombre AS nombre_mostrar, true AS ficha_activa
           FROM usuario u WHERE u.rol = 'SECRETARIA' AND u.login = $1`, [identificador]);

  if (!u) {
    await bcrypt.compare(clave, HASH_RELLENO);
    throw credencialesIncorrectas();
  }
  if (u.bloqueado_hasta && new Date(u.bloqueado_hasta) > new Date()) {
    throw new ErrorApp(429, 'Por seguridad, el acceso está bloqueado temporalmente. Intente de nuevo en unos minutos.');
  }
  const correcta = await bcrypt.compare(clave, u.password_hash);
  if (!correcta) {
    await bd.consulta(
      `UPDATE usuario
          SET intentos_fallidos = CASE WHEN intentos_fallidos + 1 >= $2 THEN 0 ELSE intentos_fallidos + 1 END,
              bloqueado_hasta   = CASE WHEN intentos_fallidos + 1 >= $2 THEN now() + make_interval(mins => $3) ELSE NULL END
        WHERE id = $1`, [u.id, config.maxIntentos, config.minutosBloqueo]);
    throw credencialesIncorrectas();
  }
  // Cuenta o ficha desactivada: el mismo mensaje, sin revelar el motivo.
  if (!u.activo || !u.ficha_activa) throw credencialesIncorrectas();

  await bd.consulta(
    'UPDATE usuario SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_acceso = now() WHERE id = $1', [u.id]);
  await bd.consulta(
    `INSERT INTO auditoria (usuario_id, accion, tabla, registro_id) VALUES ($1, 'INICIAR_SESION', 'usuario', $1)`, [u.id]);

  // Nueva sesión (evita reutilizar un identificador de sesión anterior).
  await regenerar(req);
  req.session.usuario = datosSesion(u);
  await guardar(req);
  res.json({ usuario: req.session.usuario });
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  await new Promise((ok) => req.session.destroy(() => ok()));
  res.clearCookie('cam.sid');
  res.json({ ok: true });
});

// GET /api/auth/sesion  -> datos de la sesión actual (o 401)
router.get('/sesion', (req, res) => {
  if (!req.session.usuario) throw new ErrorApp(401, 'No hay una sesión iniciada.');
  res.json({ usuario: req.session.usuario });
});

// POST /api/auth/cambiar-clave { actual, nueva }
router.post('/cambiar-clave', async (req, res) => {
  if (!req.session.usuario) throw new ErrorApp(401, 'Debe iniciar sesión.');
  const actual = typeof req.body?.actual === 'string' ? req.body.actual : '';
  const nueva = v.clave(req.body?.nueva, 'nueva contraseña');
  if (actual === nueva) throw new ErrorApp(400, 'La nueva contraseña debe ser diferente de la actual.');

  const u = await bd.fila('SELECT id, password_hash FROM usuario WHERE id = $1 AND activo', [req.session.usuario.id]);
  if (!u || !(await bcrypt.compare(actual, u.password_hash))) {
    throw new ErrorApp(400, 'La contraseña actual no es correcta.');
  }
  const hash = await bcrypt.hash(nueva, COSTO_HASH);
  await bd.consulta('UPDATE usuario SET password_hash = $2, debe_cambiar_clave = false WHERE id = $1', [u.id, hash]);
  await bd.consulta(
    `INSERT INTO auditoria (usuario_id, accion, tabla, registro_id) VALUES ($1, 'CAMBIAR_CLAVE', 'usuario', $1)`, [u.id]);
  req.session.usuario.debeCambiarClave = false;
  await guardar(req);
  res.json({ ok: true });
});

module.exports = { router, COSTO_HASH };
