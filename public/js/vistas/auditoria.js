// Auditoría: quién hizo cada acción y cuándo (solo lectura, solo SECRETARIA).
import { obtener, parametros } from '../api.js';
import { h, limpiar, conCarga, tabla, pesos, fecha, fechaHora, campo, entrada, selector, mensaje, hoy } from '../ui.js';

const ACCIONES = {
  INICIAR_SESION: 'Inicio de sesión', CAMBIAR_CLAVE: 'Cambio de contraseña', RESTABLECER_CLAVE: 'Contraseña restablecida',
  CREAR: 'Creación', EDITAR: 'Edición', ELIMINAR: 'Eliminación', ACTIVAR: 'Activación', DESACTIVAR: 'Desactivación',
  REGISTRAR: 'Pago registrado', VERIFICAR: 'Pago verificado', REVERTIR_VERIFICACION: 'Verificación revertida', ANULAR: 'Pago anulado',
  EMITIR: 'Comprobante emitido', PUBLICAR: 'Oferta publicada', RETIRADA: 'Oferta retirada', CONCRETADA: 'Oferta concretada',
  TRANSFERIR: 'Cambio de titular',
};
const TABLAS = {
  usuario: 'Cuenta de usuario', propietario: 'Propietario', semana: 'Semana', semana_fecha: 'Fechas de semana',
  parametro_accion: 'Parámetros', adquisicion: 'Adquisición', pago: 'Pago', comprobante: 'Comprobante', oferta: 'Oferta',
};
const TIPOS = { VENTA: 'venta', CESION: 'cesión', INTERCAMBIO: 'intercambio', OTRO: 'otro' };

// Descripción legible del registro. Los datos vienen de la base y se muestran como texto.
function describir(r) {
  const d = r.detalle || {};
  switch (`${r.accion}:${r.tabla}`) {
    case 'TRANSFERIR:adquisicion':
      return `Semana ${d.semana}: de ${d.de} a ${d.a} por ${TIPOS[d.tipo] || d.tipo} el ${fecha(d.fecha)}. `
        + `Saldo asumido ${pesos(d.saldo_asumido)} (${d.cuotas_pagadas} cuotas ya pagadas). Soporte: ${d.soporte}.`
        + (d.ofertas_cerradas ? ` Se cerró ${d.ofertas_cerradas} oferta(s).` : '');
    case 'REGISTRAR:pago': return `Cuota ${d.cuota} por ${pesos(d.valor)} (adquisición ${d.adquisicion_id}).`;
    case 'ANULAR:pago': case 'REVERTIR_VERIFICACION:pago': return `Pago ${r.registro_id}. Motivo: ${d.motivo}.`;
    case 'EMITIR:comprobante': return `Comprobante ${d.numero} del pago ${d.pago_id}.`;
    case 'CREAR:adquisicion': return `Semana ${d.semana} asignada (propietario ${d.propietario_id}).`;
    case 'CREAR:parametro_accion': return `${pesos(d.valor_accion)} en ${d.numero_cuotas} cuotas de ${pesos(d.valor_cuota)}.`;
    case 'CREAR:propietario': return `Propietario ${r.registro_id}${d.cedula ? `, C.C. ${d.cedula}` : ''}.`;
    case 'CREAR:usuario': return d.origen ? `Cuenta ${d.rol || ''} creada con ${d.origen}.` : 'Cuenta creada.';
    case 'CREAR:semana_fecha': case 'EDITAR:semana_fecha': case 'ELIMINAR:semana_fecha':
      return `Semana ${d.semana}, año ${d.anio}: ${fecha(d.entrada)} a ${fecha(d.salida)}.`;
    default: {
      const extra = Object.entries(d).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ');
      return [r.registro_id ? `${TABLAS[r.tabla] || r.tabla} ${r.registro_id}` : '', extra].filter(Boolean).join(' · ');
    }
  }
}

export default {
  titulo: 'Auditoría',
  async render(main) {
    const hace30 = new Date(Date.now() - 30 * 864e5);
    const desde = entrada({ name: 'desde', type: 'date', value: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(hace30), max: hoy() });
    const hasta = entrada({ name: 'hasta', type: 'date', value: hoy(), max: hoy() });
    const accion = selector('accion', [['', 'Todas']]);
    const usuario = selector('usuario_id', [['', 'Todos']]);
    const resultado = h('div');
    let pagina = 1;
    let opcionesCargadas = false;

    const cargar = () => conCarga(resultado, async () => {
      const r = await obtener(`/auditoria${parametros({
        desde: desde.value, hasta: hasta.value, accion: accion.value, usuario_id: usuario.value, pagina,
      })}`);
      if (!opcionesCargadas) {   // las listas se llenan con lo que realmente existe en la auditoría
        limpiar(accion, h('option', { value: '' }, 'Todas'), r.acciones.map((a) => h('option', { value: a }, ACCIONES[a] || a)));
        limpiar(usuario, h('option', { value: '' }, 'Todos'),
          r.usuarios.map((u) => h('option', { value: u.id }, `${u.nombre} (${u.rol === 'SECRETARIA' ? 'secretaria' : 'propietario'})`)));
        opcionesCargadas = true;
      }
      const paginas = Math.max(1, Math.ceil(r.total / r.porPagina));
      const anterior = h('button', { type: 'button', class: 'pequeno', disabled: pagina <= 1, onclick: () => { pagina -= 1; cargar(); } }, 'Anterior');
      const siguiente = h('button', { type: 'button', class: 'pequeno', disabled: pagina >= paginas, onclick: () => { pagina += 1; cargar(); } }, 'Siguiente');
      limpiar(resultado,
        h('p', { class: 'texto-suave texto-pequeno' }, `${r.total} registro(s) · página ${pagina} de ${paginas}`),
        tabla([
          { titulo: 'Fecha y hora', valor: (f) => fechaHora(f.ocurrido_en) },
          { titulo: 'Usuario', valor: (f) => (f.usuario_nombre ? `${f.usuario_nombre}${f.usuario_rol === 'PROPIETARIO' ? ' (propietario)' : ''}` : 'Sistema') },
          { titulo: 'Acción', valor: (f) => h('strong', {}, ACCIONES[f.accion] || f.accion) },
          { titulo: 'Sobre', valor: (f) => TABLAS[f.tabla] || f.tabla },
          { titulo: 'Detalle', valor: (f) => describir(f) },
        ], r.filas, 'No hay registros con esos filtros.'),
        paginas > 1 ? h('div', { class: 'acciones' }, anterior, siguiente) : null);
    });
    const filtrar = () => { pagina = 1; cargar(); };
    [desde, hasta, accion, usuario].forEach((c) => c.addEventListener('change', filtrar));

    limpiar(main,
      h('div', { class: 'encabezado' },
        h('div', {}, h('h1', {}, 'Auditoría'),
          h('p', {}, 'Registro de quién hizo cada operación y cuándo: ingresos, pagos, verificaciones, anulaciones, comprobantes, cambios de titular, propietarios, semanas y parámetros.'))),
      mensaje('Este registro es de solo lectura: nadie puede editarlo ni borrarlo desde la aplicación. Las horas están en hora de Colombia.', 'info'),
      h('div', { class: 'tarjeta' },
        h('form', { class: 'filtros', role: 'search', onsubmit: (e) => { e.preventDefault(); filtrar(); } },
          campo('Desde', desde), campo('Hasta', hasta), campo('Acción', accion), campo('Usuario', usuario)),
        resultado));
    await cargar();
  },
};
