// Comprobantes: consulta, ver/imprimir PDF, descargar, entrega manual (D11) y envío por correo (no configurado aún).
import { obtener, enviar, parametros, descargar } from '../api.js';
import {
  h, limpiar, conCarga, tabla, insignia, pesos, fecha, fechaHora, campo, entrada, selector, mensaje, avisar, conBotonOcupado,
  dialogoFormulario,
} from '../ui.js';

const MEDIOS = { PERSONAL: 'Entregado en persona', WHATSAPP: 'Enviado por WhatsApp', CORREO: 'Enviado por correo' };

// Estado de envío: dice cómo se entregó, no solo "Enviado".
function estadoEnvio(c) {
  if (c.estado_envio === 'PENDIENTE') return insignia('PENDIENTE', 'Pendiente de envío');
  if (c.estado_envio === 'ENVIADO') return insignia('ENVIADO', MEDIOS[c.medio_entrega] || null);
  return insignia(c.estado_envio);
}

// Registra que la secretaria entregó el comprobante sin correo (D11).
function registrarEntrega(c, alGuardar) {
  dialogoFormulario(`Registrar entrega de ${c.numero}`, {
    introduccion: h('p', {}, `Úselo cuando entregó el PDF a ${c.propietario_nombre} en persona o por WhatsApp. Queda registrado quién lo marcó y cuándo, y no se puede deshacer.`),
    campos: [
      campo('Medio de entrega', selector('medio', [['PERSONAL', 'En persona (impreso)'], ['WHATSAPP', 'Por WhatsApp']], { required: true })),
      campo('Observación (opcional)', entrada({ name: 'observacion', maxlength: 300, placeholder: 'Por ejemplo: recibido por el propietario' })),
    ],
    textoEnviar: 'Registrar entrega',
    alEnviar: async (d) => {
      await enviar(`/comprobantes/${c.id}/entregar`, d);
      avisar(`Entrega de ${c.numero} registrada.`);
      alGuardar();
    },
  });
}

async function intentarEnvio(c, boton) {
  await conBotonOcupado(boton, 'Enviando…', async () => {
    try {
      await enviar(`/comprobantes/${c.id}/enviar`);
      avisar('Comprobante enviado.');
    } catch (err) {
      // 503: el correo no está configurado. No se marca nada como enviado.
      avisar(err.message, err.estado === 503 ? 'info' : 'error');
    }
  });
}

export default {
  titulo: 'Comprobantes',
  async render(main) {
    const q = entrada({ type: 'search', placeholder: 'Número, cédula o nombre', maxlength: 120 });
    const envio = selector('estado_envio', [['', 'Todos'], ['PENDIENTE', 'Pendientes de envío'], ['ENVIADO', 'Enviados o entregados'], ['FALLIDO', 'Envío fallido']]);
    const resultado = h('div');
    const cargar = () => conCarga(resultado, async () => {
      const filas = await obtener(`/comprobantes${parametros({ q: q.value.trim(), estado_envio: envio.value })}`);
      limpiar(resultado,
        h('p', { class: 'texto-suave texto-pequeno' }, `${filas.length} comprobante(s)`),
        tabla([
          { titulo: 'Número', valor: (c) => h('strong', {}, c.numero) },
          { titulo: 'Emitido', valor: (c) => fechaHora(c.emitido_en) },
          { titulo: 'Propietario', valor: (c) => `${c.propietario_nombre} · C.C. ${c.propietario_cedula}` },
          { titulo: 'Semana / cuota', valor: (c) => `Sem. ${c.semana_numero} · cuota ${c.numero_cuota}/${c.numero_cuotas}` },
          { titulo: 'Valor', valor: (c) => pesos(c.valor), clase: 'derecha num' },
          { titulo: 'Fecha del pago', valor: (c) => fecha(c.fecha_pago) },
          { titulo: 'Envío', valor: (c) => estadoEnvio(c) },
          {
            titulo: 'Acciones',
            valor: (c) => {
              const bDescargar = h('button', { class: 'pequeno', type: 'button' }, 'Descargar PDF');
              bDescargar.addEventListener('click', () => conBotonOcupado(bDescargar, 'Generando…', async () => {
                try { await descargar(`/comprobantes/${c.id}/pdf?descargar=1`, `comprobante-${c.numero}.pdf`); } catch (err) { avisar(err.message, 'error'); }
              }));
              const bEnviar = h('button', { class: 'pequeno', type: 'button' }, 'Enviar por correo');
              bEnviar.addEventListener('click', () => intentarEnvio(c, bEnviar));
              return h('div', { class: 'acciones' },
                h('a', { class: 'boton pequeno primario', href: `/api/comprobantes/${c.id}/pdf`, target: '_blank', rel: 'noopener' }, 'Ver / imprimir'),
                bDescargar,
                c.estado_envio === 'ENVIADO' ? null : (() => {
                  const bEntregar = h('button', { class: 'pequeno', type: 'button' }, 'Marcar entregado');
                  bEntregar.addEventListener('click', () => registrarEntrega(c, cargar));
                  return bEntregar;
                })(),
                bEnviar);
            },
          },
        ], filas, q.value || envio.value ? 'Ningún comprobante coincide.' : 'Aún no se han emitido comprobantes. Se emiten desde Pagos de cuotas, para pagos verificados.'));
    });
    let espera;
    q.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(cargar, 300); });
    envio.addEventListener('change', cargar);
    limpiar(main,
      h('div', { class: 'encabezado' },
        h('div', {}, h('h1', {}, 'Comprobantes'),
          h('p', {}, 'Soportes internos de pago. No son factura electrónica.'))),
      mensaje('El envío por correo todavía no está configurado. Use "Ver / imprimir" o "Descargar PDF", entregue el comprobante en persona o por WhatsApp y luego pulse "Marcar entregado". Ningún comprobante se marca como enviado por correo si el correo no salió realmente.', 'info'),
      h('div', { class: 'tarjeta' },
        h('form', { class: 'filtros', role: 'search', onsubmit: (e) => { e.preventDefault(); cargar(); } },
          campo('Buscar', q), campo('Estado de envío', envio)),
        resultado));
    await cargar();
  },
};
