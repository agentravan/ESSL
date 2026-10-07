import type { Balance } from '@/lib/leave';
import type { LeaveRow } from '@/lib/leave-db';
import { applyLeaveAction, cancelLeaveAction, decideLeaveAction } from '@/lib/actions/leave';
import { dmy } from '@/lib/format';
import { Badge, CheckField, TextField } from './ui';
import { SubmitButton } from './client';

export const LEAVE_STATUS_TONE = { pending: 'amber', approved: 'green', rejected: 'red', cancelled: 'grey' } as const;
export const LEAVE_STATUS_LABEL = { pending: 'Waiting', approved: 'Approved', rejected: 'Rejected', cancelled: 'Cancelled' } as const;

export function leaveDates(r: { from_date: string; to_date: string; half_day: boolean; days: number }): string {
  const range = r.from_date === r.to_date ? dmy(r.from_date) : `${dmy(r.from_date)} to ${dmy(r.to_date)}`;
  return `${range} · ${r.half_day ? 'half day' : `${r.days} day${r.days === 1 ? '' : 's'}`}`;
}

export function BalanceCards({ balances }: { balances: Balance[] }) {
  if (balances.length === 0) return <p className="text-sm text-stone-600">No leave types have been set up yet.</p>;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {balances.map((b) => (
        <div key={b.typeId} className="card px-3 py-2.5">
          <div className="text-xs font-medium text-stone-500">{b.name}</div>
          <div className="mt-0.5 text-lg font-semibold tabular-nums text-stone-900">{b.available === null ? b.taken : b.available}</div>
          <div className="text-xs text-stone-500">
            {b.available === null ? 'days taken (unpaid)' : `left of ${b.quota + b.adjusted}`}
            {b.pending > 0 ? ` · ${b.pending} waiting` : ''}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ApplyLeaveForm({ clientId, back, types, employees }: {
  clientId: string;
  back: string;
  types: { id: string; name: string; paid: boolean }[];
  employees?: { id: string; emp_code: string; full_name: string }[];
}) {
  if (types.length === 0) return <p className="text-sm text-stone-600">Leave cannot be applied for until leave types are set up.</p>;
  return (
    <form action={applyLeaveAction} className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-6">
      <input type="hidden" name="client_id" value={clientId} />
      <input type="hidden" name="back" value={back} />
      {employees && (
        <div className="lg:col-span-2">
          <label htmlFor="leave_employee" className="mb-1 block text-sm font-medium text-stone-700">Employee</label>
          <select id="leave_employee" name="employee_id" required className="input" defaultValue="">
            <option value="">Choose…</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.emp_code} · {e.full_name}</option>)}
          </select>
        </div>
      )}
      <div>
        <label htmlFor="leave_type_id" className="mb-1 block text-sm font-medium text-stone-700">Kind of leave</label>
        <select id="leave_type_id" name="leave_type_id" required className="input">
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}{t.paid ? '' : ' (unpaid)'}</option>)}
        </select>
      </div>
      <TextField label="First day" name="from_date" type="date" required />
      <TextField label="Last day" name="to_date" type="date" hint="Leave blank for one day." />
      <TextField label="Reason" name="reason" maxLength={300} className={employees ? '' : 'lg:col-span-2'} />
      <div className="sm:col-span-2 lg:col-span-6 flex flex-wrap items-center gap-4">
        <CheckField label="Half day (single date only)" name="half_day" />
        <SubmitButton pendingText="Sending…">Apply for leave</SubmitButton>
      </div>
    </form>
  );
}

/** One leave request with the buttons this viewer is allowed to use. */
export function LeaveItem({ row, back, showName, canDecide, canCancel }: {
  row: LeaveRow;
  back: string;
  showName: boolean;
  canDecide: boolean;
  canCancel: boolean;
}) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
      <div className="min-w-0">
        <div className="font-medium text-stone-900">
          {showName && <>{row.full_name} <span className="font-mono text-xs font-normal text-stone-500">{row.emp_code}</span> · </>}
          {row.type_name} <Badge tone={LEAVE_STATUS_TONE[row.status]}>{LEAVE_STATUS_LABEL[row.status]}</Badge>
        </div>
        <div className="text-stone-600">{leaveDates(row)}</div>
        {row.reason && <div className="text-stone-500">Reason: {row.reason}</div>}
        {row.decision_note && <div className="text-stone-500">Note: {row.decision_note}</div>}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        {canDecide && row.status === 'pending' && (
          <form action={decideLeaveAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="id" value={row.id} />
            <input type="hidden" name="back" value={back} />
            <input name="note" aria-label={`Note for ${row.full_name}`} placeholder="Note (optional)" maxLength={300} className="input w-44" />
            <SubmitButton name="decision" value="approve" className="btn-primary" pendingText="Saving…">Approve</SubmitButton>
            <SubmitButton name="decision" value="reject" className="btn-danger" pendingText="Saving…">Reject</SubmitButton>
          </form>
        )}
        {canCancel && (
          <form action={cancelLeaveAction}>
            <input type="hidden" name="id" value={row.id} />
            <input type="hidden" name="back" value={back} />
            <SubmitButton className="btn-secondary" pendingText="Cancelling…">{row.status === 'pending' ? 'Withdraw' : 'Cancel leave'}</SubmitButton>
          </form>
        )}
      </div>
    </li>
  );
}
