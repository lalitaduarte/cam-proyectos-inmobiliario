// Propietarios: búsqueda, registro, edición, activación, contraseña y ficha.
import { obtener, enviar, actualizar, modificar, eliminar, parametros } from '../api.js';
import {
  h, limpiar, conCarga, tabla, insignia, pesos, fecha, fechaHora, campo, entrada, selector, dialogoFormulario,
  confirmar, avisar, conBotonOcupado, claveTemporal, mensaje, abrirDialogo,
} from '../ui.js';

// Muestra la contraseña temporal en un diálogo que no se cierra solo.
// Se abre después de cerrar el formulario (ambos usan el mismo diálogo).
function mostrarClave(nombre, cedula, clave) {
  setTimeout(() => {
    let cerrar;
    const ok = h('button', { class: 'primario', onclick: () => cerrar() }, 'Ya la anoté');
    cerrar = abrirDialogo('Contraseña temporal', [
      h('p', {}, `Entregue estos datos a ${nombre}. La contraseña no se volverá a mostrar.`),
      h('dl', { class: 'resumen-confirmacion' },
        h('dt', {}, 'Usuario (cédula)'), h('dd', {}, cedula),
        h('dt', {}, 'Contraseña temporal'), h('dd', { class: 'num' }, clave)),
      mensaje('Al ingresar por primera vez, el sistema le pedirá cambiarla.', 'info'),
    ], [ok]);
    ok.focus();
  }, 60);
}
import { dialogoAsignar } from './adquisiciones.js';

function camposPropietario(p = {}) {
  return [
    campo('Cédula', entrada({ name: 'cedula', required: true, inputmode: 'numeric', pattern: '[0-9.\\s]{5,15}', maxlength: 15, value: p.cedula || '' }),
      'Solo números (5 a 12 dígitos).'),
    campo('Nombre completo', entrada({ name: 'nombre_completo', required: true, minlength: 3, maxlength: 120, value: p.nombre_completo || '' })),
    campo('Correo electrónico', entrada({ name: 'correo', type: 'email', required: true, maxlength: 254, value: p.correo || '' })),
    campo('Teléfono (opcional)', entrada({ name: 'telefono', type: 'tel', maxlength: 20, value: p.telefono || '' })),
  ];
}

function campoClaveTemporal() {
  const input = entrada({ name: 'clave_temporal', required: true, minlength: 8, maxlength: 72, value: claveTemporal(), autocomplete: 'off' });
  const generar = h('button', { type: 'button', class: 'pequeno', onclick: () => { input.value = claveTemporal(); } }, 'Generar otra');
  const c = campo('Contraseña temporal', input, 'Entréguela al propietario. Deberá cambiarla en su primer ingreso.');
  c.append(generar);
  return c;
}

function nuevoPropietario(alGuardar) {
  dialogoFormulario('Registrar propietario', {
    campos: [...camposPropietario(), campoClaveTemporal()],
    textoEnviar: 'Registrar',
    alEnviar: async (d) => {
      const p = await enviar('/propietarios', d);
      avisar(`Propietario ${p.nombre_completo} registrado.`);
      mostrarClave(p.nombre_completo, p.cedula, d.clave_temporal);
      alGuardar(p);
    },
  });
}

function editarPropietario(p, alGuardar) {
  dialogoFormulario('Editar propietario', {
    campos: camposPropietario(p),
    alEnviar: async (d) => {
      await actualizar(`/propietarios/${p.id}`, d);
      avisar('Datos actualizados.');
      alGuardar();
    },
  });
}

async function cambiarEstado(p, boton, alGuardar) {
  const activar = !p.activo;
  const ok = await confirmar({
    titulo: activar ? 'Activar propietario' : 'Desactivar propietario',
    mensaje: activar
      ? 'El propietario podrá volver a ingresar a la comunidad.'
      : 'El propietario no podrá ingresar ni publicar ofertas. Conserva sus semanas, pagos e historial.',
    detalle: [['Propietario', p.nombre_completo], ['Cédula', p.cedula]],
    aceptar: activar ? 'Activar' : 'Desactivar',
    peligro: !activar,
  });
  if (!ok) return;
  await conBotonOcupado(boton, '…', async () => {
    try {
      await modificar(`/propietarios/${p.id}/estado`, { activo: activar });
      avisar(activar ? 'Propietario activado.' : 'Propietario desactivado.');
      alGuardar();
    } catch (err) { avisar(err.message, 'error'); }
  });
}

function restablecerClave(p) {
  dialogoFormulario('Restablecer contraseña', {
    introduccion: h('p', {}, `Se asignará una nueva contraseña temporal a ${p.nombre_completo}. Deberá cambiarla al ingresar.`),
    campos: [campoClaveTemporal()],
    textoEnviar: 'Restablecer',
    alEnviar: async (d) => {
      await enviar(`/propietarios/${p.id}/restablecer-clave`, d);
      avisar('Contraseña restablecida.');
      mostrarClave(p.nombre_completo, p.cedula, d.clave_temporal);
    },
  });
}

async function eliminarPropietario(p, boton, alGuardar) {
  const ok = await confirmar({
    titulo: 'Eliminar propietario',
    mensaje: 'Solo se puede eliminar un propietario sin adquisiciones ni mensajes. Esta acción no se puede deshacer.',
    detalle: [['Propietario', p.nombre_completo], ['Cédula', p.cedula]],
    aceptar: 'Eliminar', peligro: true,
  });
  if (!ok) return;
  await conBotonOcupado(boton, '…', async () => {
    try {
      await eliminar(`/propietarios/${p.id}`);
      avisar('Propietario eliminado.');
      alGuardar();
    } catch (err) { avisar(err.message, 'error'); }
  });
}

// ---------------------------------------------------------------- Lista
async function lista(main) {
  const q = entrada({ name: 'q', type: 'search', placeholder: 'Cédula o nombre', maxlength: 120 });
  const estado = selector('activo', [['', 'Todos'], ['true', 'Activos'], ['false', 'Inactivos']]);
  const resultado = h('div');
  const cargar = () => conCarga(resultado, async () => {
    const filas = await obtener(`/propietarios${parametros({ q: q.value.trim(), activo: estado.value })}`);
    limpiar(resultado,
      h('p', { class: 'texto-suave texto-pequeno' }, `${filas.length} propietario(s)`),
      tabla([
        { titulo: 'Cédula', valor: (p) => p.cedula },
        { titulo: 'Nombre', valor: (p) => h('a', { href: `#/propietarios/${p.id}` }, p.nombre_completo) },
        { titulo: 'Correo', valor: (p) => p.correo },
        { titulo: 'Teléfono', valor: (p) => p.telefono },
        { titulo: 'Semanas', valor: (p) => String(p.semanas_vigentes), clase: 'derecha' },
        { titulo: 'Estado', valor: (p) => insignia(p.activo ? 'ACTIVO' : 'INACTIVO') },
        {
          titulo: 'Acciones',
          valor: (p) => {
            const bEstado = h('button', { class: 'pequeno' }, p.activo ? 'Desactivar' : 'Activar');
            bEstado.addEventListener('click', () => cambiarEstado(p, bEstado, cargar));
            return h('div', { class: 'acciones' },
              h('a', { class: 'boton pequeno', href: `#/propietarios/${p.id}` }, 'Ver'),
              h('button', { class: 'pequeno', onclick: () => editarPropietario(p, cargar) }, 'Editar'),
              bEstado);
          },
        },
      ], filas, q.value || estado.value ? 'Ningún propietario coincide con la búsqueda.' : 'Aún no hay propietarios registrados.'));
  });
  let espera;
  q.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(cargar, 300); });
  estado.addEventListener('change', cargar);

  limpiar(main,
    h('div', { class: 'encabezado' },
      h('div', {}, h('h1', {}, 'Propietarios'), h('p', {}, 'Personas que adquieren semanas de la vivienda.')),
      h('button', { class: 'primario', onclick: () => nuevoPropietario((p) => { location.hash = `#/propietarios/${p.id}`; }) }, 'Registrar propietario')),
    h('div', { class: 'tarjeta' },
      h('form', { class: 'filtros', role: 'search', onsubmit: (e) => { e.preventDefault(); cargar(); } },
        campo('Buscar', q), campo('Estado', estado)),
      resultado));
  await cargar();
}

// ---------------------------------------------------------------- Ficha
async function ficha(main, id) {
  await conCarga(main, async () => {
    const p = await obtener(`/propietarios/${id}`);
    const recargar = () => ficha(main, id);
    const bEstado = h('button', {}, p.activo ? 'Desactivar' : 'Activar');
    bEstado.addEventListener('click', () => cambiarEstado(p, bEstado, recargar));
    const bEliminar = h('button', { class: 'peligro' }, 'Eliminar');
    bEliminar.addEventListener('click', () => eliminarPropietario(p, bEliminar, () => { location.hash = '#/propietarios'; }));

    limpiar(main,
      h('p', {}, h('a', { href: '#/propietarios' }, '← Volver a propietarios')),
      h('div', { class: 'encabezado' },
        h('div', {}, h('h1', {}, p.nombre_completo), h('p', {}, `C.C. ${p.cedula} · `, insignia(p.activo ? 'ACTIVO' : 'INACTIVO'))),
        h('div', { class: 'acciones' },
          h('button', { onclick: () => editarPropietario(p, recargar) }, 'Editar'),
          bEstado,
          h('button', { onclick: () => restablecerClave(p) }, 'Restablecer contraseña'),
          p.adquisiciones.length === 0 ? bEliminar : null)),
      h('div', { class: 'rejilla rejilla-2' },
        h('section', { class: 'tarjeta' },
          h('h2', {}, 'Datos'),
          h('dl', { class: 'resumen-confirmacion' },
            h('dt', {}, 'Correo'), h('dd', {}, p.correo),
            h('dt', {}, 'Teléfono'), h('dd', {}, p.telefono || '—'),
            h('dt', {}, 'Registrado'), h('dd', {}, fechaHora(p.creado_en)),
            h('dt', {}, 'Último ingreso'), h('dd', {}, p.ultimo_acceso ? fechaHora(p.ultimo_acceso) : 'Nunca'),
            h('dt', {}, 'Contraseña'), h('dd', {}, p.debe_cambiar_clave ? 'Temporal (pendiente de cambio)' : 'Personal')))),
      h('section', { class: 'tarjeta' },
        h('div', { class: 'encabezado' },
          h('h2', {}, `Semanas adquiridas (${p.adquisiciones.length})`),
          p.activo ? h('button', { class: 'primario', onclick: () => dialogoAsignar({ propietarioId: p.id }, recargar) }, 'Asignar semana') : null),
        p.activo ? null : mensaje('El propietario está inactivo: no se le pueden asignar semanas.', 'info'),
        tabla([
          { titulo: 'Semana', valor: (a) => `Semana ${a.semana_numero}` },
          { titulo: 'Adquirida', valor: (a) => fecha(a.fecha_adquisicion) },
          { titulo: 'Titularidad', valor: (a) => insignia(a.estado_titularidad) },
          { titulo: 'Plan', valor: (a) => `${a.numero_cuotas} × ${pesos(a.valor_cuota)}` },
          { titulo: 'Cuotas pagadas', valor: (a) => `${a.cuotas_pagadas} de ${a.numero_cuotas}`, clase: 'derecha' },
          { titulo: 'Abonado', valor: (a) => pesos(a.total_abonado), clase: 'derecha num' },
          { titulo: 'Saldo', valor: (a) => pesos(a.saldo), clase: 'derecha num' },
          { titulo: 'Situación', valor: (a) => insignia(a.situacion_pago) },
          { titulo: '', valor: (a) => h('a', { class: 'boton pequeno', href: `#/estado-cuenta/${a.adquisicion_id}` }, 'Estado de cuenta') },
        ], p.adquisiciones, 'Este propietario aún no tiene semanas.')));
  });
}

export default {
  titulo: 'Propietarios',
  async render(main, [id]) {
    if (id) return ficha(main, id);
    return lista(main);
  },
};
