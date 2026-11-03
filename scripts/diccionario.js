// Genera docs/diccionario_datos.md LEYENDO LA BASE (catálogo de PostgreSQL),
// para que el diccionario siempre coincida con lo que realmente existe.
// Uso (PowerShell):  npm.cmd run diccionario
// Solo lee la estructura; no lee datos de personas.
const fs = require('node:fs');
const path = require('node:path');
const { RAIZ, consulta, exigir } = require('./comun');

exigir('PGHOST', 'PGPORT', 'CAM_DB', 'CAM_ADMIN_USER', 'CAM_ADMIN_PASSWORD');
const base = process.env.CAM_DB;
const json = (sql) => JSON.parse(consulta(base, `SELECT coalesce(json_agg(t), '[]') FROM (${sql}) t`));
const celda = (s) => (s === null || s === undefined || s === '' ? '—' : String(s).replace(/\|/g, '\\|').replace(/\n/g, ' '));

const objetos = json(`
  SELECT c.relname AS nombre, c.relkind AS tipo, obj_description(c.oid, 'pg_class') AS descripcion
    FROM pg_class c WHERE c.relnamespace = 'cam'::regnamespace AND c.relkind IN ('r', 'v') ORDER BY c.relkind, c.relname`);
const columnas = json(`
  SELECT c.relname AS tabla, a.attname AS columna, format_type(a.atttypid, a.atttypmod) AS tipo,
         a.attnotnull AS obligatorio, pg_get_expr(d.adbin, d.adrelid) AS defecto,
         CASE a.attidentity WHEN 'a' THEN 'identidad (automático)' END AS identidad,
         col_description(c.oid, a.attnum) AS descripcion
    FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
   WHERE c.relnamespace = 'cam'::regnamespace AND c.relkind IN ('r', 'v') AND a.attnum > 0 AND NOT a.attisdropped
   ORDER BY c.relname, a.attnum`);
const restricciones = json(`
  SELECT c.relname AS tabla, k.conname AS nombre, k.contype AS tipo, pg_get_constraintdef(k.oid) AS definicion
    FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid
   WHERE c.relnamespace = 'cam'::regnamespace AND k.contype <> 'n'   -- NOT NULL ya aparece en la columna «Obligatorio»
   ORDER BY c.relname, k.contype, k.conname`);
const indices = json(`
  SELECT t.relname AS tabla, i.relname AS nombre, pg_get_indexdef(x.indexrelid) AS definicion
    FROM pg_index x JOIN pg_class i ON i.oid = x.indexrelid JOIN pg_class t ON t.oid = x.indrelid
   WHERE t.relnamespace = 'cam'::regnamespace
     AND NOT EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conindid = x.indexrelid)
   ORDER BY t.relname, i.relname`);
const disparadores = json(`
  SELECT c.relname AS tabla, g.tgname AS nombre, p.proname AS funcion
    FROM pg_trigger g JOIN pg_class c ON c.oid = g.tgrelid JOIN pg_proc p ON p.oid = g.tgfoid
   WHERE c.relnamespace = 'cam'::regnamespace AND NOT g.tgisinternal ORDER BY c.relname, g.tgname`);
const funciones = json(`
  SELECT p.proname AS nombre, pg_get_function_identity_arguments(p.oid) AS argumentos,
         pg_get_function_result(p.oid) AS resultado, p.prosecdef AS definer
    FROM pg_proc p WHERE p.pronamespace = 'cam'::regnamespace AND p.prokind = 'f'
   ORDER BY (pg_get_function_result(p.oid) = 'trigger'), p.proname`);

const TIPOS_RESTRICCION = { p: 'Llave primaria', f: 'Llave foránea', u: 'Único', c: 'Validación (CHECK)', x: 'Exclusión' };
const fecha = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', dateStyle: 'long' }).format(new Date());
const tablas = objetos.filter((o) => o.tipo === 'r');
const vistas = objetos.filter((o) => o.tipo === 'v');

const md = [];
md.push('# Diccionario de datos — CAM', '');
md.push(`Generado automáticamente desde la base \`${base}\` (PostgreSQL, esquema \`cam\`) el ${fecha}, con \`npm.cmd run diccionario\`.`);
md.push('Las descripciones están guardadas en la propia base (`sql/07_comentarios.sql`). Diagrama: [diagrama_er.md](diagrama_er.md).', '');
md.push(`**Contenido:** ${tablas.length} tablas, ${vistas.length} vistas, ${funciones.length} funciones.`, '');
md.push('Convenciones: *Obligatorio* = la columna no admite valores vacíos (NOT NULL). Los valores en pesos usan `numeric(14,2)`.');
md.push('Las fechas y horas (`timestamptz`) se muestran en la zona America/Bogota.', '');
md.push('## Índice', '');
md.push(...tablas.map((t) => `- [${t.nombre}](#${t.nombre}) — ${celda(t.descripcion)}`), '');
md.push('Vistas: ' + vistas.map((v) => `[${v.nombre}](#${v.nombre})`).join(', '), '');

md.push('## Tablas', '');
for (const t of tablas) {
  md.push(`### ${t.nombre}`, '', celda(t.descripcion), '');
  md.push('| Columna | Tipo | Obligatorio | Valor por defecto | Descripción |', '|---|---|---|---|---|');
  for (const c of columnas.filter((x) => x.tabla === t.nombre)) {
    md.push(`| \`${c.columna}\` | ${c.tipo} | ${c.obligatorio ? 'Sí' : 'No'} | ${celda(c.identidad || c.defecto)} | ${celda(c.descripcion)} |`);
  }
  const rs = restricciones.filter((x) => x.tabla === t.nombre);
  const ix = indices.filter((x) => x.tabla === t.nombre);
  const tg = disparadores.filter((x) => x.tabla === t.nombre);
  if (rs.length || ix.length || tg.length) {
    md.push('', '**Reglas en la base:**', '');
    for (const r of rs) md.push(`- ${TIPOS_RESTRICCION[r.tipo] || r.tipo} \`${r.nombre}\`: \`${r.definicion}\``);
    for (const i of ix) md.push(`- Índice \`${i.nombre}\`: \`${i.definicion.replace(/ USING btree/, '').replace(/^CREATE /, '')}\``);
    for (const g of tg) md.push(`- Trigger \`${g.nombre}\` → \`${g.funcion}()\``);
  }
  md.push('');
}

md.push('## Vistas', '', 'Consultas guardadas que usa la aplicación. No almacenan datos: se calculan al consultarlas.', '');
for (const v of vistas) {
  md.push(`### ${v.nombre}`, '', celda(v.descripcion), '');
  md.push('Columnas: ' + columnas.filter((x) => x.tabla === v.nombre).map((c) => `\`${c.columna}\``).join(', '), '');
}

md.push('## Funciones', '');
md.push('Las operaciones de negocio son funciones *SECURITY DEFINER*: se ejecutan con los permisos del dueño (`cam_admin`), validan las reglas y bloquean las filas que modifican. Así el usuario de la aplicación (`cam_app`) no necesita permiso para modificar directamente pagos, comprobantes ni ofertas.', '');
md.push('| Función | Parámetros | Devuelve | Seguridad |', '|---|---|---|---|');
for (const f of funciones) md.push(`| \`${f.nombre}\` | ${celda(f.argumentos)} | ${celda(f.resultado)} | ${f.definer ? 'SECURITY DEFINER' : 'normal'} |`);
md.push('');

const destino = path.join(RAIZ, 'docs', 'diccionario_datos.md');
fs.writeFileSync(destino, md.join('\n'));
const sinDescripcion = columnas.filter((c) => tablas.some((t) => t.nombre === c.tabla) && !c.descripcion);
console.log(`Diccionario generado: ${path.relative(RAIZ, destino)} (${tablas.length} tablas, ${vistas.length} vistas, ${funciones.length} funciones).`);
if (sinDescripcion.length) console.log(`Columnas sin descripción: ${sinDescripcion.map((c) => `${c.tabla}.${c.columna}`).join(', ')}`);
