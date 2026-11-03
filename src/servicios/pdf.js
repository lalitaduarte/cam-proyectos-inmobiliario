// Generación del comprobante de pago en PDF a partir de la "fotografía"
// guardada en la tabla comprobante (no cambia si luego se editan los datos).
const PDFDocument = require('pdfkit');
const { pesos, fecha, fechaHoraBogota } = require('./formato');

function generarPdfComprobante(c) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 56, info: {
      Title: `Comprobante ${c.numero}`, Author: c.empresa, Subject: 'Soporte interno de pago',
    } });
    const partes = [];
    doc.on('data', (b) => partes.push(b));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);

    const ancho = doc.page.width - 112;
    const azul = '#1f3a5f';

    // Encabezado
    doc.fillColor(azul).font('Helvetica-Bold').fontSize(16).text(c.empresa, { align: 'left' });
    doc.moveDown(0.2).fillColor('#444').font('Helvetica').fontSize(10).text('Comprobante interno de pago de cuota');
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#000')
      .text(`No. ${c.numero}`, 56, 56, { width: ancho, align: 'right' });
    doc.font('Helvetica').fontSize(10).fillColor('#444')
      .text(`Emitido: ${fechaHoraBogota(c.emitido_en)}`, 56, 76, { width: ancho, align: 'right' });
    doc.moveTo(56, 110).lineTo(56 + ancho, 110).strokeColor(azul).lineWidth(1.5).stroke();

    // Tabla de datos
    const filas = [
      ['Propietario', c.propietario_nombre],
      ['Cédula', c.propietario_cedula],
      ['Correo', c.propietario_correo],
      ['Semana de uso', `No. ${c.semana_numero}`],
      ['Concepto', `Cuota ${c.numero_cuota} de ${c.numero_cuotas} de la acción de la semana ${c.semana_numero}`],
      ['Valor pagado', pesos(c.valor)],
      ['Fecha del pago', fecha(c.fecha_pago)],
      ['Estado del pago', 'VERIFICADO'],
      ['Total abonado a la fecha', pesos(c.total_abonado)],
      ['Cuotas pendientes', String(c.cuotas_pendientes)],
      ['Saldo de la acción', pesos(c.saldo)],
      ['Emitido por', c.emisor_nombre],
    ];
    let y = 128;
    for (const [i, [etiqueta, valor]] of filas.entries()) {
      if (i % 2 === 0) doc.rect(56, y - 4, ancho, 22).fill('#f2f5f9');
      doc.fillColor('#333').font('Helvetica-Bold').fontSize(10).text(etiqueta, 64, y, { width: 170 });
      doc.fillColor('#000').font(etiqueta === 'Valor pagado' ? 'Helvetica-Bold' : 'Helvetica')
        .text(String(valor ?? ''), 240, y, { width: ancho - 190 });
      y += 22;
    }

    // Aclaración obligatoria
    y += 18;
    doc.rect(56, y, ancho, 36).lineWidth(1).strokeColor('#b45309').stroke();
    doc.fillColor('#b45309').font('Helvetica-Bold').fontSize(11)
      .text(c.nota || 'Soporte interno de pago. No es factura electrónica.', 56, y + 12, { width: ancho, align: 'center' });

    doc.fillColor('#777').font('Helvetica').fontSize(8)
      .text('Saldo calculado con los pagos verificados al momento de la emisión. Documento generado por el sistema de CAM.',
        56, y + 56, { width: ancho, align: 'center' });
    doc.end();
  });
}

module.exports = { generarPdfComprobante };
