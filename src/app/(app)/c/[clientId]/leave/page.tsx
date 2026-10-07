import { as, requireClientAccess } from '@/lib/auth';
import { getClient } from '@/lib/clients';
import {
  addHolidayAction, addLeaveAdjustmentAction, addStandardLeaveTypesAction, deleteHolidayAction, saveLeaveTypeAction,
} from '@/lib/actions/leave';
import { SubmitButton } from '@/components/client';
import { ApplyLeaveForm, LeaveItem } from '@/components/leave';
import { Card, CheckField, Empty, Flash, TextField } from '@/components/ui';
import { dmy } from '@/lib/format';
import { WEEKDAY_NAMES } from '@/lib/leave';
import { LEAVE_ROW_SQL, type LeaveRow } from '@/lib/leave-db';
import { todayIso } from '@/lib/payroll/period';

export const metadata = { title: 'Leave' };

interface TypeRow { id: string; code: string; name: string; annual_quota: number; paid: boolean; active: boolean }

export default async function LeavePage({ params, searchParams }: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { clientId } = await params;
  const user = await requireClientAccess(clientId);
  const client = await getClient(user, clientId);
  const year = Number(todayIso().slice(0, 4));
  const data = await as(user, async (sql) => {
    const types = await sql<TypeRow>('select id, code, name, annual_quota, paid, active from leave_types where client_id = $1 order by active desc, paid desc, code', [client.id]);
    const holidays = await sql<{ id: string; day: string; name: string }>('select id, day, name from holidays where client_id = $1 and day >= $2 order by day', [client.id, `${year}-01-01`]);
    const pending = await sql<LeaveRow>(`${LEAVE_ROW_SQL} where r.client_id = $1 and r.status = 'pending' order by r.from_date`, [client.id]);
    const recent = await sql<LeaveRow>(`${LEAVE_ROW_SQL} where r.client_id = $1 and r.status <> 'pending' order by r.created_at desc limit 40`, [client.id]);
    const employees = await sql<{ id: string; emp_code: string; full_name: string }>("select id, emp_code, full_name from employees where client_id = $1 and status <> 'exited' order by emp_code", [client.id]);
    const used = await sql<{ employee_id: string; leave_type_id: string; taken: number; pending: number }>(
      `select employee_id, leave_type_id,
              coalesce(sum(days) filter (where status = 'approved'), 0) as taken,
              coalesce(sum(days) filter (where status = 'pending'), 0) as pending
         from leave_requests where client_id = $1 and extract(year from from_date) = $2 group by 1, 2`,
      [client.id, year],
    );
    const adjusted = await sql<{ employee_id: string; leave_type_id: string; days: number }>(
      'select employee_id, leave_type_id, sum(days) as days from leave_adjustments where client_id = $1 and year = $2 group by 1, 2',
      [client.id, year],
    );
    return { types, holidays, pending, recent, employees, used, adjusted };
  });
  const back = `/c/${client.id}/leave`;
  const active = data.types.filter((t) => t.active);
  const cell = (emp: string, t: TypeRow) => {
    const u = data.used.find((x) => x.employee_id === emp && x.leave_type_id === t.id);
    const a = data.adjusted.find((x) => x.employee_id === emp && x.leave_type_id === t.id)?.days ?? 0;
    if (!t.paid) return u?.taken ? `${u.taken} taken` : '–';
    const left = t.annual_quota + a - (u?.taken ?? 0) - (u?.pending ?? 0);
    return `${left}${u?.pending ? ` (${u.pending} waiting)` : ''}`;
  };
  return (
    <div className="space-y-5">
      <Flash params={await searchParams} />

      <Card title={`Waiting for approval (${data.pending.length})`}>
        {data.pending.length === 0 ? (
          <p className="text-sm text-stone-600">Nothing is waiting.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {data.pending.map((r) => <LeaveItem key={r.id} row={r} back={back} showName canDecide canCancel={false} />)}
          </ul>
        )}
      </Card>

      <Card title="Apply on behalf of an employee">
        <ApplyLeaveForm clientId={client.id} back={back} types={active} employees={data.employees} />
      </Card>

      <Card title={`Balances for ${year}`}>
        {active.length === 0 || data.employees.length === 0 ? (
          <p className="text-sm text-stone-600">Set up leave types and add employees to see balances.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr>
                    <th className="th">Employee</th>
                    {active.map((t) => <th key={t.id} className="th num">{t.code}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {data.employees.map((e) => (
                    <tr key={e.id}>
                      <td className="td"><span className="font-mono text-xs text-stone-500">{e.emp_code}</span> {e.full_name}</td>
                      {active.map((t) => <td key={t.id} className="td num">{cell(e.id, t)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-stone-500">Days left this year, after approved and waiting requests. The full yearly days are given from 1 January; they are not reduced for people who join mid-year.</p>
            <details className="mt-3 rounded-md border border-stone-200 p-3">
              <summary className="cursor-pointer text-sm font-medium text-brand-700">Add or take away days (opening balance, carry forward, comp-off)</summary>
              <form action={addLeaveAdjustmentAction} className="mt-3 grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-6">
                <input type="hidden" name="client_id" value={client.id} />
                <input type="hidden" name="back" value={back} />
                <div className="lg:col-span-2">
                  <label htmlFor="adj_employee" className="mb-1 block text-sm font-medium text-stone-700">Employee</label>
                  <select id="adj_employee" name="employee_id" required className="input" defaultValue="">
                    <option value="">Choose…</option>
                    {data.employees.map((e) => <option key={e.id} value={e.id}>{e.emp_code} · {e.full_name}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="adj_type" className="mb-1 block text-sm font-medium text-stone-700">Kind of leave</label>
                  <select id="adj_type" name="leave_type_id" required className="input">
                    {active.filter((t) => t.paid).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <TextField label="Year" name="year" type="number" defaultValue={year} required />
                <TextField label="Days (+ or -)" name="days" type="number" step="0.5" required />
                <TextField label="Note" name="note" maxLength={200} />
                <div><SubmitButton>Save</SubmitButton></div>
              </form>
            </details>
          </>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card
          title="Leave types"
          actions={
            data.types.length === 0 ? (
              <form action={addStandardLeaveTypesAction}>
                <input type="hidden" name="client_id" value={client.id} />
                <input type="hidden" name="back" value={back} />
                <SubmitButton className="btn-secondary" pendingText="Adding…">Add the standard set</SubmitButton>
              </form>
            ) : undefined
          }
        >
          {data.types.length === 0 && <p className="mb-3 text-sm text-stone-600">None yet. The standard set is Casual 12, Sick 12, Earned 15, Compensatory Off and Leave Without Pay; you can change the days afterwards.</p>}
          <div className="space-y-2">
            {data.types.map((t) => (
              <form key={t.id} action={saveLeaveTypeAction} className="grid grid-cols-12 items-end gap-2">
                <input type="hidden" name="client_id" value={client.id} />
                <input type="hidden" name="back" value={back} />
                <input type="hidden" name="id" value={t.id} />
                <input name="code" defaultValue={t.code} aria-label="Short code" className="input col-span-2 font-mono" />
                <input name="name" defaultValue={t.name} aria-label="Name" className="input col-span-4" />
                <input name="annual_quota" type="number" step="0.5" min={0} defaultValue={t.annual_quota} aria-label={`Days per year for ${t.name}`} className="input col-span-2 text-right" />
                <div className="col-span-2 space-y-0.5 text-xs">
                  <CheckField label="Paid" name="paid" defaultChecked={t.paid} />
                  <CheckField label="In use" name="active" defaultChecked={t.active} />
                </div>
                <div className="col-span-2"><SubmitButton className="btn-secondary w-full">Save</SubmitButton></div>
              </form>
            ))}
          </div>
          <details className="mt-3 rounded-md border border-stone-200 p-3">
            <summary className="cursor-pointer text-sm font-medium text-brand-700">Add another leave type</summary>
            <form action={saveLeaveTypeAction} className="mt-3 grid items-end gap-3 sm:grid-cols-4">
              <input type="hidden" name="client_id" value={client.id} />
              <input type="hidden" name="back" value={back} />
              <TextField label="Short code" name="code" required maxLength={6} placeholder="ML" />
              <TextField label="Name" name="name" required maxLength={60} placeholder="Maternity Leave" />
              <TextField label="Days per year" name="annual_quota" type="number" step="0.5" min={0} defaultValue={0} />
              <div className="space-y-2"><CheckField label="Paid leave" name="paid" defaultChecked /><SubmitButton>Add</SubmitButton></div>
            </form>
          </details>
        </Card>

        <Card title="Holidays">
          <p className="mb-2 text-xs text-stone-500">
            Weekly off: {client.weekly_off.length ? client.weekly_off.map((d) => WEEKDAY_NAMES[d]).join(', ') : 'none'}. Weekly offs and holidays are not counted as leave days.
          </p>
          {data.holidays.length === 0 ? (
            <p className="text-sm text-stone-600">No holidays entered for {year} onwards.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {data.holidays.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                  <span>{dmy(h.day)} · {h.name}</span>
                  <form action={deleteHolidayAction}>
                    <input type="hidden" name="client_id" value={client.id} />
                    <input type="hidden" name="back" value={back} />
                    <input type="hidden" name="id" value={h.id} />
                    <SubmitButton className="btn-secondary" pendingText="Removing…">Remove</SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <form action={addHolidayAction} className="mt-3 grid items-end gap-3 border-t border-stone-200 pt-3 sm:grid-cols-3">
            <input type="hidden" name="client_id" value={client.id} />
            <input type="hidden" name="back" value={back} />
            <TextField label="Date" name="day" type="date" required />
            <TextField label="Holiday" name="name" required maxLength={80} placeholder="Diwali" />
            <SubmitButton>Add holiday</SubmitButton>
          </form>
        </Card>
      </div>

      <Card title="Recent decisions">
        {data.recent.length === 0 ? (
          <Empty>No leave has been decided yet.</Empty>
        ) : (
          <ul className="divide-y divide-stone-100">
            {data.recent.map((r) => <LeaveItem key={r.id} row={r} back={back} showName canDecide={false} canCancel={r.status === 'approved'} />)}
          </ul>
        )}
      </Card>
    </div>
  );
}
