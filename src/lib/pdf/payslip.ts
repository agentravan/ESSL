// One-page A4 payslip.

import { PDFDocument } from 'pdf-lib';
import { inr, rupeesInWords } from '../format';
import { A4, INK, LINE, MARGIN, MUTED, SHADE, fit, loadFonts, pdfSafe, textCentre, textRight } from './draw';

export interface PayslipInput {
  client: { name: string; address: string };
  periodLabel: string;
  employee: [string, string][]; // label/value pairs for the details grid
  days: { base: number; paid: number; lop: number };
  earnings: { label: string; full: number | null; earned: number }[];
  deductions: { label: string; amount: number }[];
  totalEarnings: number;
  totalDeductions: number;
  netPay: number;
  note?: string; // e.g. "DRAFT" or "SAMPLE DATA"
}

export async function renderPayslipPdf(p: PayslipInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(`Payslip ${p.periodLabel}`));
  doc.setProducer('Teamwork HRMS');
  const { regular, bold } = await loadFonts(doc);
  const page = doc.addPage([A4.width, A4.height]);
  const x0 = MARGIN;
  const x1 = A4.width - MARGIN;
  const width = x1 - x0;
  let y = A4.height - MARGIN;

  // header
  textCentre(page, fit(pdfSafe(p.client.name), bold, 15, width), bold, 15, y - 4);
  y -= 22;
  const address = pdfSafe(p.client.address).split(/\r?\n/).map((l) => l.trim()).filter(Boolean).join(', ');
  if (address) {
    textCentre(page, fit(address, regular, 8.5, width), regular, 8.5, y, MUTED);
    y -= 14;
  }
  y -= 6;
  page.drawRectangle({ x: x0, y: y - 8, width, height: 22, color: SHADE });
  textCentre(page, pdfSafe(`Payslip for ${p.periodLabel}`), bold, 11, y - 1);
  y -= 30;

  // employee details, two columns
  const colW = width / 2;
  const details = p.employee.filter(([, v]) => v && v.trim() !== '');
  const rows = Math.ceil(details.length / 2);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < 2; c++) {
      const item = details[r + c * rows];
      if (!item) continue;
      const cx = x0 + c * colW;
      page.drawText(pdfSafe(item[0]), { x: cx + 6, y, size: 8.5, font: regular, color: MUTED });
      page.drawText(fit(pdfSafe(item[1]), bold, 9, colW - 110), { x: cx + 100, y, size: 9, font: bold, color: INK });
    }
    y -= 15;
  }
  y -= 4;
  page.drawLine({ start: { x: x0, y }, end: { x: x1, y }, thickness: 0.6, color: LINE });
  y -= 16;
  const dayText = `Days in month basis: ${p.days.base}     Paid days: ${p.days.paid}     Loss-of-pay days: ${p.days.lop}`;
  page.drawText(dayText, { x: x0 + 6, y, size: 9, font: regular, color: INK });
  y -= 18;

  // earnings and deductions side by side
  const rowH = 17;
  const mid = x0 + width * 0.58;
  const tableTop = y;
  page.drawRectangle({ x: x0, y: y - rowH + 4, width, height: rowH, color: SHADE });
  const headY = y - 8;
  page.drawText('Earnings', { x: x0 + 6, y: headY, size: 9, font: bold, color: INK });
  textRight(page, 'Full month', bold, 9, mid - 78, headY);
  textRight(page, 'Earned', bold, 9, mid - 8, headY);
  page.drawText('Deductions', { x: mid + 6, y: headY, size: 9, font: bold, color: INK });
  textRight(page, 'Amount', bold, 9, x1 - 6, headY);
  y -= rowH;

  const n = Math.max(p.earnings.length, p.deductions.length, 1);
  for (let i = 0; i < n; i++) {
    const ty = y - 8;
    const e = p.earnings[i];
    const d = p.deductions[i];
    if (e) {
      page.drawText(fit(pdfSafe(e.label), regular, 9, mid - x0 - 150), { x: x0 + 6, y: ty, size: 9, font: regular, color: INK });
      if (e.full !== null) textRight(page, inr(e.full), regular, 9, mid - 78, ty);
      textRight(page, inr(e.earned), regular, 9, mid - 8, ty);
    }
    if (d) {
      page.drawText(fit(pdfSafe(d.label), regular, 9, x1 - mid - 80), { x: mid + 6, y: ty, size: 9, font: regular, color: INK });
      textRight(page, inr(d.amount), regular, 9, x1 - 6, ty);
    }
    y -= rowH;
  }
  page.drawLine({ start: { x: x0, y: y + 4 }, end: { x: x1, y: y + 4 }, thickness: 0.6, color: LINE });
  const totY = y - 8;
  page.drawText('Total earnings', { x: x0 + 6, y: totY, size: 9, font: bold, color: INK });
  textRight(page, inr(p.totalEarnings), bold, 9, mid - 8, totY);
  page.drawText('Total deductions', { x: mid + 6, y: totY, size: 9, font: bold, color: INK });
  textRight(page, inr(p.totalDeductions), bold, 9, x1 - 6, totY);
  y -= rowH;
  page.drawRectangle({ x: x0, y: y + 4, width, height: tableTop - y, borderColor: LINE, borderWidth: 0.8 });
  page.drawLine({ start: { x: mid, y: tableTop + 4 }, end: { x: mid, y: y + 4 }, thickness: 0.6, color: LINE });
  y -= 18;

  // net pay
  page.drawRectangle({ x: x0, y: y - 30, width, height: 44, color: SHADE });
  page.drawText('Net pay', { x: x0 + 10, y: y - 4, size: 10, font: regular, color: MUTED });
  page.drawText(`Rs. ${inr(p.netPay)}`, { x: x0 + 10, y: y - 22, size: 15, font: bold, color: INK });
  const words = `Rupees ${rupeesInWords(p.netPay)} only`;
  textRight(page, fit(words, regular, 9, width - 170), regular, 9, x1 - 10, y - 14);
  y -= 52;

  if (p.note) {
    page.drawText(pdfSafe(p.note), { x: x0, y, size: 9, font: bold, color: MUTED });
    y -= 14;
  }
  page.drawText('This is a computer-generated payslip and does not need a signature.', {
    x: x0, y, size: 8, font: regular, color: MUTED,
  });
  return doc.save();
}
