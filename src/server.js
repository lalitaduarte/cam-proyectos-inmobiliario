// Punto de entrada: inicia el servidor web de CAM.
//   npm.cmd start      (PowerShell)
const config = require('./config');
const bd = require('./db');
const { crearApp } = require('./app');

async function iniciar() {
  // Comprueba la base antes de aceptar visitas.
  const r = await bd.verificarEntorno();
  const app = crearApp();
  const servidor = app.listen(config.puerto, () => {
    console.log(`[cam] Base de datos: ${r.base} (usuario ${r.usuario})`);
    console.log(`[cam] Aplicación lista en http://localhost:${config.puerto}`);
  });

  const cerrar = () => {
    console.log('[cam] Cerrando...');
    servidor.close(() => bd.pool.end().then(() => process.exit(0)));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGINT', cerrar);
  process.on('SIGTERM', cerrar);
}

iniciar().catch((err) => {
  console.error('[cam] No se pudo iniciar:', err.code || '', err.message);
  process.exit(1);
});
