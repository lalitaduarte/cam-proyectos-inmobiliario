// Cambio de contraseña (obligatorio si la contraseña es temporal).
import { enviar } from '../api.js';
import { h, limpiar, mensaje, campo, entrada, formulario, avisar } from '../ui.js';

export default {
  titulo: 'Cambiar contraseña',
  async render(main, params, sesion, ctx) {
    const nueva = entrada({ name: 'nueva', type: 'password', autocomplete: 'new-password', required: true, minlength: 8, maxlength: 72 });
    const repetir = entrada({ name: 'repetir', type: 'password', autocomplete: 'new-password', required: true, maxlength: 72 });
    const form = formulario({
      textoEnviar: 'Cambiar contraseña',
      textoOcupado: 'Guardando…',
      campos: [
        campo('Contraseña actual', entrada({ name: 'actual', type: 'password', autocomplete: 'current-password', required: true }),
          sesion.debeCambiarClave ? 'Es la contraseña temporal que le entregó CAM.' : null),
        campo('Nueva contraseña', nueva, 'Mínimo 8 caracteres, con al menos una letra y un número.'),
        campo('Repita la nueva contraseña', repetir),
      ],
      alEnviar: async (d, f) => {
        if (d.nueva !== d.repetir) throw new Error('Las dos contraseñas nuevas no coinciden.');
        await enviar('/auth/cambiar-clave', { actual: f.actual.value, nueva: f.nueva.value });
        ctx.alCambiarClave();
        avisar('Contraseña actualizada.');
        location.hash = sesion.rol === 'SECRETARIA' ? '#/panel' : '#/comunidad';
      },
    });
    limpiar(main,
      h('div', { class: 'encabezado' }, h('h1', {}, 'Cambiar contraseña')),
      sesion.debeCambiarClave
        ? mensaje('Por seguridad, cambie la contraseña temporal antes de continuar.', 'alerta')
        : null,
      h('div', { class: 'tarjeta' }, form));
  },
};
