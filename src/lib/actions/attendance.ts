'use server';

import { as, requireClientAccess, requireEmployee } from '../auth';
import { distanceMetres, istToIso, parsePunchSheet, type PunchProblem } from '../attendance';
import { loadMonthAttendance } from '../attendance-db';
import { UserError, friendlyError } from '../db';
import { readTable } from '../import/table';
import { firstDay, isPeriod, periodLabel } from '../payroll/period';
import { FormError, isUuid, run, str } from './util';

/** An employee punches in or out, now. The database refuses any other time or any other person. */
export async function punchAction(form: FormData): Promise<void> {
  const user = await requireEmployee();
  await run('/me/attendance', async () => {
    const kind = str(form, 'kind');
    if (kind !== 'in' && kind !== 'out') throw new FormError('Choose punch in or punch out.');
    const lat = str(form, 'lat') === '' ? null : Number(str(form, 'lat'));
    const lng = str(form, 'lng') === '' ? null : Number(str(form, 'lng'));
    await as(user, async (sql) => {
      const client = await sql.one<{ office_lat: number | null; office_lng: number | null; office_radius_m: number | null }>(
        'select office_lat, office_lng, office_radius_m from clients where id = $1',
        [user.clientId],
      );
      let distance: number | null = null;
      const fenced = client?.office_lat != null && client.office_lng != null && client.office_radius_m != null;
      const located = lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
      if (fenced) {
        if (!located) throw new UserError('Your location is needed to punch. Allow location access in your browser and try again.');
        distance = distanceMetres(client!.office_lat!, client!.office_lng!, lat!, lng!);
        if (distance > client!.office_radius_m!) {
          throw new UserError(`You are about ${distance} m from the office, outside the ${client!.office_radius_m} m allowed. Punch not recorded.`);
        }
      }
      const last = await sql.one<{ kind: string }>(
        "select kind from attendance_punches where employee_id = $1 and ts > now() - interval '18 hours' order by ts desc limit 1",
        [user.employeeId],
      );
      if (last?.kind === kind) throw new UserError(kind === 'in' ? 'You are already punched in.' : 'You are already punched out.');
      if (kind === 'out' && !last) throw new UserError('Punch in first.');
      await sql(
        "insert into attendance_punches (client_id, employee_id, ts, kind, source, lat, lng, distance_m, created_by) values ($1,$2,now(),$3,'web',$4,$5,$6,$7)",
        [user.clientId, user.employeeId, kind, located ? lat : null, located ? lng : null, distance, user.id],
      );
    });
    return { to: '/me/attendance', msg: kind === 'in' ? 'Punched in.' : 'Punched out.' };
  });
}

export interface PunchImportState {
  problems?: PunchProblem[];
  error?: string;
  imported?: number;
  skipped?: number;
  fileName?: string;
  layout?: string;
}

/** Loads a punch file from a biometric machine or a spreadsheet. All rows or none. */
export async function importPunchesAction(_prev: PunchImportState, form: FormData): Promise<PunchImportState> {
  const clientId = str(form, 'client_id');
  if (!isUuid(clientId)) return { error: 'Client not found.' };
  const user = await requireClientAccess(clientId);
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose a file first.' };
  if (file.size > 4 * 1024 * 1024) return { error: 'The file is larger than 4 MB. Upload one month at a time.' };
  let table: string[][];
  try {
    table = await readTable(file.name, await file.arrayBuffer());
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'The file could not be read.', fileName: file.name };
  }
  if (table.length > 20001) return { error: 'More than 20,000 rows. Upload one month at a time.', fileName: file.name };
  const parsed = parsePunchSheet(table);
  try {
    return await as(user, async (sql) => {
      const problems = [...parsed.problems];
      const codes = [...new Set(parsed.punches.map((p) => p.empCode))];
      const emps = await sql<{ id: string; emp_code: string }>('select id, emp_code from employees where client_id = $1 and emp_code = any($2::text[])', [clientId, codes]);
      const idOf = new Map(emps.map((e) => [e.emp_code, e.id]));
      const unknown = new Set<string>();
      for (const p of parsed.punches) {
        if (!idOf.has(p.empCode) && !unknown.has(p.empCode)) {
          unknown.add(p.empCode);
          problems.push({ line: p.line, column: 'Employee code', message: `"${p.empCode}" is not an employee code of this client.` });
        }
      }
      if (problems.length > 0) return { problems: problems.sort((a, b) => a.line - b.line).slice(0, 200), fileName: file.name, layout: parsed.layout };
      const rows = parsed.punches.map((p) => ({ employee_id: idOf.get(p.empCode)!, ts: istToIso(p.date, p.time), kind: p.kind }));
      const inserted = await sql<{ id: number }>(
        `insert into attendance_punches (client_id, employee_id, ts, kind, source, created_by)
         select $1, x.employee_id, x.ts, x.kind, 'import', $3
           from jsonb_to_recordset($2::jsonb) as x(employee_id uuid, ts timestamptz, kind text)
         on conflict (employee_id, ts, kind) do nothing
         returning id`,
        [clientId, JSON.stringify(rows), user.id],
      );
      await sql('select audit($1, $2, $3, $4, $5)', ['attendance.import', 'client', clientId, clientId, JSON.stringify({ file: file.name, punches: inserted.length })]);
      return { imported: inserted.length, skipped: rows.length - inserted.length, fileName: file.name, layout: parsed.layout };
    });
  } catch (err) {
    return { error: friendlyError(err), fileName: file.name };
  }
}

/** Copies the unpaid days worked out from the daily register into the monthly attendance used by payroll. */
export async function applySuggestedLopAction(form: FormData): Promise<void> {
  const clientId = str(form, 'client_id');
  if (!isUuid(clientId)) return;
  const user = await requireClientAccess(clientId);
  const period = str(form, 'period');
  const back = `/c/${clientId}/attendance/daily?period=${encodeURIComponent(period)}`;
  await run(back, async () => {
    if (!isPeriod(period)) throw new FormError('Choose a month.');
    const count = await as(user, async (sql) => {
      const month = await loadMonthAttendance(sql, clientId, period);
      if (!month.anyPunches) throw new UserError('There are no punches for this month, so everyone would be marked absent. Upload punches first.');
      for (const e of month.employees) {
        await sql(
          `insert into attendance_monthly (client_id, employee_id, period, lop_days, remarks, updated_by, updated_at)
           values ($1, $2, $3, $4, 'From the daily register', $5, now())
           on conflict (employee_id, period) do update set lop_days = excluded.lop_days, remarks = excluded.remarks, updated_by = excluded.updated_by, updated_at = now()`,
          [clientId, e.id, firstDay(period), Math.min(31, e.summary.suggestedUnpaidDays), user.id],
        );
      }
      await sql('select audit($1, $2, $3, $4, $5)', ['attendance.save', 'client', clientId, clientId, JSON.stringify({ period, from: 'daily register', employees: month.employees.length })]);
      return month.employees.length;
    });
    return { to: `/c/${clientId}/attendance?period=${encodeURIComponent(period)}`, msg: `Unpaid days for ${periodLabel(period)} filled in for ${count} employee(s) from the daily register. Check them, then run payroll.` };
  });
}

