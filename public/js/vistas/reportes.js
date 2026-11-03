// Recaudo y reportes: consulta con filtros y exportación a Excel con LOS MISMOS filtros.
import { obtener, descargar, parametros } from '../api.js';
import {
  h, limpiar, conCarga, tabla, pesos, fecha, fechaHora, campo, entrada, selector, mensaje, avisar, conBotonOcupado,
  mesLargo, nombreMes, hoy, insignia,
} from '../ui.js';

const anioActual = Number(hoy().slice(0, 4));
const mesActual = Number(hoy().slice(5, 7));
const desdeAnio = `${anioActual}-01-01`;

const REPORTES = [
  {
    id: 'recaudo', titulo: 'Recaudo mensual',
    ayuda: 'Total de pagos por mes según la fecha del pago. Lo registrado y lo verificado se muestran por separado.',
    filtros: () => [
      ['desde', 'Pagos desde', entrada({ type: 'date', name: 'desde', value: desdeAnio })],
      ['hasta', 'Hasta', entrada({ type: 'date', name: 'hasta', value: hoy() })],
    ],
  },
  {
    id: 'por-verificar', titulo: 'Pendientes de verificación',
    ayuda: 'Pagos registrados cuya recepción de dinero aún no se ha confirmado.',
    filtros: () => [
      ['desde', 'Pagos desde', entrada({ type: 'date', name: 'desde' })],
      ['hasta', 'Hasta', entrada({ type: 'date', name: 'hasta' })],
    ],
  },
  {
    id: 'saldos', titulo: 'Saldos',
    ayuda: 'Saldo de cada adquisición vigente. Solo los pagos verificados descuentan el saldo.',
    filtros: () => [['situacion', 'Situación', selector('situacion', [['', 'Todas'], ['EN_CURSO', 'En curso'], ['PAGADA', 'Pagadas']])]],
  },
  {
    id: 'sin-pago', titulo: 'Sin pago en el mes',
    ayuda: 'Adquisiciones vigentes, no pagadas por completo, que no registraron ningún pago en el mes elegido. '
      + 'Esto NO significa que tengan una cuota vencida: aún no se ha definido el calendario de vencimientos.',
    filtros: () => [
      ['anio', 'Año', entrada({ type: 'number', name: 'anio', min: 2000, max: 2100, required: true, value: String(anioActual) })],
      ['mes', 'Mes', selector('mes', Array.from({ length: 12 }, (_, i) => [i + 1, nombreMes(i + 1)]), { required: true, value: String(mesActual) })],
    ],
  },
  {
    id: 'pagos', titulo: 'Historial de pagos',
    ayuda: 'Todos los pagos con su estado.',
    filtros: () => [
      ['estado', 'Estado', selector('estado', [['', 'Todos'], ['NO_VERIFICADO', 'Sin verificar'], ['VERIFICADO', 'Verificados'], ['ANULADO', 'Anulados']])],
      ['desde', 'Pagos desde', entrada({ type: 'date', name: 'desde', value: desdeAnio })],
      ['hasta', 'Hasta', entrada({ type: 'date', name: 'hasta', value: hoy() })],
    ],
  },
];

// Presentación de cada tipo de columna (definidos en el backend).
function celda(valor, tipo, clave) {
  if (valor === null || valor === undefined) return '';
  if (tipo === 'pesos') return pesos(valor);
  if (tipo === 'fecha') return fecha(valor);
  if (tipo === 'fechahora') return fechaHora(valor);
  if (tipo === 'mes') return mesLargo(valor);
  if (['estado', 'situacion_pago', 'situacion_cuota'].includes(clave)) return insignia(valor);
  return String(valor);
}

function totales(rep, filas) {
  const cols = rep.columnas.filter((c) => c.tipo === 'pesos' && !['valor_accion', 'saldo', 'valor_cuota'].includes(c.clave));
  const saldo = rep.columnas.find((c) => c.clave === 'saldo');
  const partes = cols.map((c) => `${c.titulo}: ${pesos(filas.reduce((s, f) => s + Number(f[c.clave] || 0), 0))}`);
  if (saldo) partes.push(`Saldo total: ${pesos(filas.reduce((s, f) => s + Number(f.saldo || 0), 0))}`);
  return partes.length ? h('p', { class: 'texto-pequeno' }, h('strong', {}, 'Totales · '), partes.join(' · ')) : null;
}

export default {
  titulo: 'Recaudo y reportes',
  async render(main, [inicial]) {
    const pestanas = h('div', { class: 'pestanas', role: 'tablist' });
    const zona = h('div');

    function abrir(def) {
      history.replaceState(null, '', `#/reportes/${def.id}`);
      for (const b of pestanas.children) b.setAttribute('aria-selected', String(b.dataset.id === def.id));
      const controles = def.filtros();
      const resultado = h('div');
      let ultimaConsulta = null;   // filtros de lo que está en pantalla
      const exportar = h('button', { type: 'button', disabled: true }, 'Exportar a Excel');

      const consultar = () => conCarga(resultado, async () => {
        const filtros = Object.fromEntries(controles.map(([k, , c]) => [k, c.value]));
        const qs = parametros(filtros);
        const r = await obtener(`/reportes/${def.id}${qs}`);
        ultimaConsulta = qs;
        exportar.disabled = false;
        limpiar(resultado,
          h('p', { class: 'texto-suave texto-pequeno' }, `${r.filas.length} fila(s) · `,
            Object.entries(r.filtros).filter(([, v]) => v !== null).map(([k, v]) => `${k}: ${v}`).join(' · ') || 'sin filtros'),
          totales(r, r.filas),
          tabla(r.columnas.map((c) => ({
            titulo: c.titulo,
            valor: (f) => celda(f[c.clave], c.tipo, c.clave),
            clase: ['pesos', 'entero'].includes(c.tipo) ? 'derecha num' : null,
          })), r.filas, 'No hay datos para estos filtros.'));
      });

      exportar.addEventListener('click', () => conBotonOcupado(exportar, 'Generando…', async () => {
        try {
          const { filas } = await descargar(`/reportes/${def.id}/excel${ultimaConsulta}`, `cam-${def.id}.xlsx`);
          avisar(`Excel descargado con ${filas} fila(s), los mismos datos que ve en pantalla.`);
        } catch (err) { avisar(err.message, 'error'); }
      }));
      // Si se cambia un filtro, hay que volver a consultar antes de exportar.
      const form = h('form', { class: 'filtros', onsubmit: (e) => { e.preventDefault(); consultar(); } },
        controles.map(([, etiqueta, c]) => campo(etiqueta, c)),
        h('button', { type: 'submit', class: 'primario' }, 'Consultar'), exportar);
      form.addEventListener('input', () => { exportar.disabled = true; });
      form.addEventListener('change', () => { exportar.disabled = true; });

      limpiar(zona, h('section', { class: 'tarjeta' },
        h('h2', {}, def.titulo),
        mensaje(def.ayuda, def.id === 'sin-pago' ? 'alerta' : 'info'),
        form, resultado));
      consultar();
    }

    for (const def of REPORTES) {
      pestanas.append(h('button', { type: 'button', role: 'tab', dataset: { id: def.id }, onclick: () => abrir(def) }, def.titulo));
    }
    limpiar(main,
      h('div', { class: 'encabezado' },
        h('div', {}, h('h1', {}, 'Recaudo y reportes'),
          h('p', {}, 'Consulte con filtros y exporte a Excel exactamente lo que ve en pantalla.'))),
      pestanas, zona);
    abrir(REPORTES.find((r) => r.id === inicial) || REPORTES[0]);
  },
};
