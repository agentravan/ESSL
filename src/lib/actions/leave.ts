'use server';

import { as, isFirm, requireUser, type SessionUser } from '../auth';
import { UserError } from '../db';
import { countLeaveDays, STANDARD_LEAVE_TYPES } from '../leave';
import { leaveCalendar } from '../leave-db';
import { isIsoDate } from '../validate';
import { bool, FormError, isUuid, run, str } from './util';

/** The client this user may act on for leave: any for the firm, their own for everyone else. */
function clientFor(user: SessionUser, requested: string): string {
  if (isFirm(user)) {
    if (!isUuid(requested)) throw new FormError('Client not found.');
    return requested;
  }
  if (!user.clientId) throw new FormError('Client not found.');
  return user.clientId;
}

function requireHr(user: SessionUser): void {
  if (!isFirm(user) && user.role !== 'client_hr') throw new UserError('Only HR can change this.');
}

function safeBack(form: FormData, fallback: string): string {
  const back = str(form, 'back');
  return back.startsWith('/c/') || back.startsWith('/me') ? back : fallback;
}

export async function addStandardLeaveTypesAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const back = safeBack(form, '/');
  await run(back, async () => {
    requireHr(user);
    const clientId = clientFor(user, str(form, 'client_id'));
    await as(user, async (sql) => {
      for (const t of STANDARD_LEAVE_TYPES) {
        await sql(
          'insert into leave_types (client_id, code, name, annual_quota, paid) values ($1,$2,$3,$4,$5) on conflict (client_id, code) do nothing',
          [clientId, t.code, t.name, t.annual_quota, t.paid],
        );
      }
      await sql('select audit($1, $2, $3, $4, $5)', ['leave.setup', 'client', clientId, clientId, '{}']);
    });
    return { to: back, msg: 'Standard leave types added. Change the yearly days to match this client\'s policy.' };
  });
}

export async function saveLeaveTypeAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const back = safeBack(form, '/');
  await run(back, async () => {
    requireHr(user);
    const clientId = clientFor(user, str(form, 'client_id'));
    const id = str(form, 'id');
    const code = str(form, 'code').toUpperCase();
    const name = str(form, 'name');
    const quota = Number(str(form, 'annual_quota') || '0');
    if (!/^[A-Z]{2,6}$/.test(code)) throw new FormError('Short code must be 2 to 6 letters, for example CL.');
    if (!name) throw new FormError('Give the leave type a name.');
    if (!Number.isFinite(quota) || quota < 0 || quota > 365 || Math.round(quota * 2) !== quota * 2) {
      throw new FormError('Days per year must be between 0 and 365, in whole or half days.');
    }
    await as(user, async (sql) => {
      if (isUuid(id)) {
        await sql('update leave_types set code=$3, name=$4, annual_quota=$5, paid=$6, active=$7 where id=$1 and client_id=$2', [
          id, clientId, code, name, quota, bool(form, 'paid'), bool(form, 'active'),
        ]);
      } else {
        await sql('insert into leave_types (client_id, code, name, annual_quota, paid) values ($1,$2,$3,$4,$5)', [clientId, code, name, quota, bool(form, 'paid')]);
      }
      await sql('select audit($1, $2, $3, $4, $5)', ['leave.type_save', 'client', clientId, clientId, JSON.stringify({ code, quota })]);
    });
    return { to: back, msg: 'Leave type saved.' };
  });
}

export async function addHolidayAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const back = safeBack(form, '/');
  await run(back, async () => {
    requireHr(user);
    const clientId = clientFor(user, str(form, 'client_id'));
    const day = str(form, 'day');
    const name = str(form, 'name');
    if (!isIsoDate(day)) throw new FormError('Choose the holiday date.');
    if (!name) throw new FormError('Give the holiday a name.');
    await as(user, (sql) =>
      sql('insert into holidays (client_id, day, name) values ($1,$2,$3) on conflict (client_id, day) do update set name = excluded.name', [clientId, day, name]),
    );
    return { to: back, msg: 'Holiday saved.' };
  });
}

export async function deleteHolidayAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const back = safeBack(form, '/');
  await run(back, async () => {
    requireHr(user);
    const clientId = clientFor(user, str(form, 'client_id'));
    const id = str(form, 'id');
    if (!isUuid(id)) throw new FormError('Holiday not found.');
    await as(user, (sql) => sql('delete from holidays where id = $1 and client_id = $2', [id, clientId]));
    return { to: back, msg: 'Holiday removed.' };
  });
}

export async function applyLeaveAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const back = safeBack(form, '/me/leave');
  await run(back, async () => {
    const clientId = clientFor(user, str(form, 'client_id'));
    const onBehalf = isFirm(user) || user.role === 'client_hr';
    const employeeId = onBehalf ? str(form, 'employee_id') : user.employeeId ?? '';
    const typeId = str(form, 'leave_type_id');
    const from = str(form, 'from_date');
    const to = str(form, 'to_date') || from;
    const half = bool(form, 'half_day');
    if (!isUuid(employeeId)) throw new FormError('Choose the employee.');
    if (!isUuid(typeId)) throw new FormError('Choose the kind of leave.');
    if (!isIsoDate(from) || !isIsoDate(to)) throw new FormError('Choose the dates.');
    if (to < from) throw new FormError('The last day cannot be before the first day.');
    if (half && from !== to) throw new FormError('A half day must be a single date.');
    if (from.slice(0, 4) !== to.slice(0, 4)) throw new FormError('Apply separately for each calendar year.');
    const days = await as(user, async (sql) => {
      const type = await sql.one<{ annual_quota: number; paid: boolean; name: string }>(
        'select annual_quota, paid, name from leave_types where id = $1 and client_id = $2 and active',
        [typeId, clientId],
      );
      if (!type) throw new UserError('That kind of leave is not available.');
      const cal = await leaveCalendar(sql, clientId);
      const n = countLeaveDays(from, to, half, cal.weeklyOff, cal.holidays);
      if (n <= 0) throw new UserError('There are no working days in those dates (they are weekly offs or holidays).');
      const clash = await sql.one<{ n: number }>(
        `select count(*) as n from leave_requests
          where employee_id = $1 and status in ('pending', 'approved') and from_date <= $3 and to_date >= $2`,
        [employeeId, from, to],
      );
      if (clash && clash.n > 0) throw new UserError('There is already a leave request covering some of those dates.');
      if (type.paid) {
        const year = Number(from.slice(0, 4));
        const used = await sql.one<{ used: number; adj: number }>(
          `select coalesce((select sum(days) from leave_requests where employee_id = $1 and leave_type_id = $2
                              and status in ('pending', 'approved') and extract(year from from_date) = $3), 0) as used,
                  coalesce((select sum(days) from leave_adjustments where employee_id = $1 and leave_type_id = $2 and year = $3), 0) as adj`,
          [employeeId, typeId, year],
        );
        const available = type.annual_quota + (used?.adj ?? 0) - (used?.used ?? 0);
        if (n > available) throw new UserError(`Only ${available} day(s) of ${type.name} are left for ${year}; this request needs ${n}.`);
      }
      await sql(
        `insert into leave_requests (client_id, employee_id, leave_type_id, from_date, to_date, half_day, days, reason)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [clientId, employeeId, typeId, from, to, half, n, str(form, 'reason').slice(0, 300)],
      );
      await sql('select audit($1, $2, $3, $4, $5)', ['leave.apply', 'employee', employeeId, clientId, JSON.stringify({ from, to, days: n })]);
      return n;
    });
    return { to: back, msg: `Leave request for ${days} day(s) sent for approval.` };
  });
}

export async function decideLeaveAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const back = safeBack(form, '/me/leave');
  await run(back, async () => {
    const id = str(form, 'id');
    const approve = str(form, 'decision') === 'approve';
    if (!isUuid(id)) throw new FormError('Request not found.');
    await as(user, (sql) => sql('select leave_decide($1, $2, $3)', [id, approve, str(form, 'note').slice(0, 300)]));
    return { to: back, msg: approve ? 'Leave approved.' : 'Leave rejected.' };
  });
}

export async function cancelLeaveAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const back = safeBack(form, '/me/leave');
  await run(back, async () => {
    const id = str(form, 'id');
    if (!isUuid(id)) throw new FormError('Request not found.');
    await as(user, (sql) => sql('select leave_cancel($1)', [id]));
    return { to: back, msg: 'Leave request cancelled.' };
  });
}

export async function addLeaveAdjustmentAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const back = safeBack(form, '/');
  await run(back, async () => {
    requireHr(user);
    const clientId = clientFor(user, str(form, 'client_id'));
    const employeeId = str(form, 'employee_id');
    const typeId = str(form, 'leave_type_id');
    const year = Number(str(form, 'year'));
    const days = Number(str(form, 'days'));
    if (!isUuid(employeeId) || !isUuid(typeId)) throw new FormError('Choose the employee and the kind of leave.');
    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new FormError('Enter the year.');
    if (!Number.isFinite(days) || days === 0 || Math.abs(days) > 365 || Math.round(days * 2) !== days * 2) {
      throw new FormError('Days must be a whole or half number, plus to add or minus to take away.');
    }
    await as(user, async (sql) => {
      await sql('insert into leave_adjustments (client_id, employee_id, leave_type_id, year, days, note, created_by) values ($1,$2,$3,$4,$5,$6,$7)', [
        clientId, employeeId, typeId, year, days, str(form, 'note').slice(0, 200), user.id,
      ]);
      await sql('select audit($1, $2, $3, $4, $5)', ['leave.adjust', 'employee', employeeId, clientId, JSON.stringify({ year, days })]);
    });
    return { to: back, msg: 'Balance adjusted.' };
  });
}
