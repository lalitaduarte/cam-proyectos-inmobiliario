// Semanas: disponibilidad, titular actual y calendario de fechas por año.
import { obtener, enviar, actualizar, eliminar } from '../api.js';
import {
  h, limpiar, conCarga, tabla, insignia, fecha, campo, entrada, dialogoFormulario, confirmar, avisar, conBotonOcupado, mensaje,
} from '../ui.js';

function dialogoFechas(semana, anio, alGuardar) {
  const existente = semana.fecha_id;
  dialogoFormulario(`${existente ? 'Editar' : 'Registrar'} fechas · Semana ${semana.numero}`, {
    introduccion: h('p', { class: 'texto-suave' }, 'Escriba las fechas reales de entrada (check-in) y salida (check-out) de esta semana para el año indicado.'),
    campos: [
      campo('Año', entrada({ name: 'anio', type: 'number', required: true, min: 2000, max: 2100, value: String(anio) })),
      campo('Fecha de entrada', entrada({ name: 'fecha_entrada', type: 'date', required: true, value: semana.fecha_entrada || '' })),
      campo('Fecha de salida', entrada({ name: 'fecha_salida', type: 'date', required: true, value: semana.fecha_salida || '' }),
        'Debe ser posterior a la entrada.'),
      campo('Nota (opcional)', entrada({ name: 'nota', maxlength: 200, value: semana.nota || '' })),
    ],
    alEnviar: async (d) => {
      if (d.fecha_salida && d.fecha_entrada && d.fecha_salida <= d.fecha_entrada) {
        throw new Error('La fecha de salida debe ser posterior a la fecha de entrada.');
      }
      if (existente) await actualizar(`/semanas/fechas/${semana.fecha_id}`, d);
      else await enviar(`/semanas/${semana.semana_id}/fechas`, d);
      avisar(`Fechas de la semana ${semana.numero} guardadas.`);
      alGuardar();
    },
  });
}

async function borrarFechas(semana, anio, boton, alGuardar) {
  const ok = await confirmar({
    titulo: 'Eliminar fechas',
    mensaje: 'Se eliminarán las fechas de esta semana para el año indicado. La semana y su titular no cambian.',
    detalle: [['Semana', String(semana.numero)], ['Año', String(anio)], ['Entrada', fecha(semana.fecha_entrada)], ['Salida', fecha(semana.fecha_salida)]],
    aceptar: 'Eliminar fechas', peligro: true,
  });
  if (!ok) return;
  await conBotonOcupado(boton, '…', async () => {
    try {
      await eliminar(`/semanas/fechas/${semana.fecha_id}`);
      avisar('Fechas eliminadas.');
      alGuardar();
    } catch (err) { avisar(err.message, 'error'); }
  });
}

export default {
  titulo: 'Semanas',
  async render(main) {
    const anioActual = new Date().getFullYear();
    const anio = entrada({ type: 'number', min: 2000, max: 2100, value: String(anioActual + 1), name: 'anio' });
    const filtro = h('select', {}, h('option', { value: '' }, 'Todas'), h('option', { value: 'DISPONIBLE' }, 'Disponibles'),
      h('option', { value: 'CON_TITULAR' }, 'Con titular'));
    const resultado = h('div');
    const cargar = () => conCarga(resultado, async () => {
      const a = Number(anio.value) || anioActual;
      const { semanas } = await obtener(`/semanas?anio=${a}`);
      const filas = semanas.filter((s) => !filtro.value || s.disponibilidad === filtro.value);
      const sinFechas = semanas.filter((s) => !s.fecha_id).length;
      limpiar(resultado,
        h('p', { class: 'texto-suave texto-pequeno' },
          `${semanas.filter((s) => s.disponibilidad === 'CON_TITULAR').length} con titular · `,
          `${semanas.filter((s) => s.disponibilidad === 'DISPONIBLE').length} disponibles · `,
          `${sinFechas} sin fechas registradas para ${a}`),
        semanas.some((s) => s.nota && s.nota.startsWith('DEMO'))
          ? mensaje('Las fechas marcadas como DEMO son de ejemplo: reemplácelas por las fechas reales de CAM.', 'alerta') : null,
        tabla([
          { titulo: 'Semana', valor: (s) => h('strong', {}, String(s.numero)) },
          { titulo: 'Disponibilidad', valor: (s) => insignia(s.disponibilidad) },
          { titulo: 'Titular actual', valor: (s) => (s.titular_nombre ? h('a', { href: `#/propietarios/${s.propietario_id}` }, s.titular_nombre) : '') },
          { titulo: `Entrada ${a}`, valor: (s) => (s.fecha_entrada ? fecha(s.fecha_entrada) : h('span', { class: 'texto-suave' }, 'Sin registrar')) },
          { titulo: `Salida ${a}`, valor: (s) => (s.fecha_salida ? fecha(s.fecha_salida) : '') },
          { titulo: 'Nota', valor: (s) => s.nota },
          {
            titulo: 'Acciones',
            valor: (s) => {
              const bBorrar = s.fecha_id ? h('button', { class: 'pequeno peligro' }, 'Quitar fechas') : null;
              if (bBorrar) bBorrar.addEventListener('click', () => borrarFechas(s, a, bBorrar, cargar));
              return h('div', { class: 'acciones' },
                h('button', { class: 'pequeno', onclick: () => dialogoFechas(s, a, cargar) }, s.fecha_id ? 'Editar fechas' : 'Registrar fechas'),
                bBorrar);
            },
          },
        ], filas, 'No hay semanas con ese filtro.'));
    });
    anio.addEventListener('change', cargar);
    filtro.addEventListener('change', cargar);
    limpiar(main,
      h('div', { class: 'encabezado' },
        h('div', {}, h('h1', {}, 'Semanas'),
          h('p', {}, 'Semanas 1 a 52 de la vivienda. El propietario adquiere la semana para todos los años; las fechas se registran por año.'))),
      h('div', { class: 'tarjeta' },
        h('div', { class: 'filtros' }, campo('Año del calendario', anio), campo('Mostrar', filtro)),
        resultado));
    await cargar();
  },
};
