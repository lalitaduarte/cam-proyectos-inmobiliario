// Crea una cuenta de SECRETARIA con contraseña TEMPORAL (debe cambiarla al ingresar).
// En una base nueva (instalada con --sin-demo) además deja lista la configuración
// inicial, solo si falta: las 52 semanas y las condiciones de la acción
// ($18.000.000 en 24 cuotas de $750.000, modificables luego en "Parámetros").
//
// Uso (PowerShell):  npm.cmd run crear-secretaria -- usuario Nombre completo
// Ejemplo:           npm.cmd run crear-secretaria -- mrodriguez María Rodríguez
// (el nombre va SIN comillas: npm.cmd en Windows maneja mal las comillas)
//
// Usa la misma conexión que la aplicación (cam_app, o DATABASE_URL en publicación).
// La contraseña temporal se muestra UNA vez en esta ventana: entréguela en persona.
// Con --neon se crea en la base PUBLICADA (usa NEON_DATABASE_URL del .env).
const argumentos = process.argv.slice(2).filter((a) => a !== '--neon');
if (process.argv.includes('--neon')) {
  if (!process.env.NEON_DATABASE_URL) { console.error('Falta NEON_DATABASE_URL en .env (ejecute antes npm.cmd run neon:instalar).'); process.exit(1); }
  process.env.DATABASE_URL = process.env.NEON_DATABASE_URL;
}
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const bd = require('../src/db');
const { COSTO_HASH } = require('../src/rutas/auth');

const login = argumentos[0];
const nombre = argumentos.slice(1).join(' ').replace(/["']/g, '').trim();
if (!login || !nombre || !/^[a-z0-9._-]{3,40}$/.test(login) || nombre.trim().length < 3) {
  console.error('Uso: npm.cmd run crear-secretaria -- usuario Nombre completo   (el nombre sin comillas)');
  console.error('El usuario: de 3 a 40 caracteres, en minúsculas, sin espacios (letras, números, punto, guion).');
  process.exit(1);
}

// Contraseña temporal legible: 12 caracteres sin letras confusas (0/O, 1/l), con letra y número.
function claveTemporal() {
  const letras = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const numeros = '23456789';
  const todos = letras + numeros;
  let c = letras[crypto.randomInt(letras.length)] + numeros[crypto.randomInt(numeros.length)];
  while (c.length < 12) c += todos[crypto.randomInt(todos.length)];
  return c;
}

(async () => {
  const clave = claveTemporal();
  const hash = await bcrypt.hash(clave, COSTO_HASH);
  const resultado = await bd.transaccion(async (cx) => {
    const existe = await cx.query('SELECT 1 FROM usuario WHERE lower(login) = lower($1)', [login]);
    if (existe.rowCount) throw new Error(`Ya existe un usuario "${login}". No se modificó nada.`);
    const { rows: [u] } = await cx.query(
      `INSERT INTO usuario (rol, login, nombre, password_hash, debe_cambiar_clave)
       VALUES ('SECRETARIA', $1, $2, $3, true) RETURNING id`, [login, nombre.trim(), hash]);
    await cx.query(`INSERT INTO auditoria (usuario_id, accion, tabla, registro_id, detalle)
                    VALUES ($1, 'CREAR', 'usuario', $1, '{"rol": "SECRETARIA", "origen": "crear_secretaria.js"}')`, [u.id]);

    const extras = [];
    const { rows: [s] } = await cx.query('SELECT count(*)::int AS n FROM semana');
    if (s.n === 0) {
      await cx.query('INSERT INTO semana (numero, creado_por) SELECT g, $1 FROM generate_series(1, 52) g', [u.id]);
      extras.push('se crearon las 52 semanas');
    }
    const { rows: [p] } = await cx.query('SELECT count(*)::int AS n FROM parametro_accion');
    if (p.n === 0) {
      await cx.query('SELECT fn_nuevo_parametro($1, 18000000, 24, 750000)', [u.id]);
      extras.push('se fijaron las condiciones iniciales ($18.000.000 en 24 cuotas de $750.000)');
    }
    return extras;
  });
  console.log(`Cuenta de secretaria creada en ${process.env.DATABASE_URL ? 'NEON (publicación)' : 'la base local'}: usuario "${login}" (${nombre.trim()}).`);
  console.log(`Contraseña TEMPORAL: ${clave}`);
  console.log('Anótela y entréguela en persona. Se pedirá cambiarla en el primer ingreso.');
  if (resultado.length) console.log(`Configuración inicial: ${resultado.join('; ')}.`);
})().catch((e) => {
  console.error(`No se pudo crear la cuenta: ${e.message}`);
  process.exitCode = 1;
}).finally(() => bd.pool.end());
