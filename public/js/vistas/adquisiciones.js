// Adquisiciones (asignación de una semana a un propietario).
import { obtener, enviar, parametros } from '../api.js';
import {
  h, limpiar, conCarga, tabla, insignia, pesos, fecha, campo, entrada, selector, abrirDialogo, mensaje,
  avisar, conBotonOcupado, hoy, datosFormulario,
} from '../ui.js';

// Diálogo para asignar una semana disponible. Lo usan esta pantalla y la ficha del propietario.
export async function dialogoAsignar({ propietarioId } = {}, alGuardar = () => {}) {
  let cerrar = abrirDialogo('Asignar semana', h('div', { class: 'cargando' }, 'Cargando…'));
  let datos;
  try {
    const [props, disponibles, param] = await Promise.all([
      obtener('/propietarios?activo=true'), obtener('/semanas/disponibles'), obtener('/parametros'),
    ]);
    datos = { props, disponibles, vigente: param.vigente };
  } catch (err) {
    cerrar = abrirDialogo('Asignar semana', mensaje(err.message, 'error'), [h('button', { onclick: () => cerrar() }, 'Cerrar')]);
    return;
  }
  if (!datos.vigente) {
    cerrar = abrirDialogo('Asignar semana', mensaje('Primero configure los parámetros de la acción.', 'error'),
      [h('button', { onclick: () => cerrar() }, 'Cerrar')]);
    return;
  }
  if (datos.disponibles.length === 0) {
    cerrar = abrirDialogo('Asignar semana', mensaje('No hay semanas disponibles: todas tienen titular actual.', 'info'),
      [h('button', { onclick: () => cerrar() }, 'Cerrar')]);
    return;
  }
  const selProp = selector('propietario_id',
    [['', 'Seleccione…'], ...datos.props.map((p) => [p.id, `${p.nombre_completo} · C.C. ${p.cedula}`])], { required: true });
  if (propietarioId) selProp.value = String(propietarioId);
  const selSemana = selector('semana_id', [['', 'Seleccione…'], ...datos.disponibles.map((s) => [s.semana_id, `Semana ${s.numero}`])], { required: true });
  const v = datos.vigente;
  const error = h('div');
  const boton = h('button', { type: 'submit', class: 'primario' }, 'Asignar');
  const form = h('form', {},
    mensaje(`Condiciones que se copiarán a esta adquisición: ${pesos(v.valor_accion)} en ${v.numero_cuotas} cuotas de ${pesos(v.valor_cuota)}. Un cambio posterior de parámetros no las modificará.`, 'info'),
    h('div', { class: 'campos' },
      campo('Propietario', selProp, 'Solo propietarios activos.'),
      campo('Semana disponible', selSemana),
      campo('Fecha de adquisición', entrada({ name: 'fecha_adquisicion', type: 'date', required: true, max: hoy(), value: hoy() })),
      campo('Observación (opcional)', entrada({ name: 'observacion', maxlength: 300 }))),
    error,
    h('div', { class: 'pie-formulario' }, h('button', { type: 'button', onclick: () => cerrar() }, 'Cancelar'), boton));

  // Dos pasos: 1) revisar el resumen, 2) confirmar. Cambiar un dato vuelve al paso 1.
  let confirmando = false;
  form.addEventListener('input', () => { confirmando = false; boton.textContent = 'Asignar'; limpiar(error); });
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const d = datosFormulario(form);
    if (!confirmando) {
      const prop = datos.props.find((p) => String(p.id) === d.propietario_id);
      const sem = datos.disponibles.find((s) => String(s.semana_id) === d.semana_id);
      limpiar(error, h('div', { class: 'mensaje alerta' },
        h('strong', {}, '¿Confirma la asignación?'),
        h('dl', { class: 'resumen-confirmacion' },
          h('dt', {}, 'Propietario'), h('dd', {}, prop ? prop.nombre_completo : '—'),
          h('dt', {}, 'Semana'), h('dd', {}, sem ? `Semana ${sem.numero}` : '—'),
          h('dt', {}, 'Fecha'), h('dd', {}, fecha(d.fecha_adquisicion)),
          h('dt', {}, 'Plan'), h('dd', {}, `${v.numero_cuotas} cuotas de ${pesos(v.valor_cuota)}`))));
      confirmando = true;
      boton.textContent = 'Confirmar asignación';
      boton.focus();
      return;
    }
    await conBotonOcupado(boton, 'Asignando…', async () => {
      try {
        const r = await enviar('/adquisiciones', d);
        cerrar();
        avisar(`Semana ${r.semana_numero} asignada a ${r.nombre_completo}.`);
        alGuardar(r);
      } catch (err) {
        confirmando = false;
        limpiar(error, mensaje(err.message, 'error'));
      }
    });
    boton.textContent = confirmando ? 'Confirmar asignación' : 'Asignar';
  });
  cerrar = abrirDialogo('Asignar semana', form);
  selProp.focus();
}

const TIPOS = [['VENTA', 'Venta'], ['CESION', 'Cesión (donación, herencia u otra entrega sin venta)'], ['INTERCAMBIO', 'Intercambio'], ['OTRO', 'Otro']];

// Diálogo de CAMBIO DE TITULAR (cesión, venta, intercambio). Regla D16: el
// nuevo titular asume el saldo; los pagos hechos quedan en el historial del anterior.
// ec: fila de v_estado_cuenta de la adquisición VIGENTE.
export async function dialogoTransferir(ec, alGuardar = () => {}) {
  const titulo = `Cambiar titular · Semana ${ec.semana_numero}`;
  let cerrar = abrirDialogo(titulo, h('div', { class: 'cargando' }, 'Cargando…'));
  let props;
  try {
    props = (await obtener('/propietarios?activo=true')).filter((p) => p.id !== ec.propietario_id);
  } catch (err) {
    cerrar = abrirDialogo(titulo, mensaje(err.message, 'error'), [h('button', { onclick: () => cerrar() }, 'Cerrar')]);
    return;
  }
  if (ec.cuotas_por_verificar > 0) {
    cerrar = abrirDialogo(titulo,
      mensaje(`${ec.nombre_completo} tiene ${ec.cuotas_por_verificar} pago(s) registrados sin verificar. Verifíquelos o anúlelos antes de cambiar el titular: así queda claro cuánto saldo asume el nuevo titular.`, 'alerta'),
      [h('a', { class: 'boton', href: `#/pagos/${ec.adquisicion_id}`, onclick: () => cerrar() }, 'Ir a pagos'), h('button', { onclick: () => cerrar() }, 'Cerrar')]);
    return;
  }
  if (props.length === 0) {
    cerrar = abrirDialogo(titulo, mensaje('No hay otro propietario activo. Registre primero al nuevo titular en Propietarios.', 'info'),
      [h('button', { onclick: () => cerrar() }, 'Cerrar')]);
    return;
  }
  const selProp = selector('nuevo_propietario_id',
    [['', 'Seleccione…'], ...props.map((p) => [p.id, `${p.nombre_completo} · C.C. ${p.cedula}`])], { required: true });
  const selTipo = selector('tipo', [['', 'Seleccione…'], ...TIPOS], { required: true });
  const error = h('div');
  const boton = h('button', { type: 'submit', class: 'primario' }, 'Revisar');
  const form = h('form', {},
    mensaje(`El nuevo titular asume el saldo: ${pesos(ec.saldo)} (${ec.cuotas_pendientes} cuota(s) pendientes de ${pesos(ec.valor_cuota)}). Las ${ec.cuotas_pagadas} cuota(s) ya pagadas quedan en el historial y no se vuelven a cobrar.`, 'info'),
    h('div', { class: 'campos' },
      campo('Titular actual', entrada({ value: ec.nombre_completo, readonly: true, tabindex: '-1' })),
      campo('Nuevo titular', selProp, 'Solo propietarios activos. Si no aparece, regístrelo primero en Propietarios.'),
      campo('Tipo', selTipo),
      campo('Fecha de la transferencia', entrada({ name: 'fecha', type: 'date', required: true, min: ec.fecha_adquisicion, max: hoy(), value: hoy() }),
        'La fecha del contrato o documento. No puede ser futura.'),
      campo('Soporte', entrada({ name: 'soporte', required: true, minlength: 5, maxlength: 300, placeholder: 'Ej.: contrato de compraventa del 03/11/2026' }),
        'Documento que respalda el cambio. Queda en la auditoría.')),
    error,
    h('div', { class: 'pie-formulario' }, h('button', { type: 'button', onclick: () => cerrar() }, 'Cancelar'), boton));

  // Dos pasos, como en la asignación: revisar el resumen y luego confirmar.
  let confirmando = false;
  form.addEventListener('input', () => { confirmando = false; boton.textContent = 'Revisar'; limpiar(error); });
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const d = datosFormulario(form);
    if (!confirmando) {
      const nuevo = props.find((p) => String(p.id) === d.nuevo_propietario_id);
      limpiar(error, h('div', { class: 'mensaje alerta' },
        h('strong', {}, '¿Confirma el cambio de titular? No se puede deshacer.'),
        h('dl', { class: 'resumen-confirmacion' },
          h('dt', {}, 'Semana'), h('dd', {}, `Semana ${ec.semana_numero}`),
          h('dt', {}, 'Deja de ser titular'), h('dd', {}, ec.nombre_completo),
          h('dt', {}, 'Nuevo titular'), h('dd', {}, nuevo ? nuevo.nombre_completo : '—'),
          h('dt', {}, 'Tipo'), h('dd', {}, (TIPOS.find((t) => t[0] === d.tipo) || ['', '—'])[1]),
          h('dt', {}, 'Fecha'), h('dd', {}, fecha(d.fecha)),
          h('dt', {}, 'Saldo que asume'), h('dd', {}, `${pesos(ec.saldo)} · ${ec.cuotas_pendientes} cuota(s)`)),
        ec.situacion_pago === 'PAGADA' ? h('p', {}, 'La semana ya está pagada por completo: el nuevo titular no debe cuotas.') : null,
        h('p', {}, 'Si la semana tiene una oferta activa en la comunidad, se cerrará.')));
      confirmando = true;
      boton.textContent = 'Confirmar cambio de titular';
      boton.focus();
      return;
    }
    await conBotonOcupado(boton, 'Guardando…', async () => {
      try {
        const r = await enviar(`/adquisiciones/${ec.adquisicion_id}/transferir`, d);
        cerrar();
        avisar(`Semana ${r.semana_numero}: el nuevo titular es ${r.nombre_completo}.`);
        alGuardar(r);
      } catch (err) {
        confirmando = false;
        limpiar(error, mensaje(err.message, 'error'));
      }
    });
    boton.textContent = confirmando ? 'Confirmar cambio de titular' : 'Revisar';
  });
  cerrar = abrirDialogo(titulo, form);
  selProp.focus();
}

export default {
  titulo: 'Adquisiciones',
  async render(main) {
    const q = entrada({ name: 'q', type: 'search', placeholder: 'Cédula, nombre o número de semana', maxlength: 120 });
    const situacion = selector('situacion', [['', 'Todas'], ['EN_CURSO', 'En curso'], ['PAGADA', 'Pagadas']]);
    const titularidad = selector('titularidad', [['VIGENTE', 'Titulares actuales'], ['TRANSFERIDA', 'Titulares anteriores'], ['', 'Todos']]);
    const resultado = h('div');
    const cargar = () => conCarga(resultado, async () => {
      const filas = await obtener(`/adquisiciones${parametros({ q: q.value.trim(), situacion: situacion.value, titularidad: titularidad.value })}`);
      limpiar(resultado,
        h('p', { class: 'texto-suave texto-pequeno' }, `${filas.length} adquisición(es)`),
        tabla([
          { titulo: 'Semana', valor: (a) => `Semana ${a.semana_numero}` },
          { titulo: 'Propietario', valor: (a) => h('a', { href: `#/propietarios/${a.propietario_id}` }, a.nombre_completo) },
          { titulo: 'Cédula', valor: (a) => a.cedula },
          { titulo: 'Desde', valor: (a) => [fecha(a.fecha_adquisicion), a.origen !== 'ASIGNACION' ? [' ', insignia(a.origen)] : null] },
          { titulo: 'Titularidad', valor: (a) => (a.estado_titularidad === 'VIGENTE' ? insignia('VIGENTE') : [insignia('TRANSFERIDA'), ` ${fecha(a.fecha_fin_titularidad)}`]) },
          { titulo: 'Condiciones', valor: (a) => `${pesos(a.valor_accion)} · ${a.numero_cuotas} × ${pesos(a.valor_cuota)}` },
          { titulo: 'Pagadas', valor: (a) => `${a.cuotas_pagadas}/${a.numero_cuotas}`, clase: 'derecha' },
          { titulo: 'Saldo', valor: (a) => pesos(a.saldo), clase: 'derecha num' },
          { titulo: 'Situación', valor: (a) => insignia(a.situacion_pago) },
          {
            titulo: 'Acciones',
            valor: (a) => h('div', { class: 'acciones' },
              h('a', { class: 'boton pequeno', href: `#/estado-cuenta/${a.adquisicion_id}` }, 'Estado de cuenta'),
              a.estado_titularidad === 'VIGENTE'
                ? h('button', { class: 'pequeno', type: 'button', onclick: () => dialogoTransferir(a, cargar) }, 'Cambiar titular') : null),
          },
        ], filas, 'No hay adquisiciones que coincidan.'));
    });
    let espera;
    q.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(cargar, 300); });
    situacion.addEventListener('change', cargar);
    titularidad.addEventListener('change', cargar);

    limpiar(main,
      h('div', { class: 'encabezado' },
        h('div', {}, h('h1', {}, 'Adquisiciones'),
          h('p', {}, 'Cada adquisición vincula una semana con su titular y tiene su propio plan de cuotas.')),
        h('button', { class: 'primario', onclick: () => dialogoAsignar({}, cargar) }, 'Asignar semana')),
      mensaje('Terminar de pagar no libera la semana. Para una venta, cesión o intercambio use "Cambiar titular": el nuevo titular asume el saldo y los pagos hechos quedan en el historial del anterior.', 'info'),
      h('div', { class: 'tarjeta' },
        h('form', { class: 'filtros', role: 'search', onsubmit: (e) => { e.preventDefault(); cargar(); } },
          campo('Buscar', q), campo('Titularidad', titularidad), campo('Situación de pago', situacion)),
        resultado));
    await cargar();
  },
};

