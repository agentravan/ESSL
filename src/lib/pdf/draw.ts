// Small text-layout helpers on top of pdf-lib. The standard PDF fonts cover
// Western European characters only, so anything else is replaced before drawing.

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';

export const A4 = { width: 595.28, height: 841.89 };
export const MARGIN = 54;
export const INK = rgb(0.1, 0.1, 0.12);
export const MUTED = rgb(0.38, 0.4, 0.44);
export const LINE = rgb(0.75, 0.77, 0.8);
export const SHADE = rgb(0.94, 0.95, 0.96);

const REPLACEMENTS: Record<string, string> = {
  '₹': 'Rs.',
  '‘': "'",
  '’': "'",
  '“': '"',
  '”': '"',
  '–': '-',
  '—': '-',
  '…': '...',
  ' ': ' ',
  '•': '-',
  '\t': '    ',
};

/** Makes text safe for the built-in fonts. Line breaks are kept; unsupported characters become '?'. */
export function pdfSafe(text: string): string {
  let out = '';
  for (const ch of text) {
    if (ch === '\n') out += ch;
    else if (ch === '\r') continue;
    else if (REPLACEMENTS[ch] !== undefined) out += REPLACEMENTS[ch];
    else {
      const code = ch.codePointAt(0) ?? 0;
      if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa1 && code <= 0xff)) out += ch;
      else out += '?';
    }
  }
  return out;
}

export interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

export async function loadFonts(doc: PDFDocument): Promise<Fonts> {
  return {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
}

export interface Run {
  text: string;
  bold: boolean;
}

/** Splits "plain **bold** plain" into runs. */
export function parseRuns(line: string): Run[] {
  const runs: Run[] = [];
  const parts = line.split('**');
  parts.forEach((part, i) => {
    if (part) runs.push({ text: part, bold: i % 2 === 1 });
  });
  return runs;
}

interface Word {
  text: string;
  bold: boolean;
  width: number;
  spaceBefore: boolean;
}

/** Breaks runs into lines no wider than maxWidth. */
export function wrapRuns(runs: Run[], fonts: Fonts, size: number, maxWidth: number): Word[][] {
  const words: Word[] = [];
  for (const run of runs) {
    const font = run.bold ? fonts.bold : fonts.regular;
    const pieces = run.text.split(/(\s+)/);
    let pendingSpace = false;
    for (const piece of pieces) {
      if (piece === '') continue;
      if (/^\s+$/.test(piece)) {
        pendingSpace = true;
        continue;
      }
      words.push({ text: piece, bold: run.bold, width: font.widthOfTextAtSize(piece, size), spaceBefore: pendingSpace });
      pendingSpace = false;
    }
    if (pendingSpace && words.length) {
      // a trailing space in this run separates it from the next run
      words.push({ text: '', bold: run.bold, width: 0, spaceBefore: true });
    }
  }
  const space = fonts.regular.widthOfTextAtSize(' ', size);
  const lines: Word[][] = [];
  let current: Word[] = [];
  let width = 0;
  let carrySpace = false;
  for (const w of words) {
    if (w.text === '') {
      carrySpace = true;
      continue;
    }
    const needsSpace = current.length > 0 && (w.spaceBefore || carrySpace);
    carrySpace = false;
    const add = (needsSpace ? space : 0) + w.width;
    if (current.length > 0 && width + add > maxWidth) {
      lines.push(current);
      current = [{ ...w, spaceBefore: false }];
      width = w.width;
    } else {
      current.push({ ...w, spaceBefore: needsSpace });
      width += add;
    }
  }
  if (current.length) lines.push(current);
  return lines;
}

export function lineWidth(line: Word[], fonts: Fonts, size: number): number {
  const space = fonts.regular.widthOfTextAtSize(' ', size);
  return line.reduce((w, word) => w + word.width + (word.spaceBefore ? space : 0), 0);
}

export function drawLine(page: PDFPage, line: Word[], fonts: Fonts, size: number, x: number, y: number): void {
  const space = fonts.regular.widthOfTextAtSize(' ', size);
  let cx = x;
  for (const word of line) {
    if (word.spaceBefore) cx += space;
    page.drawText(word.text, { x: cx, y, size, font: word.bold ? fonts.bold : fonts.regular, color: INK });
    cx += word.width;
  }
}

export function textRight(page: PDFPage, text: string, font: PDFFont, size: number, rightX: number, y: number, color = INK): void {
  page.drawText(text, { x: rightX - font.widthOfTextAtSize(text, size), y, size, font, color });
}

export function textCentre(page: PDFPage, text: string, font: PDFFont, size: number, y: number, color = INK): void {
  page.drawText(text, { x: (A4.width - font.widthOfTextAtSize(text, size)) / 2, y, size, font, color });
}

/** Shortens text with "..." so it fits in maxWidth. */
export function fit(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(t + '...', size) > maxWidth) t = t.slice(0, -1);
  return t + '...';
}
