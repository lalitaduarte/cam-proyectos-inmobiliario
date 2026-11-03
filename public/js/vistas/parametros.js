// Parámetros de la acción: valor total, número de cuotas y valor de la cuota.
import { obtener, enviar } from '../api.js';
import {
  h, limpiar, conCarga, tabla, pesos, fechaHora, campo, entrada, mensaje, confirmar, avisar, conBotonOcupado, indicador, numero,
  datosFormulario,
} from '../ui.js';

const aNumero = (t) => Number(String(t).replace(/[.\s$]/g, ''));

export default {
  titulo: 'Parámetros',
  async render(main) {
    const cuerpo = h('div');
    limpiar(main,
      h('div', { class: 'encabezado' },
        h('div', {}, h('h1', {}, 'Parámetros de la acción'),
          h('p', {}, 'Condiciones que se copian a cada NUEVA adquisición.'))),
      cuerpo);

    const cargar = () => conCarga(cuerpo, async () => {
      const { vigente, historial } = await obtener('/parametros');
      const valor = entrada({ name: 'valor_accion', inputmode: 'numeric', required: true, value: vigente ? String(vigente.valor_accion) : '' });
      const cuotas = entrada({ name: 'numero_cuotas', type: 'number', min: 1, max: 120, required: true, value: vigente ? String(vigente.numero_cuotas) : '' });
      const cuota = entrada({ name: 'valor_cuota', inputmode: 'numeric', required: true, value: vigente ? String(vigente.valor_cuota) : '' });
      const calculo = h('p', { class: 'texto-pequeno' });
      const actualizarCalculo = () => {
        const v = aNumero(valor.value); const n = Number(cuotas.value); const c = aNumero(cuota.value);
        if (!(v > 0 && n > 0 && c > 0)) { calculo.textContent = 'Complete los tres valores.'; return; }
        calculo.textContent = n * c === v
          ? `✔ ${n} × ${pesos(c)} = ${pesos(v)}`
          : `✖ ${n} × ${pesos(c)} = ${pesos(n * c)}, que no es igual a ${pesos(v)}. Sugerencia: cuota de ${pesos(v / n)}.`;
      };
      [valor, cuotas, cuota].forEach((x) => x.addEventListener('input', actualizarCalculo));
      actualizarCalculo();

      const error = h('div');
      const boton = h('button', { type: 'submit', class: 'primario' }, 'Guardar nuevas condiciones');
      const form = h('form', {},
        h('div', { class: 'campos' }, campo('Valor de la acción (COP)', valor), campo('Número de cuotas', cuotas), campo('Valor de cada cuota (COP)', cuota)),
        calculo, error, h('div', { class: 'pie-formulario' }, boton));
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        limpiar(error);
        const d = datosFormulario(form);
        const nuevo = { valor_accion: aNumero(d.valor_accion), numero_cuotas: Number(d.numero_cuotas), valor_cuota: aNumero(d.valor_cuota) };
        const ok = await confirmar({
          titulo: 'Cambiar parámetros',
          mensaje: 'Las nuevas condiciones se aplicarán solo a las adquisiciones que se registren desde ahora. Las adquisiciones y pagos existentes NO cambian.',
          detalle: [['Valor de la acción', pesos(nuevo.valor_accion)], ['Número de cuotas', String(nuevo.numero_cuotas)], ['Valor de cuota', pesos(nuevo.valor_cuota)]],
          aceptar: 'Guardar',
        });
        if (!ok) return;
        await conBotonOcupado(boton, 'Guardando…', async () => {
          try { await enviar('/parametros', nuevo); avisar('Nuevos parámetros guardados.'); cargar(); } catch (err) { limpiar(error, mensaje(err.message, 'error')); }
        });
      });

      limpiar(cuerpo,
        vigente ? h('div', { class: 'indicadores' },
          indicador('Valor de la acción vigente', pesos(vigente.valor_accion), `Desde ${fechaHora(vigente.vigente_desde)}`, true),
          indicador('Número de cuotas', numero(vigente.numero_cuotas)),
          indicador('Valor de cada cuota', pesos(vigente.valor_cuota))) : mensaje('Aún no hay parámetros configurados.', 'alerta'),
        h('section', { class: 'tarjeta' }, h('h2', {}, 'Nuevas condiciones'),
          mensaje('Cada adquisición guarda una copia de sus condiciones. Cambiar aquí no modifica contratos ni pagos anteriores.', 'info'),
          form),
        h('section', { class: 'tarjeta' }, h('h2', {}, 'Historial'),
          tabla([
            { titulo: 'Vigente desde', valor: (p) => fechaHora(p.vigente_desde) },
            { titulo: 'Valor de la acción', valor: (p) => pesos(p.valor_accion), clase: 'derecha num' },
            { titulo: 'Cuotas', valor: (p) => String(p.numero_cuotas), clase: 'derecha' },
            { titulo: 'Valor cuota', valor: (p) => pesos(p.valor_cuota), clase: 'derecha num' },
            { titulo: 'Adquisiciones con estas condiciones', valor: (p) => String(p.adquisiciones), clase: 'derecha' },
            { titulo: 'Registró', valor: (p) => p.creado_por_nombre },
          ], historial)));
    });
    await cargar();
  },
};
