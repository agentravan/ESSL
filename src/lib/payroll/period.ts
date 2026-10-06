// Month and financial-year arithmetic on 'YYYY-MM' strings. No Date objects with
// time zones are involved, so results do not depend on where the server runs.

import type { Period } from './types';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function isPeriod(s: string): s is Period {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

export function parsePeriod(p: Period): { year: number; month: number } {
  if (!isPeriod(p)) throw new Error(`Invalid month: ${p}`);
  return { year: Number(p.slice(0, 4)), month: Number(p.slice(5, 7)) };
}

export function makePeriod(year: number, month: number): Period {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function daysInMonth(p: Period): number {
  const { year, month } = parsePeriod(p);
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function periodLabel(p: Period): string {
  const { year, month } = parsePeriod(p);
  return `${MONTHS[month - 1]} ${year}`;
}

export function firstDay(p: Period): string {
  return `${p}-01`;
}

export function lastDay(p: Period): string {
  return `${p}-${String(daysInMonth(p)).padStart(2, '0')}`;
}

export function addMonths(p: Period, n: number): Period {
  const { year, month } = parsePeriod(p);
  const idx = year * 12 + (month - 1) + n;
  return makePeriod(Math.floor(idx / 12), (idx % 12) + 1);
}

/** Financial year label, April to March: '2026-27' for 2026-04 .. 2027-03. */
export function financialYear(p: Period): string {
  const { year, month } = parsePeriod(p);
  const start = month >= 4 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** First month (April) of the financial year that contains p. */
export function fyStart(p: Period): Period {
  const { year, month } = parsePeriod(p);
  return makePeriod(month >= 4 ? year : year - 1, 4);
}

/** April = 0 ... March = 11. */
export function fyMonthIndex(p: Period): number {
  const { month } = parsePeriod(p);
  return (month + 8) % 12;
}

/** Period that a 'YYYY-MM-DD' date falls in. */
export function periodOf(date: string): Period {
  return date.slice(0, 7);
}

export function currentPeriod(now: Date = new Date()): Period {
  // India is UTC+05:30 all year; shift so "this month" matches the office calendar.
  const ist = new Date(now.getTime() + 330 * 60 * 1000);
  return makePeriod(ist.getUTCFullYear(), ist.getUTCMonth() + 1);
}

export function todayIso(now: Date = new Date()): string {
  const ist = new Date(now.getTime() + 330 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}
