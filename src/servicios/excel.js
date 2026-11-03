// Exportación de reportes a Excel (.xlsx), compatible con Microsoft Excel (RNF-POR-01).
const ExcelJS = require('exceljs');
const { fechaHoraBogota } = require('./formato');

const FORMATOS = {
  pesos: '"$"#,##0',
  entero: '0',
  fecha: 'dd/mm/yyyy',
  fechahora: 'dd/mm/yyyy hh:mm',
};

function convertir(valor, tipo) {
  if (valor === null || valor === undefined) return null;
  if (tipo === 'fecha') { const [a, m, d] = String(valor).slice(0, 10).split('-').map(Number); return new Date(Date.UTC(a, m - 1, d)); }
  if (tipo === 'fechahora') {
    // Excel no maneja zonas horarias: se escribe la hora de Colombia.
    const [f, h] = fechaHoraBogota(valor).split(' ');
    const [d, m, a] = f.split('/').map(Number);
    const [hh, mm] = h.split(':').map(Number);
    return new Date(Date.UTC(a, m - 1, d, hh, mm));
  }
  if (tipo === 'pesos' || tipo === 'entero') return Number(valor);
  return String(valor);
}

const describirFiltros = (filtros) => {
  const partes = Object.entries(filtros).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => `${k}: ${v}`);
  return partes.length ? `Filtros: ${partes.join(' · ')}` : 'Filtros: ninguno';
};

async function generarExcel(reporte, filtros, filas) {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'CAM Proyectos Inmobiliarios';
  libro.created = new Date();
  // Excel no permite \ / ? * [ ] : en el nombre de una hoja, ni más de 31 caracteres.
  const nombreHoja = reporte.titulo.replace(/[\\/?*[\]:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31);
  const hoja = libro.addWorksheet(nombreHoja);

  hoja.addRow([`CAM PROYECTOS INMOBILIARIOS S.A.S. — ${reporte.titulo}`]).font = { bold: true, size: 13 };
  hoja.addRow([describirFiltros(filtros)]);
  hoja.addRow([`Generado: ${fechaHoraBogota(new Date())} · ${filas.length} filas`]);
  hoja.addRow([]);

  const encabezado = hoja.addRow(reporte.columnas.map((c) => c.titulo));
  encabezado.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  encabezado.eachCell((celda) => { celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3A5F' } }; });

  for (const f of filas) hoja.addRow(reporte.columnas.map((c) => convertir(f[c.clave], c.tipo)));

  reporte.columnas.forEach((c, i) => {
    const col = hoja.getColumn(i + 1);
    col.width = Math.max(12, Math.min(40, c.titulo.length + 4));
    if (FORMATOS[c.tipo]) col.numFmt = FORMATOS[c.tipo];
  });
  hoja.views = [{ state: 'frozen', ySplit: 5 }];
  return libro.xlsx.writeBuffer();
}

module.exports = { generarExcel };
