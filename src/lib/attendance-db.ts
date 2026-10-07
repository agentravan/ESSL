import type { Sql } from './db';
import { clockToMinutes, istParts, summariseMonth, type MonthSummary, type Shift } from './attendance';
import { eachDay, isWorkingDay } from './leave';
import { leaveCalendar } from './leave-db';
import { firstDay, lastDay, todayIso } from './payroll/period';

export interface AttendanceEmployee {
  id: string;
  emp_code: string;
  full_name: string;
  doj: string;
  exit_date: string | null;
}

export interface MonthAttendance {
  employees: (AttendanceEmployee & { summary: MonthSummary })[];
  shift: Shift;
  anyPunches: boolean;
}

/** Daily marks for a month, for the whole client or for chosen employees. */
export async function loadMonthAttendance(sql: Sql, clientId: string, period: string, onlyEmployees?: string[]): Promise<MonthAttendance> {
  const from = firstDay(period);
  const to = lastDay(period);
  const client = await sql.one<{ shift_start: string; shift_end: string; grace_minutes: number }>(
    'select shift_start::text, shift_end::text, grace_minutes from clients where id = $1',
    [clientId],
  );
  const shift: Shift = {
    start: clockToMinutes(client?.shift_start ?? '09:30'),
    end: clockToMinutes(client?.shift_end ?? '18:30'),
    grace: client?.grace_minutes ?? 15,
  };
  const employees = await sql<AttendanceEmployee>(
    `select id, emp_code, full_name, doj, exit_date from employees
      where client_id = $1 and status <> 'pre_onboarding' and doj <= $3 and (exit_date is null or exit_date >= $2)
        and ($4::uuid[] is null or id = any($4::uuid[]))
      order by emp_code`,
    [clientId, from, to, onlyEmployees ?? null],
  );
  const punches = await sql<{ employee_id: string; ts: Date; kind: 'in' | 'out' }>(
    `select employee_id, ts, kind from attendance_punches
      where client_id = $1 and ts >= ($2::date::timestamp at time zone 'Asia/Kolkata')
        and ts < (($3::date + 1)::timestamp at time zone 'Asia/Kolkata')
        and ($4::uuid[] is null or employee_id = any($4::uuid[]))`,
    [clientId, from, to, onlyEmployees ?? null],
  );
  const leaves = await sql<{ employee_id: string; from_date: string; to_date: string; half_day: boolean; paid: boolean }>(
    `select r.employee_id, r.from_date, r.to_date, r.half_day, t.paid
       from leave_requests r join leave_types t on t.id = r.leave_type_id
      where r.client_id = $1 and r.status = 'approved' and r.from_date <= $3 and r.to_date >= $2`,
    [clientId, from, to],
  );
  const cal = await leaveCalendar(sql, clientId);
  const byEmp = new Map<string, Map<string, { minutes: number; kind: 'in' | 'out' }[]>>();
  for (const p of punches) {
    const { date, minutes } = istParts(p.ts);
    const days = byEmp.get(p.employee_id) ?? new Map();
    days.set(date, [...(days.get(date) ?? []), { minutes, kind: p.kind }]);
    byEmp.set(p.employee_id, days);
  }
  const leaveByEmp = new Map<string, Map<string, { paid: boolean; half: boolean }>>();
  for (const l of leaves) {
    const days = leaveByEmp.get(l.employee_id) ?? new Map();
    for (const d of eachDay(l.from_date > from ? l.from_date : from, l.to_date < to ? l.to_date : to)) {
      if (isWorkingDay(d, cal.weeklyOff, cal.holidays)) days.set(d, { paid: l.paid, half: l.half_day });
    }
    leaveByEmp.set(l.employee_id, days);
  }
  const today = todayIso();
  return {
    shift,
    anyPunches: punches.length > 0,
    employees: employees.map((e) => ({
      ...e,
      summary: summariseMonth({
        period, today, doj: e.doj, exitDate: e.exit_date,
        punchesByDate: byEmp.get(e.id) ?? new Map(),
        leaveDates: leaveByEmp.get(e.id) ?? new Map(),
        weeklyOff: cal.weeklyOff, holidays: cal.holidays, shift,
      }),
    })),
  };
}
