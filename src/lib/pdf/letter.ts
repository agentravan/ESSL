// Renders a filled-in letter (see lib/letters/template.ts for the marks) to an A4 PDF.

import { PDFDocument, PDFPage } from 'pdf-lib';
import { inr } from '../format';
import { A4, INK, LINE, MARGIN, MUTED, SHADE, drawLine, fit, lineWidth, loadFonts, parseRuns, pdfSafe, textCentre, textRight, wrapRuns, type Fonts } from './draw';

export interface LetterInput {
  header: { name: string; address: string };
  body: string;
  salaryRows?: { label: string; monthly: number }[];
  footerNote?: string;
}

const BODY_SIZE = 10.5;
const LEADING = 15;
const WIDTH = A4.width - MARGIN * 2;
const BOTTOM = 64;

export async function renderLetterPdf(input: LetterInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(input.header.name));
  doc.setProducer('Teamwork HRMS');
  const fonts = await loadFonts(doc);
  let page!: PDFPage;
  let y = 0;

  const newPage = () => {
    page = doc.addPage([A4.width, A4.height]);
    y = A4.height - MARGIN;
    page.drawText(fit(pdfSafe(input.header.name), fonts.bold, 14, WIDTH), { x: MARGIN, y: y - 4, size: 14, font: fonts.bold, color: INK });
    y -= 20;
    const addressLines = pdfSafe(input.header.address).split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 3);
    for (const line of addressLines) {
      page.drawText(fit(line, fonts.regular, 8.5, WIDTH), { x: MARGIN, y, size: 8.5, font: fonts.regular, color: MUTED });
      y -= 11;
    }
    y -= 2;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: A4.width - MARGIN, y }, thickness: 0.8, color: LINE });
    y -= 26;
  };
  const ensure = (space: number) => {
    if (y - space < BOTTOM) newPage();
  };
  const paragraph = (text: string, size: number, indent = 0, forceBold = false) => {
    const runs = parseRuns(text).map((r) => ({ ...r, bold: r.bold || forceBold }));
    const lines = wrapRuns(runs, fonts, size, WIDTH - indent);
    for (const line of lines) {
      ensure(LEADING);
      drawLine(page, line, fonts, size, MARGIN + indent, y);
      y -= LEADING;
    }
  };

  newPage();
  const lines = pdfSafe(input.body).split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trimEnd();
    const compact = line.trim().toLowerCase().replace(/\s/g, '');
    if (compact === '===') {
      newPage();
    } else if (compact === '{{salary_table}}') {
      salaryTable();
    } else if (line.startsWith('# ')) {
      ensure(40);
      y -= 4;
      const title = line.slice(2).trim().replace(/\*\*/g, '');
      const wrapped = wrapRuns([{ text: title, bold: true }], fonts, 13, WIDTH);
      for (const l of wrapped) {
        page.drawText(l.map((w, i) => (i && w.spaceBefore ? ' ' : '') + w.text).join(''), {
          x: (A4.width - lineWidth(l, fonts, 13)) / 2, y, size: 13, font: fonts.bold, color: INK,
        });
        y -= 18;
      }
      y -= 6;
    } else if (line.startsWith('## ')) {
      ensure(34);
      y -= 4;
      paragraph(line.slice(3).trim().replace(/\*\*/g, ''), 11, 0, true);
      y -= 1;
    } else if (/^\s*-\s+/.test(line)) {
      ensure(LEADING);
      page.drawCircle({ x: MARGIN + 8, y: y + 3.4, size: 1.5, color: INK });
      paragraph(line.replace(/^\s*-\s+/, ''), BODY_SIZE, 18);
    } else if (line.trim() === '') {
      y -= 7;
    } else {
      paragraph(line, BODY_SIZE);
    }
  }

  function salaryTable() {
    const rows = (input.salaryRows ?? []).filter((r) => r.monthly > 0);
    if (rows.length === 0) {
      paragraph('(No salary structure is on file for this employee.)', BODY_SIZE);
      return;
    }
    const rowH = 18;
    ensure(rowH * (rows.length + 2) + 12);
    y -= 2;
    const x0 = MARGIN;
    const x1 = A4.width - MARGIN;
    const colMonthly = x1 - 150;
    const top = y + 12;
    page.drawRectangle({ x: x0, y: top - rowH, width: WIDTH, height: rowH, color: SHADE });
    page.drawText('Component', { x: x0 + 8, y: top - 12.5, size: 9.5, font: fonts.bold, color: INK });
    textRight(page, 'Per month (Rs.)', fonts.bold, 9.5, colMonthly + 20, top - 12.5);
    textRight(page, 'Per year (Rs.)', fonts.bold, 9.5, x1 - 8, top - 12.5);
    let ry = top - rowH;
    let total = 0;
    for (const r of rows) {
      total += r.monthly;
      page.drawText(fit(pdfSafe(r.label), fonts.regular, 9.5, colMonthly - x0 - 90), { x: x0 + 8, y: ry - 12.5, size: 9.5, font: fonts.regular, color: INK });
      textRight(page, inr(r.monthly), fonts.regular, 9.5, colMonthly + 20, ry - 12.5);
      textRight(page, inr(r.monthly * 12), fonts.regular, 9.5, x1 - 8, ry - 12.5);
      ry -= rowH;
      page.drawLine({ start: { x: x0, y: ry }, end: { x: x1, y: ry }, thickness: 0.4, color: LINE });
    }
    page.drawText('Gross salary', { x: x0 + 8, y: ry - 12.5, size: 9.5, font: fonts.bold, color: INK });
    textRight(page, inr(total), fonts.bold, 9.5, colMonthly + 20, ry - 12.5);
    textRight(page, inr(total * 12), fonts.bold, 9.5, x1 - 8, ry - 12.5);
    ry -= rowH;
    page.drawRectangle({ x: x0, y: ry, width: WIDTH, height: top - ry, borderColor: LINE, borderWidth: 0.8 });
    y = ry - 20;
  }

  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: MARGIN, y: 44 }, end: { x: A4.width - MARGIN, y: 44 }, thickness: 0.4, color: LINE });
    if (input.footerNote) {
      p.drawText(fit(pdfSafe(input.footerNote), fonts.regular, 7.5, WIDTH - 70), { x: MARGIN, y: 32, size: 7.5, font: fonts.regular, color: MUTED });
    }
    textRight(p, `Page ${i + 1} of ${pages.length}`, fonts.regular, 7.5, A4.width - MARGIN, 32, MUTED);
  });
  void textCentre;
  return doc.save();
}

export type { Fonts };
