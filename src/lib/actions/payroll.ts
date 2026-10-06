'use server';

import { as, requireClientAccess, requireFirm } from '../auth';
import { UserError } from '../db';
import { computeRun } from '../payroll/run';
import { daysInMonth, firstDay, isPeriod, periodLabel } from '../payroll/period';
import { bool, FormError, isUuid, run, str } from './util';

export async function runPayrollAction(form: FormData): Promise<void> {
  const user = await requireFirm();
  const clientId = str(form, 'client_id');
  if (!isUuid(clientId)) return;
  await run(`/c/${clientId}/payroll`, async () => {
    const period = str(form, 'period');
    if (!isPeriod(period)) throw new FormError('Choose a month.');
    const { runId, totals } = await as(user, (sql) => computeRun(sql, user.id, clientId, period));
    return { to: `/c/${clientId}/payroll/${runId}`, msg: `Calculated ${periodLabel(period)} for ${totals.headcount} employee(s).` };
  });
}

async function runInfo(user: Awaited<ReturnType<typeof requireFirm>>, runId: string) {
  const info = await as(user, (sql) =>
    sql.one<{ id: string; client_id: string; period: string; status: string }>(
      'select id, client_id, period::text, status from payroll_runs where id = $1',
      [runId],
    ),
  );
  if (!info) throw new UserError('Payroll month not found.');
  return info;
}

export async function recalculateAction(form: FormData): Promise<void> {
  const user = await requireFirm();
  const runId = str(form, 'run_id');
  const clientId = str(form, 'client_id');
  if (!isUuid(runId) || !isUuid(clientId)) return;
  const back = str(form, 'back') || `/c/${clientId}/payroll/${runId}`;
  await run(back, async () => {
    const info = await runInfo(user, runId);
    await as(user, (sql) => computeRun(sql, user.id, info.client_id, info.period.slice(0, 7)));
    return { to: back, msg: 'Recalculated.' };
  });
}

export async function lockRunAction(form: FormData): Promise<void> {
  const user = await requireFirm();
  const runId = str(form, 'run_id');
  const clientId = str(form, 'client_id');
  if (!isUuid(runId) || !isUuid(clientId)) return;
  const back = `/c/${clientId}/payroll/${runId}`;
  await run(back, async () => {
    const info = await runInfo(user, runId);
    await as(user, async (sql) => {
      // Recalculate first so what gets locked reflects the latest attendance and salary data.
      const { totals } = await computeRun(sql, user.id, info.client_id, info.period.slice(0, 7));
      if (totals.headcount === 0) throw new UserError('There is nobody on this payroll, so there is nothing to lock.');
      await sql("update payroll_runs set status = 'locked', locked_at = now(), locked_by = $2 where id = $1", [runId, user.id]);
      await sql('select audit($1, $2, $3, $4, $5)', ['payroll.lock', 'payroll_run', runId, info.client_id, JSON.stringify({ period: info.period })]);
    });
    return { to: back, msg: `${periodLabel(info.period.slice(0, 7))} is locked. Payslips are now visible to the client and to employees with a login.` };
  });
}

export async function unlockRunAction(form: FormData): Promise<void> {
  const user = await requireFirm();
  const runId = str(form, 'run_id');
  const clientId = str(form, 'client_id');
  if (!isUuid(runId) || !isUuid(clientId)) return;
  const back = `/c/${clientId}/payroll/${runId}`;
  await run(back, async () => {
    if (user.role !== 'firm_admin') throw new UserError('Only an administrator can unlock payroll.');
    const info = await runInfo(user, runId);
    await as(user, async (sql) => {
      const later = await sql.one<{ n: number }>(
        "select count(*) as n from payroll_runs where client_id = $1 and period > $2 and status = 'locked'",
        [info.client_id, info.period],
      );
      if (later && later.n > 0) throw new UserError('A later month is locked. Unlock the later month first, so tax figures stay consistent.');
      await sql("update payroll_runs set status = 'draft', locked_at = null, locked_by = null where id = $1", [runId]);
      await sql('select audit($1, $2, $3, $4, $5)', ['payroll.unlock', 'payroll_run', runId, info.client_id, JSON.stringify({ period: info.period })]);
    });
    return { to: back, msg: 'Unlocked. Payslips for this month are hidden from the client and employees until it is locked again.' };
  });
}

export async function deleteRunAction(form: FormData): Promise<void> {
  const user = await requireFirm();
  const runId = str(form, 'run_id');
  const clientId = str(form, 'client_id');
  if (!isUuid(runId) || !isUuid(clientId)) return;
  await run(`/c/${clientId}/payroll/${runId}`, async () => {
    const info = await runInfo(user, runId);
    await as(user, async (sql) => {
      await sql('delete from payroll_runs where id = $1', [runId]);
      await sql('select audit($1, $2, $3, $4, $5)', ['payroll.delete_draft', 'payroll_run', runId, info.client_id, JSON.stringify({ period: info.period })]);
    });
    return { to: `/c/${clientId}/payroll`, msg: `Draft for ${periodLabel(info.period.slice(0, 7))} deleted.` };
  });
}

export async function addAdjustmentAction(form: FormData): Promise<void> {
  const user = await requireFirm();
  const clientId = str(form, 'client_id');
  const employeeId = str(form, 'employee_id');
  const back = str(form, 'back');
  if (!isUuid(clientId) || !isUuid(employeeId) || !back.startsWith(`/c/${clientId}/`)) return;
  await run(back, async () => {
    const period = str(form, 'period');
    const kind = str(form, 'kind');
    const label = str(form, 'label');
    const amount = Number(str(form, 'amount'));
    if (!isPeriod(period)) throw new FormError('Month is missing.');
    if (!['earning', 'deduction'].includes(kind)) throw new FormError('Choose earning or deduction.');
    if (!label || label.length > 60) throw new FormError('Give the item a short name.');
    if (!Number.isFinite(amount) || amount <= 0) throw new FormError('Amount must be more than zero.');
    await as(user, async (sql) => {
      await sql(
        'insert into payroll_adjustments (client_id, employee_id, period, kind, label, amount, taxable) values ($1,$2,$3,$4,$5,$6,$7)',
        [clientId, employeeId, firstDay(period), kind, label, amount, kind === 'earning' ? bool(form, 'taxable') : false],
      );
      await sql('select audit($1, $2, $3, $4, $5)', ['adjustment.add', 'employee', employeeId, clientId, JSON.stringify({ period, kind, label, amount })]);
      await computeRun(sql, user.id, clientId, period);
    });
    return { to: back, msg: 'Added and recalculated.' };
  });
}

export async function deleteAdjustmentAction(form: FormData): Promise<void> {
  const user = await requireFirm();
  const clientId = str(form, 'client_id');
  const id = str(form, 'id');
  const back = str(form, 'back');
  if (!isUuid(clientId) || !isUuid(id) || !back.startsWith(`/c/${clientId}/`)) return;
  await run(back, async () => {
    await as(user, async (sql) => {
      const row = await sql.one<{ period: string; employee_id: string }>(
        'delete from payroll_adjustments where id = $1 and client_id = $2 returning period::text, employee_id',
        [id, clientId],
      );
      if (!row) throw new UserError('That item no longer exists.');
      await sql('select audit($1, $2, $3, $4, $5)', ['adjustment.delete', 'employee', row.employee_id, clientId, JSON.stringify({ period: row.period })]);
      await computeRun(sql, user.id, clientId, row.period.slice(0, 7));
    });
    return { to: back, msg: 'Removed and recalculated.' };
  });
}

/** Saves loss-of-pay days for every employee listed on the attendance screen. */
export async function saveAttendanceAction(form: FormData): Promise<void> {
  const clientId = str(form, 'client_id');
  if (!isUuid(clientId)) return;
  const user = await requireClientAccess(clientId);
  const period = str(form, 'period');
  const back = `/c/${clientId}/attendance?period=${encodeURIComponent(period)}`;
  await run(back, async () => {
    if (!isPeriod(period)) throw new FormError('Choose a month.');
    const dim = daysInMonth(period);
    const entries: { id: string; lop: number; remarks: string }[] = [];
    for (const [key, value] of form.entries()) {
      if (!key.startsWith('lop_') || typeof value !== 'string') continue;
      const id = key.slice(4);
      if (!isUuid(id)) continue;
      const raw = value.trim();
      const lop = raw === '' ? 0 : Number(raw);
      if (!Number.isFinite(lop) || lop < 0 || lop > dim) throw new FormError(`Loss-of-pay days must be between 0 and ${dim}.`);
      if (Math.round(lop * 2) !== lop * 2) throw new FormError('Loss-of-pay days can be whole or half days only.');
      entries.push({ id, lop, remarks: str(form, `rem_${id}`).slice(0, 120) });
    }
    await as(user, async (sql) => {
      for (const e of entries) {
        await sql(
          `insert into attendance_monthly (client_id, employee_id, period, lop_days, remarks, updated_by, updated_at)
           values ($1, $2, $3, $4, $5, $6, now())
           on conflict (employee_id, period) do update
             set lop_days = excluded.lop_days, remarks = excluded.remarks, updated_by = excluded.updated_by, updated_at = now()
           where attendance_monthly.lop_days is distinct from excluded.lop_days
              or attendance_monthly.remarks is distinct from excluded.remarks`,
          [clientId, e.id, firstDay(period), e.lop, e.remarks, user.id],
        );
      }
      await sql('select audit($1, $2, $3, $4, $5)', ['attendance.save', 'client', clientId, clientId, JSON.stringify({ period, employees: entries.length })]);
    });
    return { to: back, msg: `Attendance for ${periodLabel(period)} saved.` };
  });
}
