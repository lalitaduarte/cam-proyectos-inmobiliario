// Manejo de errores: traduce errores de la base de datos a mensajes claros
// y códigos HTTP, sin mostrar detalles internos (SQL, tablas) al usuario.

class ErrorApp extends Error {
  constructor(estado, mensaje) {
    super(mensaje);
    this.estado = estado;
  }
}

// Códigos propios definidos en sql/04_funciones.sql
const CODIGOS_CAM = { CA400: 400, CA403: 403, CA404: 404, CA409: 409 };

// Mensajes para las restricciones de la base (por nombre de restricción).
const RESTRICCIONES = {
  propietario_cedula_uq: [409, 'Ya existe un propietario con esa cédula.'],
  propietario_correo_uq: [409, 'Ya existe un propietario con ese correo electrónico.'],
  propietario_cedula_formato: [400, 'La cédula debe tener entre 5 y 12 dígitos, sin puntos ni letras.'],
  propietario_correo_formato: [400, 'El correo electrónico no es válido.'],
  propietario_telefono_formato: [400, 'El teléfono solo puede tener dígitos, espacios y el signo +.'],
  propietario_nombre_minimo: [400, 'El nombre debe tener al menos 3 caracteres.'],
  semana_numero_uq: [409, 'Ya existe una semana con ese número.'],
  semana_numero_rango: [400, 'El número de semana debe estar entre 1 y 52.'],
  semana_fecha_salida_mayor: [400, 'La fecha de salida debe ser posterior a la fecha de entrada.'],
  semana_fecha_una_por_anio: [409, 'Esa semana ya tiene fechas registradas para ese año.'],
  semana_fecha_sin_traslape: [409, 'Las fechas se cruzan con las de otra semana.'],
  semana_fecha_anio_rango: [400, 'El año debe estar entre 2000 y 2100.'],
  adquisicion_titular_vigente_uq: [409, 'La semana ya tiene titular actual.'],
  pago_cuota_unica_uq: [409, 'Esa cuota ya tiene un pago registrado.'],
  comprobante_pago_uq: [409, 'Este pago ya tiene comprobante.'],
  oferta_activa_por_adquisicion_uq: [409, 'Esta semana ya tiene una oferta activa.'],
  usuario_login_uq: [409, 'Ese nombre de usuario ya existe.'],
};

function traducir(err) {
  if (err instanceof ErrorApp) return { estado: err.estado, mensaje: err.message };
  if (err && err.type === 'entity.parse.failed') return { estado: 400, mensaje: 'Los datos enviados no tienen un formato válido.' };
  if (err && CODIGOS_CAM[err.code]) return { estado: CODIGOS_CAM[err.code], mensaje: err.message };
  if (err && err.constraint && RESTRICCIONES[err.constraint]) {
    const [estado, mensaje] = RESTRICCIONES[err.constraint];
    return { estado, mensaje };
  }
  if (err && err.code === '23505') return { estado: 409, mensaje: 'El registro ya existe.' };
  if (err && err.code === '23514') return { estado: 400, mensaje: 'Algún dato no cumple las reglas.' };
  if (err && err.code === '23503') return { estado: 409, mensaje: 'El registro está relacionado con otros datos.' };
  if (err && ['22007', '22008', '22P02', '22003', '22001'].includes(err.code)) {
    return { estado: 400, mensaje: 'Algún dato tiene un formato o tamaño inválido.' };
  }
  return null;
}

// Middleware final de Express.
// eslint-disable-next-line no-unused-vars
function manejadorErrores(err, req, res, next) {
  const t = traducir(err);
  if (t) return res.status(t.estado).json({ error: t.mensaje });
  // Error inesperado: se registra el código y la ruta, nunca datos personales ni secretos.
  console.error(`[error] ${req.method} ${req.originalUrl} ->`, err && (err.code || ''), err && err.message);
  return res.status(500).json({ error: 'Ocurrió un error inesperado. Intente de nuevo.' });
}

module.exports = { ErrorApp, manejadorErrores, traducir };
