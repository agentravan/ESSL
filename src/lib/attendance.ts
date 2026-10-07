// Daily attendance arithmetic. Pure functions. All clock times are India time (UTC+05:30).

import { eachDay, isWorkingDay } from './leave';
import { firstDay, lastDay } from './payroll/period';
import { parseDateLoose } from './validate';
import { excelSerialToDate } from './import/table';

const IST_MINUTES = 330;

/** 'YYYY-MM-DD' and minutes after midnight, in India time, for an instant. */
export function istParts(ts: Date | string): { date: string; minutes: number } {
  const d = typeof ts === 'string' ? new Date(ts) : ts;
  const shifted = new Date(d.getTime() + IST_MINUTES * 60000);
  return { date: shifted.toISOString().slice(0, 10), minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes() };
}

/** India date and 'HH:MM' -> an ISO instant. */
export function istToIso(date: string, hhmm: string): string {
  return `${date}T${hhmm.length === 5 ? hhmm : hhmm.slice(0, 5)}:00+05:30`;
}

export function hhmm(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function clockToMinutes(clock: string): number {
  const [h, m] = clock.split(':').map(Number);
  return h * 60 + (m || 0);
}

export interface Shift {
  start: number; // minutes after midnight
  end: number;
  grace: number;
}

export interface DaySummary {
  firstIn: number | null;
  lastOut: number | null;
  workedMinutes: number;
  lateMinutes: number;
  earlyMinutes: number;
  overtimeMinutes: number;
  missingOut: boolean;
}

/** Summarises one person's punches for one day (minutes after midnight, India time). */
export function summariseDay(punches: { minutes: number; kind: 'in' | 'out' }[], shift: Shift): DaySummary {
  const ins = punches.filter((p) => p.kind === 'in').map((p) => p.minutes);
  const outs = punches.filter((p) => p.kind === 'out').map((p) => p.minutes);
  const firstIn = ins.length ? Math.min(...ins) : null;
  const lastOut = outs.length ? Math.max(...outs) : null;
  const complete = firstIn !== null && lastOut !== null && lastOut > firstIn;
  const worked = complete ? lastOut! - firstIn! : 0;
  const late = firstIn !== null && firstIn > shift.start + shift.grace ? firstIn - shift.start : 0;
  const early = complete && lastOut! < shift.end ? shift.end - lastOut! : 0;
  const overtime = complete && lastOut! > shift.end ? lastOut! - shift.end : 0;
  return { firstIn, lastOut, workedMinutes: worked, lateMinutes: late, earlyMinutes: early, overtimeMinutes: overtime, missingOut: firstIn !== null && !complete };
}

export type DayMark = 'P' | 'HD' | 'A' | 'L' | 'H' | 'WO' | '';

export interface MonthSummary {
  marks: { date: string; mark: DayMark; summary: DaySummary | null }[];
  present: number;
  halfDays: number;
  absent: number;
  leave: number;
  lateCount: number;
  overtimeMinutes: number;
  suggestedUnpaidDays: number;
}

/**
 * Marks each day of a month for one employee.
 *   P  worked at least half the shift (or punched in with no punch out yet)
 *   HD punched, but worked less than half the shift
 *   A  a working day with no punch and no approved leave
 *   L  approved leave, H holiday, WO weekly off, blank = not on rolls or still in the future
 */
export function summariseMonth(args: {
  period: string;
  today: string;
  doj: string;
  exitDate: string | null;
  punchesByDate: Map<string, { minutes: number; kind: 'in' | 'out' }[]>;
  leaveDates: Map<string, { paid: boolean; half: boolean }>;
  weeklyOff: number[];
  holidays: Set<string>;
  shift: Shift;
}): MonthSummary {
  const out: MonthSummary = { marks: [], present: 0, halfDays: 0, absent: 0, leave: 0, lateCount: 0, overtimeMinutes: 0, suggestedUnpaidDays: 0 };
  const shiftLength = Math.max(60, args.shift.end - args.shift.start);
  for (const date of eachDay(firstDay(args.period), lastDay(args.period))) {
    if (date < args.doj || (args.exitDate && date > args.exitDate) || date > args.today) {
      out.marks.push({ date, mark: '', summary: null });
      continue;
    }
    const punches = args.punchesByDate.get(date);
    const leave = args.leaveDates.get(date);
    const working = isWorkingDay(date, args.weeklyOff, args.holidays);
    if (punches && punches.length > 0) {
      const s = summariseDay(punches, args.shift);
      const half = !s.missingOut && s.workedMinutes < shiftLength / 2;
      out.marks.push({ date, mark: half ? 'HD' : 'P', summary: s });
      if (half) {
        out.halfDays += 1;
        if (working && !leave) out.suggestedUnpaidDays += 0.5;
      } else out.present += 1;
      if (s.lateMinutes > 0) out.lateCount += 1;
      out.overtimeMinutes += s.overtimeMinutes;
    } else if (leave && working) {
      out.marks.push({ date, mark: 'L', summary: null });
      out.leave += leave.half ? 0.5 : 1;
      if (!leave.paid) out.suggestedUnpaidDays += leave.half ? 0.5 : 1;
    } else if (!working) {
      out.marks.push({ date, mark: args.holidays.has(date) ? 'H' : 'WO', summary: null });
    } else {
      out.marks.push({ date, mark: 'A', summary: null });
      out.absent += 1;
      out.suggestedUnpaidDays += 1;
    }
  }
  return out;
}

/** Distance in metres between two points on the earth. */
export function distanceMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// ---------------------------------------------------------------- punch files

export interface ParsedPunch {
  line: number;
  empCode: string;
  date: string;
  time: string; // HH:MM
  kind: 'in' | 'out';
}

export interface PunchProblem {
  line: number;
  column: string;
  message: string;
}

const PUNCH_HEADERS: Record<string, string[]> = {
  code: ['empcode', 'employeecode', 'code', 'empid', 'employeeid', 'enrollno', 'enrollmentno', 'userid', 'empno', 'staffcode', 'ecode', 'acno'],
  date: ['date', 'attendancedate', 'punchdate', 'logdate'],
  time: ['time', 'punchtime', 'logtime'],
  datetime: ['datetime', 'punchdatetime', 'logdatetime', 'timestamp', 'punchtimestamp'],
  kind: ['type', 'inout', 'direction', 'punchtype', 'status', 'io', 'iomode'],
  inTime: ['intime', 'in', 'timein', 'firstin', 'checkin'],
  outTime: ['outtime', 'out', 'timeout', 'lastout', 'checkout'],
};

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** "9:05", "09:05:33", "9.05 AM", "0.378472" (Excel time) -> "09:05", or null. */
export function parseClock(value: string): string | null {
  const v = value.trim();
  if (!v || v === '-' || v === '--:--') return null;
  if (/^0?\.\d+$/.test(v)) {
    const minutes = Math.round(Number(v) * 1440);
    return minutes >= 0 && minutes < 1440 ? hhmm(minutes) : null;
  }
  const m = /^(\d{1,2})[:.](\d{2})(?:[:.]\d{2})?\s*([ap]\.?m\.?)?$/i.exec(v);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const ap = m[3]?.toLowerCase().replace(/\./g, '');
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function parseDay(value: string): string | null {
  return parseDateLoose(value) ?? excelSerialToDate(value);
}

/**
 * Reads a punch file. Two layouts are understood:
 *   one row per punch:   Emp Code, Date, Time, (In/Out)     or  Emp Code, DateTime, (In/Out)
 *   one row per day:     Emp Code, Date, In Time, Out Time   (the usual biometric "daily report" export)
 * Without an In/Out column, a day's first punch is taken as In and its last as Out.
 */
export function parsePunchSheet(table: string[][]): { punches: ParsedPunch[]; problems: PunchProblem[]; layout: string } {
  const problems: PunchProblem[] = [];
  if (table.length < 2) return { punches: [], problems: [{ line: 1, column: '', message: 'The file needs a heading row and at least one row.' }], layout: '' };
  const col: Record<string, number> = {};
  table[0].forEach((h, i) => {
    const key = norm(h);
    for (const [field, names] of Object.entries(PUNCH_HEADERS)) {
      if (col[field] === undefined && names.includes(key)) col[field] = i;
    }
  });
  if (col.code === undefined) problems.push({ line: 1, column: 'Employee code', message: 'No employee code column found.' });
  const daily = col.inTime !== undefined && col.outTime !== undefined && col.date !== undefined;
  const perPunch = col.datetime !== undefined || (col.date !== undefined && col.time !== undefined);
  if (!daily && !perPunch) problems.push({ line: 1, column: 'Date / Time', message: 'Need either Date + Time columns, or Date + In Time + Out Time columns.' });
  if (problems.length) return { punches: [], problems, layout: '' };

  const raw: (ParsedPunch & { explicit: boolean })[] = [];
  for (let r = 1; r < table.length; r++) {
    const row = table[r];
    const line = r + 1;
    const cell = (k: string) => (col[k] === undefined ? '' : (row[col[k]] ?? '').trim());
    const empCode = cell('code').toUpperCase();
    if (!empCode) {
      problems.push({ line, column: 'Employee code', message: 'Employee code is empty.' });
      continue;
    }
    if (daily) {
      const date = parseDay(cell('date'));
      if (!date) {
        problems.push({ line, column: 'Date', message: `"${cell('date')}" is not a date.` });
        continue;
      }
      const tin = cell('inTime');
      const tout = cell('outTime');
      const cin = tin ? parseClock(tin) : null;
      const cout = tout ? parseClock(tout) : null;
      if (tin && tin !== '-' && !cin) problems.push({ line, column: 'In Time', message: `"${tin}" is not a time.` });
      if (tout && tout !== '-' && !cout) problems.push({ line, column: 'Out Time', message: `"${tout}" is not a time.` });
      if (cin) raw.push({ line, empCode, date, time: cin, kind: 'in', explicit: true });
      if (cout && cout !== cin) raw.push({ line, empCode, date, time: cout, kind: 'out', explicit: true });
      continue;
    }
    let date: string | null = null;
    let time: string | null = null;
    if (col.datetime !== undefined) {
      const v = cell('datetime');
      const m = /^(.+?)[ T]+(\d{1,2}[:.]\d{2}(?:[:.]\d{2})?(?:\s*[ap]\.?m\.?)?)$/i.exec(v);
      if (m) {
        date = parseDay(m[1].trim());
        time = parseClock(m[2]);
      } else if (/^\d{5}\.\d+$/.test(v)) {
        date = excelSerialToDate(v);
        time = parseClock(`0.${v.split('.')[1]}`);
      }
      if (!date || !time) {
        problems.push({ line, column: 'Date and time', message: `"${v}" is not a date and time.` });
        continue;
      }
    } else {
      date = parseDay(cell('date'));
      time = parseClock(cell('time'));
      if (!date) problems.push({ line, column: 'Date', message: `"${cell('date')}" is not a date.` });
      if (!time) problems.push({ line, column: 'Time', message: `"${cell('time')}" is not a time.` });
      if (!date || !time) continue;
    }
    const k = norm(cell('kind'));
    let kind: 'in' | 'out' = 'in';
    let explicit = false;
    if (k) {
      if (['in', 'i', 'checkin', '0', 'c/in', 'cin'].includes(k)) { kind = 'in'; explicit = true; }
      else if (['out', 'o', 'checkout', '1', 'cout'].includes(k)) { kind = 'out'; explicit = true; }
      else {
        problems.push({ line, column: 'In/Out', message: `"${cell('kind')}" is not understood. Use In or Out.` });
        continue;
      }
    }
    raw.push({ line, empCode, date, time, kind, explicit });
  }

  // Where the file does not say In or Out: first punch of the day is In, last is Out, the rest are dropped.
  const punches: ParsedPunch[] = [];
  const groups = new Map<string, (ParsedPunch & { explicit: boolean })[]>();
  for (const p of raw) {
    const key = `${p.empCode}|${p.date}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  for (const group of groups.values()) {
    if (group.every((p) => p.explicit)) {
      punches.push(...group.map(({ explicit: _e, ...p }) => p));
      continue;
    }
    const sorted = [...group].sort((a, b) => a.time.localeCompare(b.time));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    punches.push({ line: first.line, empCode: first.empCode, date: first.date, time: first.time, kind: 'in' });
    if (last.time !== first.time) punches.push({ line: last.line, empCode: last.empCode, date: last.date, time: last.time, kind: 'out' });
  }
  return { punches: problems.length ? [] : punches, problems, layout: daily ? 'one row per day' : 'one row per punch' };
}
