// Reads the first sheet of an .xlsx file, or a .csv file, into rows of text.

import JSZip from 'jszip';
import { parseCsv } from '../csv';

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

function textOf(xml: string): string {
  // Concatenates every <t> run; phonetic runs (<rPh>) are skipped.
  const withoutPhonetic = xml.replace(/<rPh[\s\S]*?<\/rPh>/g, '');
  let out = '';
  for (const m of withoutPhonetic.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += unescapeXml(m[1]);
  return out;
}

function columnIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/\d/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export async function parseXlsx(data: ArrayBuffer | Uint8Array): Promise<string[][]> {
  const zip = await JSZip.loadAsync(data);
  const sharedFile = zip.file('xl/sharedStrings.xml');
  const shared: string[] = [];
  if (sharedFile) {
    const xml = await sharedFile.async('string');
    for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>|<si\/>/g)) shared.push(m[1] ? textOf(m[1]) : '');
  }
  const sheetNames = Object.keys(zip.files)
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/(\d+)\.xml$/)![1]) - Number(b.match(/(\d+)\.xml$/)![1]));
  if (sheetNames.length === 0) throw new Error('No worksheet found in the file.');
  const sheet = await zip.file(sheetNames[0])!.async('string');
  const rows: string[][] = [];
  for (const rowMatch of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const c of rowMatch[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const inner = c[2] ?? '';
      const ref = /\br="([A-Z]+)\d+"/.exec(attrs)?.[1];
      const type = /\bt="(\w+)"/.exec(attrs)?.[1];
      const idx = ref ? columnIndex(ref) : row.length;
      let value = '';
      if (type === 'inlineStr') value = textOf(inner);
      else {
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? '';
        if (type === 's') value = shared[Number(v)] ?? '';
        else if (type === 'b') value = v === '1' ? 'TRUE' : 'FALSE';
        else value = unescapeXml(v);
      }
      while (row.length < idx) row.push('');
      row[idx] = value.trim();
    }
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c !== ''));
}

export async function readTable(fileName: string, data: ArrayBuffer): Promise<string[][]> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.xlsx')) return parseXlsx(data);
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) return parseCsv(new TextDecoder('utf-8').decode(data));
  if (lower.endsWith('.xls')) throw new Error('Old .xls files cannot be read. Open the file in Excel and save it as .xlsx or .csv.');
  throw new Error('Upload an Excel (.xlsx) or CSV (.csv) file.');
}

/** Excel stores dates as day numbers; 45000 is in 2023. Returns 'YYYY-MM-DD' or null. */
export function excelSerialToDate(value: string): string | null {
  if (!/^\d{4,6}(\.\d+)?$/.test(value)) return null;
  const serial = Math.floor(Number(value));
  if (serial < 3654 || serial > 80000) return null; // 1910 .. 2119
  const ms = Date.UTC(1899, 11, 30) + serial * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}
