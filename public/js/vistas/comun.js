// Componentes compartidos entre pantallas.
import { obtener } from '../api.js';
import { h, limpiar, campo, entrada, insignia, pesos } from '../ui.js';

// Selector de adquisición con buscador (cédula, nombre o semana).
// alCambiar(adquisicionId | null). Devuelve { elemento, valor(), cargar() }.
export function selectorAdquisicion({ alCambiar, inicial = null, etiqueta = 'Propietario y semana' }) {
  const buscador = entrada({ type: 'search', placeholder: 'Filtrar por cédula, nombre o semana', maxlength: 120, 'aria-label': 'Filtrar adquisiciones' });
  const sel = h('select', { name: 'adquisicion_id', required: true });
  let todas = [];
  let actual = inicial ? String(inicial) : '';

  const texto = (a) => `Semana ${a.semana_numero} · ${a.nombre_completo} · C.C. ${a.cedula}${a.estado_titularidad !== 'VIGENTE' ? ' (transferida)' : ''}`;
  function pintar() {
    const f = buscador.value.trim().toLowerCase();
    const visibles = todas.filter((a) => !f || texto(a).toLowerCase().includes(f) || String(a.semana_numero) === f);
    limpiar(sel,
      h('option', { value: '' }, visibles.length ? `Seleccione (${visibles.length})…` : 'Ninguna coincide'),
      visibles.map((a) => h('option', { value: a.adquisicion_id, selected: String(a.adquisicion_id) === actual }, texto(a))));
    if (visibles.length === 1 && f) { sel.value = String(visibles[0].adquisicion_id); cambio(); }
  }
  function cambio() {
    if (sel.value === actual) return;
    actual = sel.value;
    alCambiar(actual ? Number(actual) : null);
  }
  buscador.addEventListener('input', pintar);
  sel.addEventListener('change', cambio);

  const elemento = h('div', { class: 'campos' }, campo('Buscar', buscador), campo(etiqueta, sel));
  return {
    elemento,
    valor: () => (actual ? Number(actual) : null),
    async cargar() {
      todas = await obtener('/adquisiciones');
      pintar();
      if (actual) alCambiar(Number(actual));
    },
  };
}

// Cuadrícula de cuotas 1..N con su situación (texto + color).
export function cuadriculaCuotas(cuotas) {
  return h('div', {},
    h('div', { class: 'leyenda' },
      h('span', {}, h('span', { class: 'muestra PAGADA' }), 'Pagada (verificada)'),
      h('span', {}, h('span', { class: 'muestra POR_VERIFICAR' }), 'Registrada, por verificar'),
      h('span', {}, h('span', { class: 'muestra' }), 'Pendiente')),
    h('div', { class: 'cuotas' }, cuotas.map((c) =>
      h('div', { class: `cuota ${c.situacion_cuota}`, title: `Cuota ${c.numero_cuota}: ${c.situacion_cuota.replace('_', ' ').toLowerCase()}` },
        h('b', {}, String(c.numero_cuota)),
        c.situacion_cuota === 'PAGADA' ? 'Pagada' : c.situacion_cuota === 'POR_VERIFICAR' ? 'Por verificar' : 'Pendiente'))));
}

// Resumen del estado de cuenta en tarjetas.
export function resumenCuenta(ec) {
  const fila = (k, v) => [h('dt', {}, k), h('dd', {}, v)];
  return h('dl', { class: 'resumen-confirmacion' },
    fila('Propietario', `${ec.nombre_completo} · C.C. ${ec.cedula}`),
    fila('Semana', `Semana ${ec.semana_numero}`),
    fila('Titularidad', insignia(ec.estado_titularidad)),
    fila('Plan', `${pesos(ec.valor_accion)} en ${ec.numero_cuotas} cuotas de ${pesos(ec.valor_cuota)}`),
    fila('Cuotas pagadas', `${ec.cuotas_pagadas} de ${ec.numero_cuotas}`),
    fila('Saldo', pesos(ec.saldo)));
}
