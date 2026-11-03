// Construcción de la aplicación Express: seguridad, sesiones, rutas y archivos de la interfaz.
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const config = require('./config');
const bd = require('./db');
const { manejadorErrores, ErrorApp } = require('./errores');
const { exigirRol, mismoOrigen } = require('./seguridad');

const { router: auth } = require('./rutas/auth');
const propietarios = require('./rutas/propietarios');
const semanas = require('./rutas/semanas');
const adquisiciones = require('./rutas/adquisiciones');
const { pagos, comprobantes } = require('./rutas/pagos');
const { panel, reportes, parametros } = require('./rutas/panel_reportes');
const comunidad = require('./rutas/comunidad');

function crearApp() {
  const app = express();
  app.disable('x-powered-by');
  // En Render la aplicación está detrás de un proxy HTTPS.
  if (config.produccion) app.set('trust proxy', 1);

  // Cabeceras de seguridad (bloquean scripts externos, incrustación en otros sitios, etc.).
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        frameSrc: ["'self'"],
        objectSrc: ["'self'"],
        frameAncestors: ["'self'"],
        formAction: ["'self'"],
      },
    },
  }));

  // Registro sencillo de solicitudes: método, ruta, estado y duración. Nunca cuerpos ni contraseñas.
  app.use((req, res, next) => {
    const inicio = Date.now();
    res.on('finish', () => {
      if (req.path.startsWith('/api/')) {
        console.log(`[http] ${req.method} ${req.path} ${res.statusCode} ${Date.now() - inicio}ms`);
      }
    });
    next();
  });

  app.use(express.json({ limit: '100kb' }));

  // Sesiones guardadas en PostgreSQL (tabla cam.sesion): sobreviven a reinicios del servidor.
  app.use(session({
    name: 'cam.sid',
    store: new PgSession({ pool: bd.pool, schemaName: 'cam', tableName: 'sesion', createTableIfMissing: false }),
    secret: config.secretoSesion,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,             // el JavaScript de la página no puede leer la cookie
      sameSite: 'lax',            // no se envía en solicitudes de otros sitios
      secure: config.produccion,  // solo por HTTPS en producción
      maxAge: config.horasSesion * 60 * 60 * 1000,
    },
  }));

  // ---------------- API ----------------
  const api = express.Router();
  api.use(mismoOrigen);
  api.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  api.get('/salud', async (req, res) => {
    await bd.consulta('SELECT 1');
    res.json({ ok: true, baseDatos: 'conectada' });
  });

  api.use('/auth', auth);

  const secretaria = exigirRol('SECRETARIA');
  const ambos = exigirRol('SECRETARIA', 'PROPIETARIO');
  api.use('/panel', secretaria, panel);
  api.use('/propietarios', secretaria, propietarios);
  api.use('/semanas', secretaria, semanas);
  api.use('/adquisiciones', secretaria, adquisiciones);
  api.use('/pagos', secretaria, pagos);
  api.use('/comprobantes', secretaria, comprobantes);
  api.use('/reportes', secretaria, reportes);
  api.use('/parametros', secretaria, parametros);
  api.use('/ofertas', ambos, comunidad);

  api.use((req, res, next) => next(new ErrorApp(404, 'La ruta solicitada no existe.')));
  app.use('/api', api);

  // ---------------- Interfaz (archivos estáticos) ----------------
  app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

  app.use(manejadorErrores);
  return app;
}

module.exports = { crearApp };
