// Validaciones de los datos que llegan desde el navegador.
// La base de datos vuelve a validar todo; aquí se dan mensajes tempranos y claros.
const { ErrorApp } = require('./errores');

const invalido = (mensaje) => new ErrorApp(400, mensaje);

function texto(valor, nombre, { min = 0, max = 1000, opcional = false } = {}) {
  if (valor === undefined || valor === null || String(valor).trim() === '') {
    if (opcional) return null;
    throw invalido(`El campo "${nombre}" es obligatorio.`);
  }
  if (typeof valor !== 'string' && typeof valor !== 'number') throw invalido(`El campo "${nombre}" no es válido.`);
  const v = String(valor).trim();
  if (v.length < min) throw invalido(`El campo "${nombre}" debe tener al menos ${min} caracteres.`);
  if (v.length > max) throw invalido(`El campo "${nombre}" admite máximo ${max} caracteres.`);
  return v;
}

function entero(valor, nombre, { min = -Infinity, max = Infinity, opcional = false } = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (opcional) return null;
    throw invalido(`El campo "${nombre}" es obligatorio.`);
  }
  const n = Number(valor);
  if (!Number.isInteger(n)) throw invalido(`El campo "${nombre}" debe ser un número entero.`);
  if (n < min || n > max) throw invalido(`El campo "${nombre}" debe estar entre ${min} y ${max}.`);
  return n;
}

// Montos en pesos: se aceptan números o texto como "750000" o "750.000".
function monto(valor, nombre, { opcional = false } = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (opcional) return null;
    throw invalido(`El campo "${nombre}" es obligatorio.`);
  }
  const limpio = typeof valor === 'number' ? valor : Number(String(valor).replace(/[$\s.]/g, '').replace(',', '.'));
  if (!Number.isFinite(limpio)) throw invalido(`El campo "${nombre}" debe ser un valor numérico.`);
  if (limpio <= 0) throw invalido(`El campo "${nombre}" debe ser mayor que cero.`);
  if (limpio > 999999999999) throw invalido(`El campo "${nombre}" es demasiado grande.`);
  if (Math.round(limpio * 100) !== limpio * 100) throw invalido(`El campo "${nombre}" admite máximo dos decimales.`);
  return limpio;
}

function fecha(valor, nombre, { opcional = false } = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (opcional) return null;
    throw invalido(`El campo "${nombre}" es obligatorio.`);
  }
  const v = String(valor);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw invalido(`El campo "${nombre}" debe ser una fecha AAAA-MM-DD.`);
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) throw invalido(`La fecha "${nombre}" no existe.`);
  return v;
}

function opcion(valor, nombre, opciones, { opcional = false } = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (opcional) return null;
    throw invalido(`El campo "${nombre}" es obligatorio.`);
  }
  const v = String(valor).toUpperCase();
  if (!opciones.includes(v)) throw invalido(`El campo "${nombre}" debe ser: ${opciones.join(' o ')}.`);
  return v;
}

function booleano(valor, nombre) {
  if (valor === true || valor === 'true') return true;
  if (valor === false || valor === 'false') return false;
  throw invalido(`El campo "${nombre}" debe ser verdadero o falso.`);
}

function id(valor, nombre = 'id') {
  return entero(valor, nombre, { min: 1, max: Number.MAX_SAFE_INTEGER });
}

// Contraseña: mínimo 8 caracteres, con al menos una letra y un número.
function clave(valor, nombre = 'contraseña') {
  if (typeof valor !== 'string' || valor.length === 0) throw invalido(`La ${nombre} es obligatoria.`);
  if (valor.length < 8 || valor.length > 72) throw invalido(`La ${nombre} debe tener entre 8 y 72 caracteres.`);
  if (!/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(valor) || !/\d/.test(valor)) {
    throw invalido(`La ${nombre} debe incluir al menos una letra y un número.`);
  }
  return valor;
}

module.exports = { texto, entero, monto, fecha, opcion, booleano, id, clave };
