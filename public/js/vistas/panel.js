// Panel principal: indicadores calculados en la base de datos (ninguna cifra fija),
// gráfico de recaudo de 12 meses y últimos pagos.
import { obtener } from '../api.js';
import { h, limpiar, conCarga, indicador, pesos, numero, fecha, mesCorto, mesLargo, compacto, insignia, tabla, mensaje } from '../ui.js';

// Eje con 4 divisiones de valor "redondo" (1, 2, 2,5 o 5 × 10^n): 0, 1 M, 2 M, 3 M, 4 M.
function techo(max) {
  if (max <= 0) return 4;
  const crudo = max / 4;
  const p = 10 ** Math.floor(Math.log10(crudo));
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * p).find((v) => v >= crudo);
  return paso * 4;
}

// Columnas apiladas: verificado (abajo) + registrado sin verificar (arriba).
function grafico(recaudo) {
  const tope = techo(Math.max(...recaudo.map((m) => m.total_registrado)));
  const guias = [0, 0.25, 0.5, 0.75, 1].map((f) =>
    h('div', { class: 'linea-guia', dataset: { f } }, h('span', {}, compacto(tope * f))));
  const columnas = recaudo.map((m) => {
    const sinVerificar = m.total_registrado - m.total_verificado;
    const s1 = h('div', { class: 'segmento s1' });
    const s2 = h('div', { class: 'segmento s2' });
    // La altura se asigna por JavaScript (CSSOM), permitido por la política de seguridad.
    s1.style.height = `${(m.total_verificado / tope) * 220}px`;
    s2.style.height = `${(sinVerificar / tope) * 220}px`;
    const etiqueta = `${mesLargo(m.mes)}: verificado ${pesos(m.total_verificado)}, sin verificar ${pesos(sinVerificar)}, registrado ${pesos(m.total_registrado)}`;
    return h('div', { class: 'columna', tabindex: '0', 'aria-label': etiqueta },
      h('div', { class: 'barra-apilada' }, m.total_verificado > 0 ? s1 : null, sinVerificar > 0 ? s2 : null),
      h('div', { class: 'globo' },
        h('strong', {}, mesLargo(m.mes)), h('br'),
        h('span', { class: 'muestra serie-1' }), ` Verificado: ${pesos(m.total_verificado)}`, h('br'),
        h('span', { class: 'muestra serie-2' }), ` Sin verificar: ${pesos(sinVerificar)}`, h('br'),
        `Total registrado: ${pesos(m.total_registrado)}`));
  });
  const area = h('div', { class: 'area' }, guias, columnas);
  for (const g of guias) g.style.bottom = `${Number(g.dataset.f) * 220}px`;
  return h('div', {},
    h('div', { class: 'leyenda' },
      h('span', {}, h('span', { class: 'muestra serie-1' }), 'Verificado'),
      h('span', {}, h('span', { class: 'muestra serie-2' }), 'Registrado sin verificar')),
    h('div', { class: 'grafico', role: 'img', 'aria-label': 'Recaudo por mes de los últimos 12 meses' },
      area, h('div', { class: 'meses' }, recaudo.map((m, i) => h('span', {},
        mesCorto(m.mes).split(' ')[0], (i === 0 || m.mes.endsWith('-01')) ? h('small', {}, `20${m.mes.slice(2, 4)}`) : null)))),
    h('details', {},
      h('summary', {}, 'Ver los datos en tabla'),
      tabla([
        { titulo: 'Mes', valor: (m) => mesLargo(m.mes) },
        { titulo: 'Registrado', valor: (m) => pesos(m.total_registrado), clase: 'derecha num' },
        { titulo: 'Verificado', valor: (m) => pesos(m.total_verificado), clase: 'derecha num' },
      ], recaudo)));
}

export default {
  titulo: 'Panel principal',
  async render(main) {
    const cuerpo = h('div');
    limpiar(main,
      h('div', { class: 'encabezado' },
        h('div', {}, h('h1', {}, 'Panel principal'), h('p', {}, 'Cifras calculadas en este momento desde la base de datos.'))),
      cuerpo);
    await conCarga(cuerpo, async () => {
      const { indicadores: i, ultimosPagos, recaudo } = await obtener('/panel');
      const porVerificar = i.total_registrado - i.total_verificado;
      limpiar(cuerpo,
        h('div', { class: 'indicadores' },
          indicador('Propietarios registrados', numero(i.propietarios_registrados), `${numero(i.propietarios_activos)} activos`),
          indicador('Semanas con titular actual', `${numero(i.semanas_con_titular)} de ${numero(i.semanas_total)}`),
          indicador('Cuotas pagadas (verificadas)', numero(i.cuotas_pagadas_verificadas),
            `de ${numero(i.cuotas_plan_total)} cuotas en los planes vigentes`),
          indicador('Pagos pendientes de verificación', numero(i.pagos_por_verificar), pesos(porVerificar), i.pagos_por_verificar > 0),
          indicador('Total registrado', pesos(i.total_registrado), `${numero(i.cuotas_registradas)} pagos, verificados o no`),
          indicador('Total verificado', pesos(i.total_verificado), 'Dinero cuya recepción confirmó la secretaria', true),
          indicador('Saldo por cobrar', pesos(i.saldo_por_cobrar), 'Valor de las acciones vigentes menos lo verificado'),
          indicador('Comprobantes pendientes de envío', numero(i.comprobantes_por_enviar)),
          indicador('Ofertas activas en la comunidad', numero(i.ofertas_activas))),
        h('div', { class: 'rejilla rejilla-2' },
          h('section', { class: 'tarjeta' },
            h('h2', {}, 'Recaudo por mes (últimos 12 meses)'),
            h('p', { class: 'texto-suave texto-pequeno' }, 'Según la fecha del pago. Pase el cursor o toque una columna para ver los valores.'),
            recaudo.some((m) => m.total_registrado > 0) ? grafico(recaudo) : mensaje('No hay pagos registrados en los últimos 12 meses.', 'info')),
          h('section', { class: 'tarjeta' },
            h('h2', {}, 'Últimos pagos registrados'),
            tabla([
              { titulo: 'Fecha del pago', valor: (p) => fecha(p.fecha_pago) },
              { titulo: 'Propietario', valor: (p) => p.nombre_completo },
              { titulo: 'Semana / cuota', valor: (p) => `Sem. ${p.semana_numero} · cuota ${p.numero_cuota}` },
              { titulo: 'Valor', valor: (p) => pesos(p.valor), clase: 'derecha num' },
              { titulo: 'Estado', valor: (p) => insignia(p.estado) },
            ], ultimosPagos, 'Aún no hay pagos registrados.'),
            h('p', { class: 'texto-pequeno' }, h('a', { href: '#/pagos' }, 'Ir a pagos de cuotas')))));
    });
  },
};
