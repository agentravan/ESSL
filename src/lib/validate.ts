// Format checks for Indian identifiers and common inputs. Pure functions.

const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

/** Verhoeff checksum, as used by Aadhaar. */
export function verhoeffValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let c = 0;
  const reversed = digits.split('').reverse();
  for (let i = 0; i < reversed.length; i++) {
    c = VERHOEFF_D[c][VERHOEFF_P[i % 8][Number(reversed[i])]];
  }
  return c === 0;
}

export function cleanAadhaar(v: string): string {
  return v.replace(/[\s-]/g, '');
}

export function aadhaarProblem(v: string): string | null {
  const a = cleanAadhaar(v);
  if (!/^\d{12}$/.test(a)) return 'Aadhaar must be 12 digits.';
  if (/^[01]/.test(a)) return 'Aadhaar cannot start with 0 or 1.';
  if (!verhoeffValid(a)) return 'Aadhaar number fails its check digit; it is probably mistyped.';
  return null;
}

export function cleanPan(v: string): string {
  return v.replace(/\s/g, '').toUpperCase();
}

export function panProblem(v: string): string | null {
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(cleanPan(v)) ? null : 'PAN must look like ABCDE1234F.';
}

export function cleanIfsc(v: string): string {
  return v.replace(/\s/g, '').toUpperCase();
}

export function ifscProblem(v: string): string | null {
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(cleanIfsc(v)) ? null : 'IFSC must look like HDFC0001234.';
}

export function cleanAccount(v: string): string {
  return v.replace(/[\s-]/g, '');
}

export function accountProblem(v: string): string | null {
  return /^\d{9,18}$/.test(cleanAccount(v)) ? null : 'Bank account number must be 9 to 18 digits.';
}

export function uanProblem(v: string): string | null {
  return /^\d{12}$/.test(v.trim()) ? null : 'UAN must be 12 digits.';
}

export function emailProblem(v: string): string | null {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? null : 'That does not look like an email address.';
}

export function isIsoDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Accepts 2026-10-07, 07-10-2026, 07/10/2026 and 7.10.2026 (day first, as written in India)
 * and returns 'YYYY-MM-DD', or null when the text is not a real date.
 */
export function parseDateLoose(v: string): string | null {
  const s = v.trim();
  if (isIsoDate(s)) return s;
  const m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);
  if (!m) return null;
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return isIsoDate(iso) ? iso : null;
}

/** Parses "25,000", "25000.50", "Rs 25,000". Returns null when it is not a non-negative number. */
export function parseAmount(v: string): number | null {
  const s = v.replace(/rs\.?|inr|₹|,|\s/gi, '');
  if (s === '') return null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Number(s);
}

export function maskPan(pan: string): string {
  return 'XXXXXX' + pan.slice(-4);
}

export function last4(v: string): string {
  return v.slice(-4);
}

export function passwordProblem(pw: string): string | null {
  if (pw.length < 10) return 'Password must be at least 10 characters.';
  if (pw.length > 200) return 'Password is too long.';
  if (/^(.)\1+$/.test(pw)) return 'Password cannot be one repeated character.';
  return null;
}
