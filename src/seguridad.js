// Controles de acceso. Se aplican en el SERVIDOR a cada ruta:
// ocultar botones en la pantalla no es suficiente (FUN-SEG-03).
const { ErrorApp } = require('./errores');

// Exige una sesión iniciada.
function exigirSesion(req, res, next) {
  if (!req.session || !req.session.usuario) {
    return next(new ErrorApp(401, 'Debe iniciar sesión.'));
  }
  // Con contraseña temporal solo puede cambiarla (y consultar su sesión o salir).
  if (req.session.usuario.debeCambiarClave) {
    return next(new ErrorApp(403, 'Debe cambiar su contraseña temporal antes de continuar.'));
  }
  return next();
}

// Exige uno de los roles indicados.
function exigirRol(...roles) {
  return (req, res, next) => {
    exigirSesion(req, res, (err) => {
      if (err) return next(err);
      if (!roles.includes(req.session.usuario.rol)) {
        return next(new ErrorApp(403, 'No tiene permiso para esta opción.'));
      }
      return next();
    });
  };
}

// Protección contra solicitudes enviadas desde otros sitios (CSRF):
// las operaciones que modifican datos deben venir de la misma aplicación.
function mismoOrigen(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origen = req.get('origin');
  if (origen) {
    let host;
    try { host = new URL(origen).host; } catch { host = null; }
    if (host !== req.get('host')) return next(new ErrorApp(403, 'Solicitud no permitida.'));
  }
  // Los formularios HTML de otro sitio no pueden enviar JSON: se exige JSON.
  const tieneCuerpo = Number(req.get('content-length') || 0) > 0 || req.get('transfer-encoding');
  if (tieneCuerpo && !req.is('application/json')) {
    return next(new ErrorApp(415, 'Formato de solicitud no permitido.'));
  }
  return next();
}

// Id del usuario de la sesión: SIEMPRE lo determina el servidor (RN13).
const usuarioId = (req) => req.session.usuario.id;

module.exports = { exigirSesion, exigirRol, mismoOrigen, usuarioId };
