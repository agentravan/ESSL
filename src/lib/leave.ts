// Leave arithmetic. Pure functions on 'YYYY-MM-DD' strings.

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** 0 = Sunday ... 6 = Saturday */
export function weekday(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

export function isWorkingDay(day: string, weeklyOff: number[], holidays: Set<string>): boolean {
  return !weeklyOff.includes(weekday(day)) && !holidays.has(day);
}

/**
 * Leave days in a request: working days only (weekly offs and holidays are not
 * counted), optionally limited to a window such as one month.
 */
export function countLeaveDays(
  from: string,
  to: string,
  halfDay: boolean,
  weeklyOff: number[],
  holidays: Set<string>,
  window?: { from: string; to: string },
): number {
  if (to < from) return 0;
  const start = window && window.from > from ? window.from : from;
  const end = window && window.to < to ? window.to : to;
  if (end < start) return 0;
  const days = eachDay(start, end).filter((d) => isWorkingDay(d, weeklyOff, holidays)).length;
  return halfDay ? (days > 0 ? 0.5 : 0) : days;
}

export interface LeaveTypeInfo {
  id: string;
  code: string;
  name: string;
  annual_quota: number;
  paid: boolean;
}

export interface Balance {
  typeId: string;
  code: string;
  name: string;
  paid: boolean;
  quota: number;
  adjusted: number;
  taken: number;
  pending: number;
  available: number | null; // null for unpaid leave, which has no limit
}

export function computeBalances(
  types: LeaveTypeInfo[],
  requests: { leave_type_id: string; days: number; status: string }[],
  adjustments: { leave_type_id: string; days: number }[],
): Balance[] {
  return types.map((t) => {
    const mine = requests.filter((r) => r.leave_type_id === t.id);
    const taken = mine.filter((r) => r.status === 'approved').reduce((s, r) => s + r.days, 0);
    const pending = mine.filter((r) => r.status === 'pending').reduce((s, r) => s + r.days, 0);
    const adjusted = adjustments.filter((a) => a.leave_type_id === t.id).reduce((s, a) => s + a.days, 0);
    return {
      typeId: t.id, code: t.code, name: t.name, paid: t.paid, quota: t.annual_quota, adjusted, taken, pending,
      available: t.paid ? t.annual_quota + adjusted - taken - pending : null,
    };
  });
}

export const STANDARD_LEAVE_TYPES: { code: string; name: string; annual_quota: number; paid: boolean }[] = [
  { code: 'CL', name: 'Casual Leave', annual_quota: 12, paid: true },
  { code: 'SL', name: 'Sick Leave', annual_quota: 12, paid: true },
  { code: 'EL', name: 'Earned Leave', annual_quota: 15, paid: true },
  { code: 'CO', name: 'Compensatory Off', annual_quota: 0, paid: true },
  { code: 'LWP', name: 'Leave Without Pay', annual_quota: 0, paid: false },
];

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
