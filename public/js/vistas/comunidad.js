// Comunidad de propietarios: ofertas de venta o intercambio y mensajes.
// Publicar o cerrar una oferta NO cambia la titularidad de la semana.
import { obtener, enviar, eliminar, parametros } from '../api.js';
import {
  h, limpiar, conCarga, insignia, pesos, fechaHora, campo, entrada, selector, mensaje, vacio, confirmar, avisar,
  conBotonOcupado, abrirDialogo, datosFormulario,
} from '../ui.js';

const esSecretaria = (s) => s.rol === 'SECRETARIA';

// ---------------------------------------------------------------- Publicar
async function dialogoPublicar(alGuardar) {
  let cerrar = abrirDialogo('Publicar oferta', h('div', { class: 'cargando' }, 'Cargando sus semanas…'));
  let semanas;
  try {
    semanas = (await obtener('/ofertas/mias')).semanas.filter((s) => !s.tiene_oferta_activa);
  } catch (err) {
    cerrar = abrirDialogo('Publicar oferta', mensaje(err.message, 'error'), [h('button', { onclick: () => cerrar() }, 'Cerrar')]);
    return;
  }
  if (semanas.length === 0) {
    cerrar = abrirDialogo('Publicar oferta',
      mensaje('No tiene semanas disponibles para ofertar: o no es titular de ninguna, o todas ya tienen una oferta activa.', 'info'),
      [h('button', { onclick: () => cerrar() }, 'Cerrar')]);
    return;
  }
  const precio = entrada({ name: 'precio', inputmode: 'numeric', placeholder: 'Ej.: 19500000' });
  const campoPrecio = campo('Precio de venta (COP)', precio, 'Obligatorio y mayor que cero para una venta.');
  const radios = h('div', { class: 'opciones-radio', role: 'radiogroup', 'aria-label': 'Tipo de oferta' },
    h('label', {}, h('input', { type: 'radio', name: 'tipo', value: 'INTERCAMBIO', checked: true }), 'Intercambio'),
    h('label', {}, h('input', { type: 'radio', name: 'tipo', value: 'VENTA' }), 'Venta'));
  const ajustarPrecio = () => {
    const venta = radios.querySelector('input:checked').value === 'VENTA';
    campoPrecio.classList.toggle('oculto', !venta);
    precio.required = venta;
    if (!venta) precio.value = '';
  };
  radios.addEventListener('change', ajustarPrecio);
  ajustarPrecio();
  const error = h('div');
  const boton = h('button', { type: 'submit', class: 'primario' }, 'Publicar');
  const form = h('form', {},
    h('div', { class: 'campos' },
      campo('Semana', selector('adquisicion_id', semanas.map((s) => [s.adquisicion_id, `Semana ${s.semana_numero}`]), { required: true }),
        'Solo sus semanas con titularidad actual y sin otra oferta activa.'),
      h('div', { class: 'campo' }, h('span', { class: 'etiqueta' }, 'Tipo de oferta'), radios),
      campoPrecio,
      campo('Descripción', h('textarea', { name: 'descripcion', required: true, minlength: 5, maxlength: 1000, placeholder: 'Qué ofrece y qué busca a cambio' }))),
    mensaje('Publicar una oferta no transfiere su semana. Un cambio de titular se formaliza directamente con CAM.', 'info'),
    error,
    h('div', { class: 'pie-formulario' }, h('button', { type: 'button', onclick: () => cerrar() }, 'Cancelar'), boton));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    limpiar(error);
    const d = datosFormulario(form);
    if (d.tipo === 'INTERCAMBIO') delete d.precio;
    await conBotonOcupado(boton, 'Publicando…', async () => {
      try {
        const o = await enviar('/ofertas', d);
        cerrar();
        avisar('Oferta publicada.');
        alGuardar(o);
      } catch (err) { limpiar(error, mensaje(err.message, 'error')); }
    });
  });
  cerrar = abrirDialogo('Publicar oferta', form);
}

// ---------------------------------------------------------------- Cerrar / eliminar
async function cerrarOferta(o, estado, boton, alGuardar) {
  const retirar = estado === 'RETIRADA';
  const ok = await confirmar({
    titulo: retirar ? 'Retirar oferta' : 'Marcar como concretada',
    mensaje: `${retirar ? 'La oferta dejará de aparecer en la comunidad.' : 'La oferta quedará como concretada.'} No admitirá mensajes nuevos. La titularidad de la semana NO cambia.`,
    detalle: [['Semana', String(o.semana_numero)], ['Tipo', o.tipo === 'VENTA' ? `Venta · ${pesos(o.precio)}` : 'Intercambio']],
    aceptar: retirar ? 'Retirar oferta' : 'Marcar concretada',
    peligro: retirar,
  });
  if (!ok) return;
  await conBotonOcupado(boton, '…', async () => {
    try { await enviar(`/ofertas/${o.oferta_id}/cerrar`, { estado }); avisar(retirar ? 'Oferta retirada.' : 'Oferta marcada como concretada.'); alGuardar(); } catch (err) { avisar(err.message, 'error'); }
  });
}

async function eliminarOferta(o, boton, alGuardar) {
  const ok = await confirmar({
    titulo: 'Eliminar oferta', mensaje: 'Úselo solo si la publicó por error. Una oferta con mensajes no se puede eliminar; en ese caso retírela.',
    aceptar: 'Eliminar', peligro: true,
  });
  if (!ok) return;
  await conBotonOcupado(boton, '…', async () => {
    try { await eliminar(`/ofertas/${o.oferta_id}`); avisar('Oferta eliminada.'); alGuardar(); } catch (err) { avisar(err.message, 'error'); }
  });
}

function botonesGestion(o, sesion, alGuardar) {
  if (o.estado !== 'ACTIVA' || !(o.es_mia || esSecretaria(sesion))) return [];
  const mk = (texto, fn, clase = 'pequeno') => { const b = h('button', { type: 'button', class: clase }, texto); b.addEventListener('click', () => fn(b)); return b; };
  return [
    mk('Retirar', (b) => cerrarOferta(o, 'RETIRADA', b, alGuardar), 'pequeno peligro'),
    mk('Marcar concretada', (b) => cerrarOferta(o, 'CONCRETADA', b, alGuardar)),
    o.total_mensajes === 0 ? mk('Eliminar', (b) => eliminarOferta(o, b, alGuardar), 'pequeno peligro') : null,
  ];
}

function tarjetaOferta(o, sesion, alGuardar) {
  return h('article', { class: 'tarjeta oferta' },
    h('div', { class: 'acciones' }, insignia(o.tipo), o.estado !== 'ACTIVA' ? insignia(o.estado) : null, o.es_mia ? insignia('MIA', 'Mi oferta') : null),
    h('h3', {}, `Semana ${o.semana_numero}`),
    o.tipo === 'VENTA' ? h('div', { class: 'precio' }, pesos(o.precio)) : null,
    h('p', {}, o.descripcion),
    h('p', { class: 'texto-suave texto-pequeno' }, `${o.autor_nombre} · ${fechaHora(o.publicada_en)}`),
    h('div', { class: 'acciones' },
      h('a', { class: 'boton pequeno primario', href: `#/comunidad/${o.oferta_id}` }, `Ver conversación (${o.total_mensajes})`),
      botonesGestion(o, sesion, alGuardar)));
}

// ---------------------------------------------------------------- Detalle con mensajes
async function detalle(main, id, sesion) {
  await conCarga(main, async () => {
    const [o, mensajes] = await Promise.all([obtener(`/ofertas/${id}`), obtener(`/ofertas/${id}/mensajes`)]);
    const recargar = () => detalle(main, id, sesion);
    const conversacion = h('div', { class: 'conversacion', 'aria-live': 'polite' },
      mensajes.length === 0 ? vacio('Aún no hay mensajes. Escriba el primero.') : mensajes.map((m) =>
        h('div', { class: `burbuja${m.es_mio ? ' mia' : ''}` },
          h('div', { class: 'autor' }, m.es_mio ? 'Usted' : m.autor_nombre),
          h('p', {}, m.texto),
          h('div', { class: 'hora' }, fechaHora(m.enviado_en)))));

    let envio;
    if (o.estado === 'ACTIVA') {
      const texto = h('textarea', { name: 'texto', required: true, maxlength: 1000, placeholder: 'Escriba su mensaje…' });
      const zonaError = h('div');
      const boton = h('button', { type: 'submit', class: 'primario' }, 'Enviar mensaje');
      envio = h('form', {}, campo('Mensaje', texto, 'Máximo 1000 caracteres. Todos los participantes de la comunidad pueden leer esta conversación.'), zonaError,
        h('div', { class: 'pie-formulario' }, boton));
      envio.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        limpiar(zonaError);
        await conBotonOcupado(boton, 'Enviando…', async () => {
          try { await enviar(`/ofertas/${id}/mensajes`, { texto: texto.value }); await recargar(); } catch (err) { limpiar(zonaError, mensaje(err.message, 'error')); }
        });
      });
    } else {
      envio = mensaje(`Esta oferta está ${o.estado === 'RETIRADA' ? 'retirada' : 'concretada'}: no admite mensajes nuevos.`, 'info');
    }

    limpiar(main,
      h('p', {}, h('a', { href: '#/comunidad' }, '← Volver a la comunidad')),
      h('div', { class: 'encabezado' },
        h('div', {}, h('h1', {}, `Semana ${o.semana_numero} · ${o.tipo === 'VENTA' ? 'Venta' : 'Intercambio'}`),
          h('p', {}, `Publicada por ${o.autor_nombre} el ${fechaHora(o.publicada_en)} · `, insignia(o.estado))),
        h('div', { class: 'acciones' }, botonesGestion(o, sesion, () => { location.hash = '#/comunidad'; }))),
      h('div', { class: 'rejilla rejilla-2' },
        h('section', { class: 'tarjeta' },
          h('h2', {}, 'Oferta'),
          o.tipo === 'VENTA' ? h('p', { class: 'precio' }, h('strong', {}, `Precio: ${pesos(o.precio)}`)) : null,
          h('p', {}, o.descripcion),
          mensaje('Los acuerdos entre propietarios no cambian la titularidad automáticamente. Cualquier cambio se formaliza con CAM.', 'info')),
        h('section', { class: 'tarjeta' }, h('h2', {}, `Conversación (${mensajes.length})`), conversacion, envio)));
    conversacion.scrollTop = conversacion.scrollHeight;
  });
}

// ---------------------------------------------------------------- Lista
async function lista(main, sesion) {
  const tipo = selector('tipo', [['', 'Todos'], ['VENTA', 'Venta'], ['INTERCAMBIO', 'Intercambio']]);
  const desde = entrada({ type: 'date', name: 'desde' });
  const estado = esSecretaria(sesion)
    ? selector('estado', [['ACTIVA', 'Activas'], ['RETIRADA', 'Retiradas'], ['CONCRETADA', 'Concretadas'], ['TODAS', 'Todas']])
    : null;
  const zona = h('div');
  const mias = h('div');

  const cargar = () => conCarga(zona, async () => {
    const filas = await obtener(`/ofertas${parametros({ tipo: tipo.value, desde: desde.value, estado: estado ? estado.value : '' })}`);
    limpiar(zona,
      h('p', { class: 'texto-suave texto-pequeno' }, `${filas.length} oferta(s)`),
      filas.length ? h('div', { class: 'ofertas' }, filas.map((o) => tarjetaOferta(o, sesion, recargar)))
        : vacio(tipo.value || desde.value ? 'Ninguna oferta coincide con los filtros.' : 'No hay ofertas activas en este momento.'));
  });
  const cargarMias = () => conCarga(mias, async () => {
    const { ofertas } = await obtener('/ofertas/mias');
    limpiar(mias, ofertas.length
      ? h('div', { class: 'ofertas' }, ofertas.map((o) => tarjetaOferta(o, sesion, recargar)))
      : vacio('Aún no ha publicado ofertas.'));
  });
  const recargar = () => Promise.all([cargar(), esSecretaria(sesion) ? null : cargarMias()]);

  [tipo, desde, estado].filter(Boolean).forEach((c) => c.addEventListener('change', cargar));
  limpiar(main,
    h('div', { class: 'encabezado' },
      h('div', {}, h('h1', {}, 'Comunidad de propietarios'),
        h('p', {}, esSecretaria(sesion) ? 'Supervisión de ofertas y conversaciones.' : 'Ofertas de venta o intercambio de semanas entre propietarios.')),
      esSecretaria(sesion) ? null : h('button', { class: 'primario', onclick: () => dialogoPublicar(recargar) }, 'Publicar oferta')),
    h('section', { class: 'tarjeta' },
      h('h2', {}, esSecretaria(sesion) ? 'Ofertas' : 'Ofertas activas'),
      h('div', { class: 'filtros' }, campo('Tipo', tipo), campo('Publicadas desde', desde), estado ? campo('Estado', estado) : null),
      zona),
    esSecretaria(sesion) ? null : h('section', { class: 'tarjeta' }, h('h2', {}, 'Mis ofertas (todas)'), mias));
  await recargar();
}

export default {
  titulo: 'Comunidad',
  async render(main, [id], sesion) {
    if (id) return detalle(main, id, sesion);
    return lista(main, sesion);
  },
};
