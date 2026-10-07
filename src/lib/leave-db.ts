import type { Sql } from './db';
import { computeBalances, countLeaveDays, type Balance, type LeaveTypeInfo } from './leave';
import { firstDay, lastDay } from './payroll/period';

export async function leaveCalendar(sql: Sql, clientId: string): Promise<{ weeklyOff: number[]; holidays: Set<string> }> {
  const client = await sql.one<{ weekly_off: number[] }>('select weekly_off from clients where id = $1', [clientId]);
  const rows = await sql<{ day: string }>('select day from holidays where client_id = $1', [clientId]);
  return { weeklyOff: client?.weekly_off ?? [0], holidays: new Set(rows.map((r) => r.day)) };
}

export async function employeeBalances(sql: Sql, clientId: string, employeeId: string, year: number): Promise<Balance[]> {
  const types = await sql<LeaveTypeInfo>(
    'select id, code, name, annual_quota, paid from leave_types where client_id = $1 and active order by paid desc, code',
    [clientId],
  );
  const requests = await sql<{ leave_type_id: string; days: number; status: string }>(
    'select leave_type_id, days, status from leave_requests where employee_id = $1 and extract(year from from_date) = $2',
    [employeeId, year],
  );
  const adjustments = await sql<{ leave_type_id: string; days: number }>(
    'select leave_type_id, days from leave_adjustments where employee_id = $1 and year = $2',
    [employeeId, year],
  );
  return computeBalances(types, requests, adjustments);
}

export interface LeaveRow {
  id: string;
  employee_id: string;
  full_name: string;
  emp_code: string;
  type_name: string;
  type_code: string;
  from_date: string;
  to_date: string;
  half_day: boolean;
  days: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  decision_note: string;
  created_at: Date;
}

export const LEAVE_ROW_SQL = `select r.id, r.employee_id, e.full_name, e.emp_code, t.name as type_name, t.code as type_code,
    r.from_date, r.to_date, r.half_day, r.days, r.reason, r.status, r.decision_note, r.created_at
  from leave_requests r join employees e on e.id = r.employee_id join leave_types t on t.id = r.leave_type_id`;

/** Approved unpaid leave days falling inside one month, per employee. */
export async function unpaidLeaveDays(sql: Sql, clientId: string, period: string): Promise<Map<string, number>> {
  const from = firstDay(period);
  const to = lastDay(period);
  const rows = await sql<{ employee_id: string; from_date: string; to_date: string; half_day: boolean }>(
    `select r.employee_id, r.from_date, r.to_date, r.half_day
       from leave_requests r join leave_types t on t.id = r.leave_type_id
      where r.client_id = $1 and r.status = 'approved' and not t.paid and r.from_date <= $3 and r.to_date >= $2`,
    [clientId, from, to],
  );
  const out = new Map<string, number>();
  if (rows.length === 0) return out;
  const cal = await leaveCalendar(sql, clientId);
  for (const r of rows) {
    const days = countLeaveDays(r.from_date, r.to_date, r.half_day, cal.weeklyOff, cal.holidays, { from, to });
    out.set(r.employee_id, (out.get(r.employee_id) ?? 0) + days);
  }
  return out;
}
