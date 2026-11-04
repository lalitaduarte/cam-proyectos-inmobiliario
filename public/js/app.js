// Aplicación de una sola página: decide qué pantalla mostrar según la dirección (#/...)
// y el rol de la sesión. Los permisos reales los verifica el servidor.
import { obtener, enviar } from './api.js';
import { h, limpiar, mensaje, avisar, conBotonOcupado, campo, entrada, datosFormulario } from './ui.js';

import panel from './vistas/panel.js';
import propietarios from './vistas/propietarios.js';
import semanas from './vistas/semanas.js';
import adquisiciones from './vistas/adquisiciones.js';
import pagos from './vistas/pagos.js';
import comprobantes from './vistas/comprobantes.js';
import estadoCuenta from './vistas/estado_cuenta.js';
import reportes from './vistas/reportes.js';
import parametros from './vistas/parametros.js';
import comunidad from './vistas/comunidad.js';
import clave from './vistas/clave.js';
import auditoria from './vistas/auditoria.js';

const app = document.getElementById('app');
let sesion = null;

// Rutas por rol: [ruta, vista, texto del menú (null = no aparece en el menú)]
const RUTAS = {
  SECRETARIA: [
    ['panel', panel, 'Panel principal'],
    ['propietarios', propietarios, 'Propietarios'],
    ['semanas', semanas, 'Semanas'],
    ['adquisiciones', adquisiciones, 'Adquisiciones'],
    ['pagos', pagos, 'Pagos de cuotas'],
    ['comprobantes', comprobantes, 'Comprobantes'],
    ['estado-cuenta', estadoCuenta, 'Estado de cuenta'],
    ['reportes', reportes, 'Recaudo y reportes'],
    ['parametros', parametros, 'Parámetros'],
    ['comunidad', comunidad, 'Comunidad'],
    ['auditoria', auditoria, 'Auditoría'],
    ['clave', clave, null],
  ],
  PROPIETARIO: [
    ['comunidad', comunidad, 'Comunidad'],
    ['clave', clave, 'Cambiar contraseña'],
  ],
};

// ---------------------------------------------------------------- Inicio de sesión
function pantallaIngreso(aviso) {
  document.title = 'Ingresar · CAM';
  const zona = h('div', {}, aviso ? mensaje(aviso, 'info') : null);
  const usuario = entrada({ name: 'usuario', autocomplete: 'username', required: true, maxlength: 40, autocapitalize: 'none' });
  const claveInput = entrada({ name: 'clave', type: 'password', autocomplete: 'current-password', required: true, maxlength: 72 });
  const boton = h('button', { type: 'submit', class: 'primario' }, 'Ingresar');
  const form = h('form', {},
    h('div', { class: 'campos' },
      campo('Usuario o cédula', usuario, 'Secretaria: su usuario. Propietario: su número de cédula, sin puntos.'),
      campo('Contraseña', claveInput)),
    boton);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    limpiar(zona);
    await conBotonOcupado(boton, 'Verificando…', async () => {
      try {
        const d = datosFormulario(form);
        const r = await enviar('/auth/login', { usuario: d.usuario, clave: claveInput.value });
        sesion = r.usuario;
        // replaceState no dispara "hashchange": se muestra la pantalla una sola vez.
        const actual = location.hash.replace(/^#\/?/, '').split('/')[0];
        const permitida = RUTAS[sesion.rol].some((r) => r[0] === actual);
        if (sesion.debeCambiarClave) history.replaceState(null, '', '#/clave');
        else if (!permitida) history.replaceState(null, '', `#/${RUTAS[sesion.rol][0][0]}`);
        mostrar();
      } catch (err) {
        limpiar(zona, mensaje(err.message, 'error'));
        claveInput.value = '';
        claveInput.focus();
      }
    });
  });
  limpiar(app, h('main', { class: 'pantalla-ingreso' },
    h('div', { class: 'caja-ingreso' },
      h('div', { class: 'logo-grande' }, h('img', { src: '/img/icono.svg', alt: '' }),
        h('div', {}, h('strong', {}, 'CAM Proyectos Inmobiliarios'), h('span', {}, 'Semanas, pagos y comunidad'))),
      h('div', { class: 'tarjeta' },
        h('h1', {}, 'Ingresar'),
        zona, form,
        h('p', { class: 'privacidad' },
          'Aviso de privacidad: CAM PROYECTOS INMOBILIARIOS S.A.S. trata su nombre, cédula y correo solo para administrar ',
          'sus semanas, pagos y la comunidad de propietarios, conforme a la Ley 1581 de 2012. Los demás propietarios ',
          'solo ven su nombre en las ofertas y mensajes; nunca su cédula ni su correo.')))));
  usuario.focus();
}

// ---------------------------------------------------------------- Estructura con menú
async function salir() {
  try { await enviar('/auth/logout'); } catch { /* aunque falle, se limpia la pantalla */ }
  sesion = null;
  document.getElementById('avisos').replaceChildren();   // no dejar avisos de la sesión anterior
  history.replaceState(null, '', '#/');
  pantallaIngreso('Sesión cerrada correctamente.');
}

function estructura(rutaActual) {
  const rutas = RUTAS[sesion.rol];
  const menu = h('nav', { class: 'menu', 'aria-label': 'Menú principal' },
    h('div', { class: 'sesion-movil' }, `Sesión: ${sesion.nombre}`),
    rutas.filter((r) => r[2]).map(([ruta, , texto]) =>
      h('a', { href: `#/${ruta}`, 'aria-current': ruta === rutaActual ? 'page' : null }, texto)));
  const botonMenu = h('button', {
    class: 'boton-menu pequeno', type: 'button', 'aria-expanded': 'false',
    onclick: () => { const abierto = menu.classList.toggle('abierto'); botonMenu.setAttribute('aria-expanded', String(abierto)); },
  }, 'Menú');
  const contenido = h('main', { class: 'contenido', id: 'contenido', tabindex: '-1' });
  const salirBoton = h('button', { class: 'pequeno', type: 'button' }, 'Cerrar sesión');
  salirBoton.addEventListener('click', () => conBotonOcupado(salirBoton, 'Saliendo…', salir));
  limpiar(app, h('div', { class: 'marco' },
    h('header', { class: 'barra' },
      botonMenu,
      h('a', { class: 'logo', href: `#/${rutas[0][0]}` }, h('img', { src: '/img/icono.svg', alt: '' }), 'CAM'),
      h('span', { class: 'espacio' }),
      h('div', { class: 'usuario' }, sesion.nombre, h('small', {}, sesion.rol === 'SECRETARIA' ? 'Secretaria · Administración' : 'Propietario')),
      salirBoton),
    menu, contenido));
  return contenido;
}

// ---------------------------------------------------------------- Navegación
async function mostrar() {
  if (!sesion) return pantallaIngreso();
  const [ruta, ...params] = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const rutas = RUTAS[sesion.rol];
  if (sesion.debeCambiarClave && ruta !== 'clave') { location.hash = '#/clave'; return undefined; }
  const encontrada = rutas.find((r) => r[0] === ruta);
  if (!encontrada) { location.hash = `#/${rutas[0][0]}`; return undefined; }
  const [nombre, vista] = encontrada;
  const contenido = estructura(nombre);
  document.title = `${vista.titulo} · CAM`;
  try {
    await vista.render(contenido, params.map(decodeURIComponent), sesion, {
      alCambiarClave: () => { sesion.debeCambiarClave = false; },
    });
  } catch (err) {
    limpiar(contenido, mensaje(err.message || 'No se pudo mostrar la pantalla.', 'error'));
  }
  contenido.focus({ preventScroll: true });
  return undefined;
}

window.addEventListener('hashchange', () => { if (sesion) mostrar(); });
window.addEventListener('cam:sesion-vencida', () => {
  if (!sesion) return;
  sesion = null;
  avisar('Su sesión terminó. Ingrese de nuevo.', 'error');
  pantallaIngreso('Su sesión terminó. Ingrese de nuevo.');
});

// Al abrir la página: ¿hay una sesión activa?
(async () => {
  try {
    sesion = (await obtener('/auth/sesion')).usuario;
  } catch {
    sesion = null;
  }
  mostrar();
})();
