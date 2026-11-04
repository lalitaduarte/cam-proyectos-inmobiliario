// Componentes y utilidades de la interfaz.
// Regla de seguridad: los datos se insertan SIEMPRE como texto (textContent),
// nunca como HTML, para que nadie pueda inyectar código en la página.

// Crea un elemento: h('button', { class: 'primario', onclick: fn }, 'Guardar')
export function h(etiqueta, props = {}, ...hijos) {
  const el = document.createElement(etiqueta);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  agregar(el, hijos);
  return el;
}

function agregar(el, hijos) {
  for (const hijo of hijos.flat(Infinity)) {
    if (hijo === null || hijo === undefined || hijo === false) continue;
    el.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
}

export function limpiar(el, ...hijos) {
  el.replaceChildren();
  agregar(el, hijos);
  return el;
}

// ---------------------------------------------------------------- Formatos colombianos
const formatoPesos = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
export const pesos = (n) => (n === null || n === undefined || n === '' ? '—' : formatoPesos.format(Number(n)).replace(/\s/g, ' '));
export const numero = (n) => new Intl.NumberFormat('es-CO').format(Number(n || 0));

export function fecha(iso) {
  if (!iso) return '—';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}
export function fechaHora(valor) {
  if (!valor) return '—';
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(valor));
}
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const mesCorto = (aaaamm) => { const [a, m] = aaaamm.split('-'); return `${MESES[Number(m) - 1]} ${a.slice(2)}`; };
export const mesLargo = (aaaamm) => { const [a, m] = aaaamm.split('-'); return `${MESES_LARGOS[Number(m) - 1]} de ${a}`; };
export const nombreMes = (m) => MESES_LARGOS[m - 1];
export const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
export const compacto = (n) => (n >= 1e6 ? `$${numero(Math.round(n / 1e5) / 10)} M` : n >= 1e3 ? `$${numero(Math.round(n / 1e3))} mil` : `$${numero(n)}`);

// ---------------------------------------------------------------- Estados (siempre texto + color)
const ESTADOS = {
  VERIFICADO: ['Verificado', 'verde'], NO_VERIFICADO: ['Sin verificar', 'ambar'], ANULADO: ['Anulado', 'rojo'],
  PAGADA: ['Pagada', 'verde'], POR_VERIFICAR: ['Por verificar', 'ambar'], PENDIENTE: ['Pendiente', ''],
  EN_CURSO: ['En curso', 'azul'], VIGENTE: ['Vigente', 'verde'], TRANSFERIDA: ['Transferida', ''],
  ACTIVA: ['Activa', 'verde'], RETIRADA: ['Retirada', ''], CONCRETADA: ['Concretada', 'azul'],
  ENVIADO: ['Enviado', 'verde'], FALLIDO: ['Envío fallido', 'rojo'],
  DISPONIBLE: ['Disponible', 'azul'], CON_TITULAR: ['Con titular', 'verde'],
  VENTA: ['Venta', 'azul'], INTERCAMBIO: ['Intercambio', 'verde'], CESION: ['Cesión', 'azul'], OTRO: ['Otro', ''],
  ASIGNACION: ['Asignación', ''],
  ACTIVO: ['Activo', 'verde'], INACTIVO: ['Inactivo', 'rojo'],
};
export function insignia(estado, textoAlterno) {
  const [texto, color] = ESTADOS[estado] || [estado, ''];
  return h('span', { class: `insignia ${color}`, text: textoAlterno || texto });
}

// ---------------------------------------------------------------- Mensajes
export function avisar(texto, tipo = 'exito') {
  const contenedor = document.getElementById('avisos');
  const el = h('div', { class: `aviso ${tipo}`, role: tipo === 'error' ? 'alert' : 'status', title: 'Toque para cerrar', onclick: () => el.remove() }, texto);
  contenedor.append(el);
  setTimeout(() => el.remove(), tipo === 'error' ? 8000 : 4500);
}
export const mensaje = (texto, tipo = 'info') => h('div', { class: `mensaje ${tipo}`, role: tipo === 'error' ? 'alert' : null }, texto);
export const cargando = (texto = 'Cargando…') => h('div', { class: 'cargando', role: 'status' }, texto);
export const vacio = (texto) => h('div', { class: 'vacio' }, texto);

// Muestra "Cargando…", ejecuta la carga y, si falla, muestra el error con botón Reintentar.
export async function conCarga(contenedor, cargar) {
  limpiar(contenedor, cargando());
  try {
    await cargar();
  } catch (err) {
    limpiar(contenedor, mensaje(err.message || 'No se pudo cargar la información.', 'error'),
      h('button', { onclick: () => conCarga(contenedor, cargar) }, 'Reintentar'));
  }
}

// Protege contra el doble envío: desactiva el botón mientras la operación está en curso.
export async function conBotonOcupado(boton, textoOcupado, accion) {
  if (boton.disabled) return undefined;
  const original = boton.textContent;
  boton.disabled = true;
  boton.textContent = textoOcupado;
  try {
    return await accion();
  } finally {
    boton.disabled = false;
    boton.textContent = original;
  }
}

// ---------------------------------------------------------------- Formularios
export function campo(etiqueta, control, ayuda) {
  const id = control.id || `c-${Math.random().toString(36).slice(2, 9)}`;
  control.id = id;
  return h('div', { class: 'campo' },
    h('label', { for: id }, etiqueta),
    control,
    ayuda ? h('span', { class: 'ayuda' }, ayuda) : null);
}
export const entrada = (props) => h('input', { type: 'text', ...props });
export function selector(name, opciones, props = {}) {
  const { value, ...resto } = props;
  const s = h('select', { name, ...resto },
    opciones.map(([valor, texto]) => h('option', { value: valor }, texto)));
  if (value !== undefined) s.value = String(value);   // después de crear las opciones
  return s;
}
export function datosFormulario(form) {
  const d = {};
  for (const [k, v] of new FormData(form).entries()) d[k] = typeof v === 'string' ? v.trim() : v;
  return d;
}

// Formulario con envío protegido y mensaje de error dentro del propio formulario.
// alEnviar(datos) debe devolver una promesa; si lanza error, se muestra.
export function formulario({ campos, textoEnviar = 'Guardar', textoOcupado = 'Guardando…', alEnviar, extras = [] }) {
  const zonaMensaje = h('div', { class: 'mensaje-formulario' });
  const boton = h('button', { type: 'submit', class: 'primario' }, textoEnviar);
  const form = h('form', { novalidate: false },
    h('div', { class: 'campos' }, campos),
    zonaMensaje,
    h('div', { class: 'pie-formulario' }, extras, boton));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    limpiar(zonaMensaje);
    await conBotonOcupado(boton, textoOcupado, async () => {
      try {
        await alEnviar(datosFormulario(form), form);
      } catch (err) {
        limpiar(zonaMensaje, mensaje(err.message, 'error'));
      }
    });
  });
  return form;
}

// ---------------------------------------------------------------- Tablas
// columnas: [{ titulo, valor: (fila) => texto|nodo, clase }]
export function tabla(columnas, filas, textoVacio = 'No hay registros para mostrar.') {
  if (!filas || filas.length === 0) return vacio(textoVacio);
  return h('div', { class: 'tabla-envoltura' },
    h('table', { class: 'responsiva' },
      h('thead', {}, h('tr', {}, columnas.map((c) => h('th', { class: c.clase || null, scope: 'col' }, c.titulo)))),
      h('tbody', {}, filas.map((f) => h('tr', {},
        columnas.map((c) => {
          const v = c.valor(f);
          return h('td', { class: c.clase || null, 'data-etiqueta': c.titulo }, v === null || v === undefined || v === '' ? '—' : v);
        }))))));
}

// ---------------------------------------------------------------- Diálogos
const dialogo = () => document.getElementById('dialogo');

// Abre un diálogo con contenido libre. Devuelve una función para cerrarlo.
export function abrirDialogo(titulo, cuerpo, pie = null) {
  const d = dialogo();
  limpiar(d,
    h('div', { class: 'cabeza' }, h('h2', {}, titulo)),
    h('div', { class: 'cuerpo' }, cuerpo),
    pie ? h('div', { class: 'pie' }, pie) : null);
  if (!d.open) d.showModal();
  const cerrar = () => { if (d.open) d.close(); };
  return cerrar;
}

// Diálogo con formulario: el diálogo se cierra solo si alEnviar termina bien.
export function dialogoFormulario(titulo, opciones) {
  let cerrar;
  const cancelar = h('button', { type: 'button', onclick: () => cerrar() }, 'Cancelar');
  const form = formulario({
    ...opciones,
    extras: [cancelar],
    alEnviar: async (datos, f) => { await opciones.alEnviar(datos, f); cerrar(); },
  });
  cerrar = abrirDialogo(titulo, [opciones.introduccion || null, form]);
  const primero = form.querySelector('input:not([type=hidden]):not([readonly]), select, textarea');
  if (primero) primero.focus();
  return form;
}

// Confirmación de operaciones importantes. Devuelve true/false.
// detalle: [[etiqueta, valor], ...] se muestra como resumen.
export function confirmar({ titulo, mensaje: texto, detalle = [], aceptar = 'Confirmar', peligro = false }) {
  return new Promise((resolver) => {
    let cerrar;
    let respondido = false;
    const responder = (v) => { if (respondido) return; respondido = true; cerrar(); resolver(v); };
    const si = h('button', { type: 'button', class: peligro ? 'boton-peligro' : 'primario', onclick: () => responder(true) }, aceptar);
    const no = h('button', { type: 'button', onclick: () => responder(false) }, 'Cancelar');
    cerrar = abrirDialogo(titulo, [
      texto ? h('p', {}, texto) : null,
      detalle.length ? h('dl', { class: 'resumen-confirmacion' }, detalle.map(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])) : null,
    ], [no, si]);
    dialogo().addEventListener('close', () => responder(false), { once: true });
    no.focus();
  });
}

// Pide un texto obligatorio (por ejemplo, el motivo de una anulación). Devuelve el texto o null.
export function pedirTexto({ titulo, mensaje: texto, etiqueta, aceptar = 'Aceptar', minimo = 5, peligro = false }) {
  return new Promise((resolver) => {
    let cerrar;
    let respondido = false;
    const responder = (v) => { if (respondido) return; respondido = true; cerrar(); resolver(v); };
    const area = h('textarea', { name: 'texto', required: true, minlength: minimo, maxlength: 300 });
    const error = h('div');
    const form = h('form', {},
      texto ? h('p', {}, texto) : null,
      campo(etiqueta, area, `Mínimo ${minimo} caracteres.`), error,
      h('div', { class: 'pie-formulario' },
        h('button', { type: 'button', onclick: () => responder(null) }, 'Cancelar'),
        h('button', { type: 'submit', class: peligro ? 'boton-peligro' : 'primario' }, aceptar)));
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const v = area.value.trim();
      if (v.length < minimo) { limpiar(error, mensaje(`Escriba al menos ${minimo} caracteres.`, 'error')); return; }
      responder(v);
    });
    cerrar = abrirDialogo(titulo, form);
    dialogo().addEventListener('close', () => responder(null), { once: true });
    area.focus();
  });
}

// Tarjeta de indicador del panel.
export const indicador = (etiqueta, valor, detalle, destacado = false) =>
  h('div', { class: `indicador${destacado ? ' destacado' : ''}` },
    h('div', { class: 'etiqueta' }, etiqueta),
    h('div', { class: 'valor' }, valor),
    detalle ? h('div', { class: 'detalle' }, detalle) : null);

// Genera una contraseña temporal legible (letras y números).
export function claveTemporal() {
  const letras = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';
  const numeros = '23456789';
  const azar = (s) => s[crypto.getRandomValues(new Uint32Array(1))[0] % s.length];
  let c = '';
  for (let i = 0; i < 6; i += 1) c += azar(letras);
  for (let i = 0; i < 4; i += 1) c += azar(numeros);
  return c;
}
