// Estado de cuenta por propietario y adquisición.
import { obtener, descargar } from '../api.js';
import {
  h, limpiar, conCarga, tabla, insignia, pesos, fecha, fechaHora, mensaje, indicador, numero, avisar, conBotonOcupado,
} from '../ui.js';
import { selectorAdquisicion, cuadriculaCuotas } from './comun.js';
import { dialogoTransferir } from './adquisiciones.js';

const columnasPagos = (conPropietario) => [
  { titulo: 'Cuota', valor: (p) => String(p.numero_cuota), clase: 'derecha' },
  conPropietario ? { titulo: 'Pagó', valor: (p) => p.nombre_completo } : null,
  { titulo: 'Fecha del pago', valor: (p) => fecha(p.fecha_pago) },
  { titulo: 'Valor', valor: (p) => pesos(p.valor), clase: 'derecha num' },
  { titulo: 'Estado', valor: (p) => insignia(p.estado) },
  { titulo: 'Registrado', valor: (p) => `${fechaHora(p.registrado_en)} · ${p.registrado_por_nombre}` },
  { titulo: 'Verificado', valor: (p) => (p.verificado_en ? `${fechaHora(p.verificado_en)} · ${p.verificado_por_nombre}` : '') },
  {
    titulo: 'Comprobante',
    valor: (p) => (p.comprobante_id
      ? h('a', { href: `/api/comprobantes/${p.comprobante_id}/pdf`, target: '_blank', rel: 'noopener' }, p.comprobante_numero)
      : (p.estado === 'ANULADO' ? `Anulado: ${p.motivo_anulacion}` : '')),
  },
].filter(Boolean);

function detalle(ec) {
  const vigente = ec.estado_titularidad === 'VIGENTE';
  const actual = ec.titulares.find((t) => t.estado_titularidad === 'VIGENTE');
  const exportar = h('button', { type: 'button' }, 'Exportar a Excel');
  exportar.addEventListener('click', () => conBotonOcupado(exportar, 'Generando…', async () => {
    try { await descargar(`/reportes/estado-cuenta/excel?adquisicion_id=${ec.adquisicion_id}`, 'estado-cuenta.xlsx'); avisar('Archivo descargado.'); } catch (err) { avisar(err.message, 'error'); }
  }));
  return [
    h('div', { class: 'encabezado' },
      h('div', {}, h('h2', {}, `${ec.nombre_completo} · Semana ${ec.semana_numero}`),
        h('p', {}, `C.C. ${ec.cedula} · ${ec.correo} · titular desde el ${fecha(ec.fecha_adquisicion)} · `, insignia(ec.estado_titularidad), ' ', insignia(ec.situacion_pago))),
      h('div', { class: 'acciones' },
        vigente ? h('a', { class: 'boton', href: `#/pagos/${ec.adquisicion_id}` }, 'Registrar pago') : null,
        vigente ? h('button', { type: 'button', onclick: () => dialogoTransferir(ec, (r) => { location.hash = `#/estado-cuenta/${r.adquisicion_id}`; }) }, 'Cambiar titular') : null,
        exportar, h('button', { type: 'button', onclick: () => window.print() }, 'Imprimir'))),
    !vigente
      ? h('div', { class: 'mensaje alerta' },
        `Esta semana se transfirió el ${fecha(ec.fecha_fin_titularidad)}. Aquí se ve la cuenta de ${ec.nombre_completo} hasta esa fecha; ya no admite pagos. `,
        actual ? h('a', { href: `#/estado-cuenta/${actual.adquisicion_id}` }, `Ver la cuenta del titular actual: ${actual.nombre_completo}`) : null)
      : null,
    ec.origen !== 'ASIGNACION'
      ? mensaje(`Recibió la semana por ${insignia(ec.origen).textContent.toLowerCase()} el ${fecha(ec.fecha_adquisicion)} y asumió el saldo. `
        + `${ec.cuotas_heredadas} cuota(s) (${pesos(ec.total_heredado)}) las pagaron titulares anteriores y cuentan como pagadas.`, 'info')
      : null,
    h('div', { class: 'indicadores' },
      indicador('Valor de la acción', pesos(ec.valor_accion), `${ec.numero_cuotas} cuotas de ${pesos(ec.valor_cuota)}`),
      indicador('Cuotas pagadas', `${numero(ec.cuotas_pagadas)} de ${numero(ec.numero_cuotas)}`,
        ec.cuotas_heredadas ? `Con pago verificado · ${ec.cuotas_heredadas} de titulares anteriores` : 'Con pago verificado'),
      indicador('Cuotas pendientes', numero(ec.cuotas_pendientes), ec.cuotas_por_verificar ? `${ec.cuotas_por_verificar} de ellas con pago por verificar` : null),
      indicador('Total registrado', pesos(ec.total_registrado), 'Pagos registrados, verificados o no'),
      indicador('Total abonado', pesos(ec.total_abonado), 'Solo pagos verificados', true),
      indicador('Saldo', pesos(ec.saldo), 'Valor de la acción − total abonado', true)),
    ec.cuotas_por_verificar > 0
      ? mensaje(`Hay ${ec.cuotas_por_verificar} pago(s) registrados sin verificar por ${pesos(ec.total_registrado - ec.total_abonado)}. No descuentan el saldo hasta que se verifiquen.`, 'alerta')
      : null,
    h('section', { class: 'tarjeta' }, h('h3', {}, 'Plan de cuotas'), cuadriculaCuotas(ec.cuotas)),
    h('section', { class: 'tarjeta' },
      h('h3', {}, `Pagos de ${ec.nombre_completo}`),
      tabla(columnasPagos(false), ec.pagos, 'Este titular aún no tiene pagos.')),
    ec.pagos_anteriores.length
      ? h('section', { class: 'tarjeta' },
        h('h3', {}, 'Pagos de titulares anteriores'),
        h('p', { class: 'texto-suave texto-pequeno' }, 'Cuentan para el saldo de esta semana. No se pueden anular ni modificar.'),
        tabla(columnasPagos(true), ec.pagos_anteriores))
      : null,
    h('section', { class: 'tarjeta' },
      h('h3', {}, `Titulares de la semana ${ec.semana_numero}`),
      tabla([
        { titulo: 'Titular', valor: (t) => (t.adquisicion_id === ec.adquisicion_id ? h('strong', {}, t.nombre_completo) : t.nombre_completo) },
        { titulo: 'Cédula', valor: (t) => t.cedula },
        { titulo: 'Cómo la recibió', valor: (t) => [insignia(t.origen), t.titular_anterior ? ` de ${t.titular_anterior}` : ''] },
        { titulo: 'Desde', valor: (t) => fecha(t.fecha_adquisicion) },
        { titulo: 'Hasta', valor: (t) => (t.fecha_fin_titularidad ? fecha(t.fecha_fin_titularidad) : 'Actual') },
        { titulo: 'Soporte u observación', valor: (t) => t.observacion },
        {
          titulo: '',
          valor: (t) => (t.adquisicion_id === ec.adquisicion_id ? ''
            : h('a', { class: 'boton pequeno', href: `#/estado-cuenta/${t.adquisicion_id}` }, 'Ver cuenta')),
        },
      ], ec.titulares)),
  ];
}

export default {
  titulo: 'Estado de cuenta',
  async render(main, [adqInicial]) {
    const zona = h('div');
    const mostrar = (id) => {
      if (!id) { limpiar(zona, mensaje('Seleccione un propietario y una semana para ver su estado de cuenta.', 'info')); return; }
      history.replaceState(null, '', `#/estado-cuenta/${id}`);
      conCarga(zona, async () => limpiar(zona, detalle(await obtener(`/adquisiciones/${id}`))));
    };
    const sel = selectorAdquisicion({ alCambiar: mostrar, inicial: adqInicial });
    limpiar(main,
      h('div', { class: 'encabezado' },
        h('div', {}, h('h1', {}, 'Estado de cuenta'),
          h('p', {}, 'Por adquisición: si un propietario tiene dos semanas, cada una tiene su propio plan y saldo.'))),
      h('div', { class: 'tarjeta' }, sel.elemento),
      zona);
    limpiar(zona, mensaje('Seleccione un propietario y una semana para ver su estado de cuenta.', 'info'));
    await sel.cargar();
  },
};
