// Pagos de cuotas: registrar, verificar, anular, emitir comprobante e historial.
import { obtener, enviar, parametros } from '../api.js';
import {
  h, limpiar, conCarga, tabla, insignia, pesos, fecha, fechaHora, campo, entrada, selector, mensaje,
  confirmar, pedirTexto, avisar, conBotonOcupado, hoy, datosFormulario,
} from '../ui.js';
import { selectorAdquisicion, cuadriculaCuotas, resumenCuenta } from './comun.js';

// ---------------------------------------------------------------- Acciones sobre un pago
async function verificar(p, boton, recargar) {
  const ok = await confirmar({
    titulo: 'Verificar pago',
    mensaje: 'Confirme que CAM recibió este dinero. Desde ese momento el pago descuenta el saldo.',
    detalle: [['Propietario', p.nombre_completo], ['Semana / cuota', `${p.semana_numero} / ${p.numero_cuota}`],
      ['Valor', pesos(p.valor)], ['Fecha del pago', fecha(p.fecha_pago)], ['Referencia', p.referencia || '—']],
    aceptar: 'Sí, el dinero fue recibido',
  });
  if (!ok) return;
  await conBotonOcupado(boton, 'Verificando…', async () => {
    try { await enviar(`/pagos/${p.pago_id}/verificar`); avisar('Pago verificado.'); recargar(); } catch (err) { avisar(err.message, 'error'); }
  });
}

async function emitir(p, boton, recargar) {
  const ok = await confirmar({
    titulo: 'Emitir comprobante',
    mensaje: 'Se generará un comprobante con número único. Después de emitirlo, el pago ya no se podrá anular ni modificar.',
    detalle: [['Propietario', p.nombre_completo], ['Semana / cuota', `${p.semana_numero} / ${p.numero_cuota}`], ['Valor', pesos(p.valor)]],
    aceptar: 'Emitir comprobante',
  });
  if (!ok) return;
  await conBotonOcupado(boton, 'Emitiendo…', async () => {
    try {
      const c = await enviar(`/pagos/${p.pago_id}/comprobante`);
      avisar(`Comprobante ${c.numero} emitido.`);
      recargar();
    } catch (err) { avisar(err.message, 'error'); }
  });
}

async function conMotivo(p, boton, recargar, tipo) {
  const anular = tipo === 'anular';
  const motivo = await pedirTexto({
    titulo: anular ? 'Anular pago' : 'Revertir verificación',
    mensaje: anular
      ? `El pago de la cuota ${p.numero_cuota} (semana ${p.semana_numero}) quedará ANULADO en el historial y la cuota volverá a estar pendiente.`
      : `El pago de la cuota ${p.numero_cuota} volverá a "sin verificar" y dejará de descontar el saldo.`,
    etiqueta: 'Motivo',
    aceptar: anular ? 'Anular pago' : 'Revertir',
    peligro: true,
  });
  if (!motivo) return;
  await conBotonOcupado(boton, '…', async () => {
    try {
      await enviar(`/pagos/${p.pago_id}/${anular ? 'anular' : 'revertir-verificacion'}`, { motivo });
      avisar(anular ? 'Pago anulado.' : 'Verificación revertida.');
      recargar();
    } catch (err) { avisar(err.message, 'error'); }
  });
}

function accionesPago(p, recargar) {
  const b = (texto, fn, clase = 'pequeno') => {
    const boton = h('button', { class: clase, type: 'button' }, texto);
    boton.addEventListener('click', () => fn(p, boton, recargar));
    return boton;
  };
  if (p.estado === 'ANULADO') return h('span', { class: 'texto-suave texto-pequeno' }, `Motivo: ${p.motivo_anulacion}`);
  if (p.comprobante_id) {
    return h('div', { class: 'acciones' },
      h('a', { class: 'boton pequeno', href: `/api/comprobantes/${p.comprobante_id}/pdf`, target: '_blank', rel: 'noopener' }, `Ver ${p.comprobante_numero}`));
  }
  if (p.estado === 'NO_VERIFICADO') {
    return h('div', { class: 'acciones' }, b('Verificar', verificar, 'pequeno primario'), b('Anular', (x, y, z) => conMotivo(x, y, z, 'anular'), 'pequeno peligro'));
  }
  return h('div', { class: 'acciones' },
    b('Emitir comprobante', emitir, 'pequeno primario'),
    b('Revertir', (x, y, z) => conMotivo(x, y, z, 'revertir')),
    b('Anular', (x, y, z) => conMotivo(x, y, z, 'anular'), 'pequeno peligro'));
}

export function tablaPagos(filas, recargar, textoVacio) {
  return tabla([
    { titulo: 'Fecha del pago', valor: (p) => fecha(p.fecha_pago) },
    { titulo: 'Propietario', valor: (p) => p.nombre_completo },
    { titulo: 'Semana', valor: (p) => String(p.semana_numero), clase: 'derecha' },
    { titulo: 'Cuota', valor: (p) => `${p.numero_cuota}/${p.numero_cuotas}`, clase: 'derecha' },
    { titulo: 'Valor', valor: (p) => pesos(p.valor), clase: 'derecha num' },
    { titulo: 'Estado', valor: (p) => insignia(p.estado) },
    { titulo: 'Registrado', valor: (p) => h('span', { class: 'texto-pequeno' }, `${fechaHora(p.registrado_en)} · ${p.registrado_por_nombre}`) },
    { titulo: 'Acciones', valor: (p) => accionesPago(p, recargar) },
  ], filas, textoVacio);
}

// ---------------------------------------------------------------- Pantalla
export default {
  titulo: 'Pagos de cuotas',
  async render(main, [adqInicial]) {
    const zonaPlan = h('div');
    const zonaFormulario = h('div');
    const lista = h('div');
    let cuentaActual = null;

    // ---- Historial con filtros
    const fEstado = selector('estado', [['', 'Todos'], ['NO_VERIFICADO', 'Sin verificar'], ['VERIFICADO', 'Verificados'], ['ANULADO', 'Anulados']]);
    const fDesde = entrada({ type: 'date', name: 'desde' });
    const fHasta = entrada({ type: 'date', name: 'hasta' });
    const fSolo = h('input', { type: 'checkbox', name: 'solo' });
    const cargarLista = () => conCarga(lista, async () => {
      const filas = await obtener(`/pagos${parametros({
        estado: fEstado.value, desde: fDesde.value, hasta: fHasta.value,
        adquisicion_id: fSolo.checked && cuentaActual ? cuentaActual.adquisicion_id : '', limite: 50,
      })}`);
      limpiar(lista,
        h('p', { class: 'texto-suave texto-pequeno' }, `${filas.length} pago(s)${filas.length === 50 ? ' · se muestran los 50 registrados más recientemente; use los filtros para ver otros' : ''}`),
        tablaPagos(filas, recargarTodo, 'No hay pagos con estos filtros.'));
    });
    [fEstado, fDesde, fHasta, fSolo].forEach((x) => x.addEventListener('change', cargarLista));

    // ---- Plan de la adquisición y formulario de registro
    async function mostrarAdquisicion(id) {
      cuentaActual = null;
      limpiar(zonaFormulario);
      if (!id) { limpiar(zonaPlan, mensaje('Seleccione una adquisición para ver sus cuotas y registrar un pago.', 'info')); return; }
      await conCarga(zonaPlan, async () => {
        const ec = await obtener(`/adquisiciones/${id}`);
        cuentaActual = ec;
        history.replaceState(null, '', `#/pagos/${id}`);
        limpiar(zonaPlan,
          resumenCuenta(ec),
          h('p', { class: 'texto-pequeno' },
            `Registrado: ${pesos(ec.total_registrado)} · Verificado (abonado): ${pesos(ec.total_abonado)} · `,
            h('a', { href: `#/estado-cuenta/${id}` }, 'Ver estado de cuenta completo')),
          cuadriculaCuotas(ec.cuotas));
        limpiar(zonaFormulario, formularioPago(ec));
      });
      if (fSolo.checked) cargarLista();
    }

    function formularioPago(ec) {
      const pendientes = ec.cuotas.filter((c) => c.situacion_cuota === 'PENDIENTE');
      if (ec.estado_titularidad !== 'VIGENTE') return mensaje('Esta adquisición no está vigente: no admite pagos.', 'info');
      if (pendientes.length === 0) return mensaje('Todas las cuotas de esta adquisición ya tienen un pago registrado.', 'exito');
      const selCuota = selector('numero_cuota', pendientes.map((c) => [c.numero_cuota, `Cuota ${c.numero_cuota} de ${ec.numero_cuotas}`]), { required: true });
      const valor = entrada({ name: 'valor', inputmode: 'numeric', required: true, value: String(ec.valor_cuota) });
      const vistaValor = h('span', { class: 'ayuda' }, `${pesos(ec.valor_cuota)}: un pago cubre una cuota completa.`);
      valor.addEventListener('input', () => {
        const n = Number(valor.value.replace(/[.\s$]/g, ''));
        vistaValor.textContent = Number.isFinite(n) && n > 0 ? `${pesos(n)}${n !== ec.valor_cuota ? ` · Debe ser ${pesos(ec.valor_cuota)}` : ''}` : 'Escriba el valor en pesos.';
      });
      const zonaError = h('div');
      const boton = h('button', { type: 'submit', class: 'primario' }, 'Registrar pago');
      const cValor = campo('Valor (COP)', valor);
      cValor.querySelector('.ayuda')?.remove();
      cValor.append(vistaValor);
      const form = h('form', {},
        h('h3', {}, 'Registrar un pago'),
        h('div', { class: 'campos' },
          campo('Cuota', selCuota, 'Solo se listan las cuotas sin pago registrado.'),
          cValor,
          campo('Fecha del pago', entrada({ name: 'fecha_pago', type: 'date', required: true, max: hoy(), value: hoy() }),
            'Día en que el propietario pagó (la fecha de registro la pone el sistema).'),
          campo('Referencia (opcional)', entrada({ name: 'referencia', maxlength: 80, placeholder: 'N.° de consignación o recibo' }))),
        zonaError,
        h('div', { class: 'pie-formulario' }, boton));
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        limpiar(zonaError);
        const d = datosFormulario(form);
        if (boton.disabled) return;
        const ok = await confirmar({
          titulo: 'Registrar pago',
          mensaje: 'El pago quedará "sin verificar" hasta que confirme la recepción del dinero.',
          detalle: [['Propietario', ec.nombre_completo], ['Semana', String(ec.semana_numero)], ['Cuota', `${d.numero_cuota} de ${ec.numero_cuotas}`],
            ['Valor', pesos(Number(d.valor.replace(/[.\s$]/g, '')))], ['Fecha del pago', fecha(d.fecha_pago)], ['Referencia', d.referencia || '—']],
          aceptar: 'Registrar',
        });
        if (!ok) return;
        await conBotonOcupado(boton, 'Registrando…', async () => {
          try {
            await enviar('/pagos', { ...d, adquisicion_id: ec.adquisicion_id });
            avisar(`Pago de la cuota ${d.numero_cuota} registrado. Pendiente de verificación.`);
            await recargarTodo();
          } catch (err) {
            limpiar(zonaError, mensaje(err.message, 'error'));
          }
        });
      });
      return form;
    }

    async function recargarTodo() {
      const id = selAdq.valor();
      await Promise.all([id ? mostrarAdquisicion(id) : null, cargarLista()]);
    }

    const selAdq = selectorAdquisicion({ alCambiar: mostrarAdquisicion, inicial: adqInicial });
    limpiar(main,
      h('div', { class: 'encabezado' },
        h('div', {}, h('h1', {}, 'Pagos de cuotas'),
          h('p', {}, 'Registre el pago de una cuota, verifique la recepción del dinero y emita el comprobante.'))),
      h('section', { class: 'tarjeta' },
        h('h2', {}, '1. Seleccione la adquisición'),
        selAdq.elemento, h('div', { class: 'mensaje-formulario' }, zonaPlan), zonaFormulario),
      h('section', { class: 'tarjeta' },
        h('h2', {}, '2. Pagos registrados'),
        h('p', { class: 'texto-suave texto-pequeno' },
          'Flujo: registrar → verificar (cuando el dinero se confirma) → emitir comprobante. Un pago con comprobante ya no se puede anular.'),
        h('div', { class: 'filtros' },
          campo('Estado', fEstado), campo('Pagados desde', fDesde), campo('Hasta', fHasta),
          h('label', { class: 'campo' }, h('span', { class: 'etiqueta' }, 'Solo la adquisición seleccionada'), fSolo)),
        lista));
    limpiar(zonaPlan, mensaje('Seleccione una adquisición para ver sus cuotas y registrar un pago.', 'info'));
    await Promise.all([selAdq.cargar(), cargarLista()]);
  },
};
