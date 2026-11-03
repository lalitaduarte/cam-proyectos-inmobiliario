// Configuración de CAM leída de variables de entorno (.env en local, panel de Render en producción).
// Nunca se imprimen los valores secretos.

const produccion = process.env.NODE_ENV === 'production';

function requerida(nombre) {
  const v = process.env[nombre];
  if (!v) {
    throw new Error(`Falta la variable de entorno ${nombre}. Revise el archivo .env (vea .env.example).`);
  }
  return v;
}

function configuracionBaseDatos() {
  // En publicación (Neon) se usa una sola cadena de conexión con SSL.
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: true },
    };
  }
  // En local se arma con los datos del .env, SIEMPRE con el usuario limitado cam_app.
  return {
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT || 5436),
    database: requerida('CAM_DB'),
    user: requerida('CAM_APP_USER'),
    password: requerida('CAM_APP_PASSWORD'),
  };
}

const config = {
  produccion,
  puerto: Number(process.env.PORT || 3100),
  secretoSesion: requerida('SESSION_SECRET'),
  bd: configuracionBaseDatos(),
  zonaHoraria: 'America/Bogota',
  // Bloqueo de la cuenta tras varios intentos fallidos de inicio de sesión.
  maxIntentos: 5,
  minutosBloqueo: 15,
  horasSesion: 8,
};

if (config.bd.user === 'postgres' || config.bd.user === 'cam_admin') {
  throw new Error('El backend debe conectarse con el usuario limitado de la aplicación (cam_app), no con un administrador.');
}
if (produccion && config.secretoSesion.length < 32) {
  throw new Error('SESSION_SECRET debe tener al menos 32 caracteres en producción.');
}

module.exports = config;
