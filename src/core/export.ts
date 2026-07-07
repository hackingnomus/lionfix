import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { logActivity, parseLog, LogEntry } from './logger.js';

export async function generateXLSX(
  entries: LogEntry[],
  outputPath: string,
): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Actividades');

  ws.columns = [
    { header: 'FECHA', key: 'FECHA', width: 22 },
    { header: 'TECNICO', key: 'TECNICO', width: 18 },
    { header: 'OPERACION', key: 'OPERACION', width: 20 },
    { header: 'ARCHIVO', key: 'ARCHIVO', width: 50 },
    { header: 'EQUIPO', key: 'EQUIPO', width: 15 },
    { header: 'RESULTADO', key: 'RESULTADO', width: 12 },
  ];

  for (const entry of entries) {
    ws.addRow(entry);
  }

  ws.getRow(1).font = { bold: true };
  mkdirSync(join(outputPath, '..'), { recursive: true });
  await wb.xlsx.writeFile(outputPath);
}

function truncateText(text: string, maxWidth: number, doc: PDFKit.PDFDocument): string {
  if (!text || doc.widthOfString(text) <= maxWidth) return text || '';
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (doc.widthOfString(text.slice(0, mid) + '...') <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + '...';
}

export async function generatePDF(
  title: string,
  entries: LogEntry[],
  outputPath: string,
): Promise<void> {
  const PDFDocument = (await import('pdfkit')).default;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(chunks);
      mkdirSync(join(outputPath, '..'), { recursive: true });
      writeFileSync(outputPath, pdfBuffer);
      resolve();
    });
    doc.on('error', reject);

    doc.fontSize(14).text(title, { align: 'center' });
    doc.moveDown(1);

    const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const headers = ['FECHA', 'TECNICO', 'OPERACION', 'ARCHIVO', 'EQUIPO', 'RESULTADO'];
    const colWidths = [75, 55, 55, pageW - 75 - 55 - 55 - 50 - 50, 50, 50];
    const rowH = 17;
    const startX = doc.page.margins.left;
    let y = doc.y;

    function drawHeader(ypos: number) {
      let xpos = startX;
      doc.font('Helvetica-Bold').fontSize(8);
      doc.fillColor('#1e40af');
      for (let i = 0; i < headers.length; i++) {
        doc.rect(xpos, ypos, colWidths[i], rowH).fill();
        xpos += colWidths[i];
      }
      xpos = startX;
      doc.fillColor('#ffffff');
      for (let i = 0; i < headers.length; i++) {
        doc.text(headers[i], xpos + 4, ypos + 5, { lineBreak: false });
        xpos += colWidths[i];
      }
      doc.fillColor('#000000');
    }

    function drawRow(r: number, ypos: number) {
      const entry = entries[r];
      const cells = [entry.FECHA, entry.TECNICO, entry.OPERACION, entry.ARCHIVO, entry.EQUIPO, entry.RESULTADO];
      let xpos = startX;

      if (r % 2 === 1) {
        doc.fillColor('#f1f5f9');
        for (let i = 0; i < colWidths.length; i++) {
          doc.rect(xpos, ypos, colWidths[i], rowH).fill();
          xpos += colWidths[i];
        }
        doc.fillColor('#000000');
      }

      xpos = startX;
      doc.font('Helvetica').fontSize(7.5);
      for (let i = 0; i < cells.length; i++) {
        doc.rect(xpos, ypos, colWidths[i], rowH).stroke('#d1d5db');
        const maxW = colWidths[i] - 8;
        const display = !cells[i] ? '' : doc.widthOfString(cells[i]) <= maxW ? cells[i] : (() => {
          let lo = 0, hi = cells[i].length;
          while (lo < hi) { const m = Math.ceil((lo + hi) / 2); if (doc.widthOfString(cells[i].slice(0, m) + '...') <= maxW) lo = m; else hi = m - 1; }
          return cells[i].slice(0, lo) + '...';
        })();
        doc.text(display, xpos + 4, ypos + 5, { lineBreak: false });
        xpos += colWidths[i];
      }
    }

    drawHeader(y);
    y += rowH;
    doc.font('Helvetica').fontSize(7.5);

    for (let r = 0; r < entries.length; r++) {
      if (y + rowH > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        y = doc.page.margins.top;
        drawHeader(y);
        y += rowH;
      }
      drawRow(r, y);
      y += rowH;
    }

    y += 8;
    doc.fontSize(8).font('Helvetica');
    const okCount = entries.filter(e => e.RESULTADO === 'OK').length;
    const errorCount = entries.filter(e => e.RESULTADO !== 'OK').length;
    doc.text(`Total: ${entries.length}  |  OK: ${okCount}  |  Errores: ${errorCount}`, startX, y);

    doc.end();
  });
}

export function generateTXTReport(
  title: string,
  entries: LogEntry[],
  outputPath: string,
): void {
  const lines: string[] = [];
  lines.push('='.repeat(80));
  lines.push(title);
  lines.push(`Generado: ${new Date().toLocaleString()}`);
  lines.push('='.repeat(80));
  lines.push('');

  const header = 'FECHA'.padEnd(22) + 'TECNICO'.padEnd(18) + 'OPERACION'.padEnd(20) + 'ARCHIVO'.padEnd(50) + 'EQUIPO'.padEnd(15) + 'RESULTADO';
  lines.push(header);
  lines.push('-'.repeat(80));

  for (const e of entries) {
    lines.push(
      e.FECHA.padEnd(22) +
      e.TECNICO.padEnd(18) +
      e.OPERACION.padEnd(20) +
      e.ARCHIVO.padEnd(50) +
      e.EQUIPO.padEnd(15) +
      e.RESULTADO
    );
  }

  const stats = {
    total: entries.length,
    ok: entries.filter(e => e.RESULTADO === 'OK').length,
    error: entries.filter(e => e.RESULTADO !== 'OK').length,
  };

  lines.push('');
  lines.push('-' .repeat(40));
  lines.push(`Total actividades: ${stats.total}`);
  lines.push(`Exitosas: ${stats.ok}`);
  lines.push(`Fallidas: ${stats.error}`);

  mkdirSync(join(outputPath, '..'), { recursive: true });
  writeFileSync(outputPath, lines.join('\n'), 'utf-8');
}
