import { as, requireClientAccess } from '@/lib/auth';
import { getClient, DAY_BASIS_LABEL } from '@/lib/clients';
import { saveAttendanceAction } from '@/lib/actions/payroll';
import { SubmitButton } from '@/components/client';
import { Empty, Flash, Notice } from '@/components/ui';
import { employedDaysIn } from '@/lib/payroll/calc';
import { unpaidLeaveDays } from '@/lib/leave-db';
import { currentPeriod, daysInMonth, firstDay, isPeriod, lastDay, periodLabel } from '@/lib/payroll/period';

export const metadata = { title: 'Attendance' };

interface Row {
  id: string;
  emp_code: string;
  full_name: string;
  doj: string;
  exit_date: string | null;
  lop_days: number | null;
  remarks: string | null;
}

export default async function AttendancePage({ params, searchParams }: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { clientId } = await params;
  const sp = await searchParams;
  const user = await requireClientAccess(clientId);
  const client = await getClient(user, clientId);
  const period = sp.period && isPeriod(sp.period) ? sp.period : currentPeriod();
  const data = await as(user, async (sql) => {
    const rows = await sql<Row>(
      `select e.id, e.emp_code, e.full_name, e.doj, e.exit_date, a.lop_days, a.remarks
         from employees e
         left join attendance_monthly a on a.employee_id = e.id and a.period = $2
        where e.client_id = $1 and e.status <> 'pre_onboarding' and e.doj <= $3 and (e.exit_date is null or e.exit_date >= $2)
        order by e.emp_code`,
      [client.id, firstDay(period), lastDay(period)],
    );
    const run = await sql.one<{ status: string }>('select status from payroll_runs where client_id = $1 and period = $2', [client.id, firstDay(period)]);
    const unpaid = await unpaidLeaveDays(sql, client.id, period);
    return { rows, locked: run?.status === 'locked', unpaid };
  });
  const dim = daysInMonth(period);
  return (
    <div className="space-y-4">
      <Flash params={sp} />
      <form className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="period" className="mb-1 block text-sm font-medium text-stone-700">Month</label>
          <input id="period" name="period" type="month" defaultValue={period} className="input w-44" />
        </div>
        <button type="submit" className="btn-secondary">Show</button>
        <p className="text-sm text-stone-600">
          {periodLabel(period)} has {dim} days. Pay is counted on: {DAY_BASIS_LABEL[client.day_basis].toLowerCase()}.
        </p>
      </form>
      {data.locked && <Notice>Payroll for {periodLabel(period)} is locked, so attendance for this month can no longer be changed.</Notice>}
      {data.rows.length === 0 ? (
        <Empty>No employees were on the rolls in {periodLabel(period)}.</Empty>
      ) : (
        <form action={saveAttendanceAction} className="space-y-3">
          <input type="hidden" name="client_id" value={client.id} />
          <input type="hidden" name="period" value={period} />
          <div className="card overflow-x-auto">
            <table className="min-w-full divide-y divide-stone-200">
              <thead>
                <tr>
                  <th className="th">Code</th>
                  <th className="th">Name</th>
                  <th className="th num">Days on rolls</th>
                  <th className="th">Loss-of-pay days</th>
                  <th className="th">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {data.rows.map((r) => {
                  const employed = employedDaysIn(period, r.doj, r.exit_date);
                  return (
                    <tr key={r.id}>
                      <td className="td font-mono text-xs">{r.emp_code}</td>
                      <td className="td">{r.full_name}</td>
                      <td className="td num">{employed}{employed < dim && <span className="ml-1 text-xs text-stone-500">of {dim}</span>}</td>
                      <td className="td">
                        <input
                          aria-label={`Loss-of-pay days for ${r.full_name}`}
                          name={`lop_${r.id}`}
                          type="number"
                          min={0}
                          max={dim}
                          step="0.5"
                          defaultValue={r.lop_days ?? data.unpaid.get(r.id) ?? 0}
                          disabled={data.locked}
                          className="input w-24 text-right tabular-nums"
                        />
                      </td>
                      <td className="td">
                        <input aria-label={`Remarks for ${r.full_name}`} name={`rem_${r.id}`} defaultValue={r.remarks ?? (data.unpaid.get(r.id) ? 'Approved unpaid leave' : '')} maxLength={120} disabled={data.locked} className="input min-w-[10rem]" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!data.locked && (
            <div className="flex flex-wrap items-center gap-3">
              <SubmitButton>Save attendance</SubmitButton>
              <p className="text-xs text-stone-500">Enter only the unpaid days. Everyone else is paid for the full month. Half days are allowed (0.5). Approved unpaid leave is filled in for you until you save.</p>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
