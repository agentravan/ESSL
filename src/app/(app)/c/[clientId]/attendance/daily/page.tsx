import { as, requireClientAccess } from '@/lib/auth';
import { getClient } from '@/lib/clients';
import { applySuggestedLopAction } from '@/lib/actions/attendance';
import { ConfirmSubmit } from '@/components/client';
import { Mark, MarkLegend } from '@/components/attendance';
import { Empty, Flash, Notice } from '@/components/ui';
import { hhmm } from '@/lib/attendance';
import { loadMonthAttendance } from '@/lib/attendance-db';
import { currentPeriod, firstDay, isPeriod, periodLabel } from '@/lib/payroll/period';

export const metadata = { title: 'Daily register' };

export default async function DailyRegisterPage({ params, searchParams }: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { clientId } = await params;
  const sp = await searchParams;
  const user = await requireClientAccess(clientId);
  const client = await getClient(user, clientId);
  const period = sp.period && isPeriod(sp.period) ? sp.period : currentPeriod();
  const data = await as(user, async (sql) => {
    const month = await loadMonthAttendance(sql, client.id, period);
    const run = await sql.one<{ status: string }>('select status from payroll_runs where client_id = $1 and period = $2', [client.id, firstDay(period)]);
    return { month, locked: run?.status === 'locked' };
  });
  const { month } = data;
  const days = month.employees[0]?.summary.marks.map((m) => m.date.slice(8)) ?? [];
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
          Shift {hhmm(month.shift.start)} to {hhmm(month.shift.end)}, {month.shift.grace} minutes grace. Change these under Settings.
        </p>
      </form>
      {!month.anyPunches && (
        <Notice>
          No punches have been recorded for {periodLabel(period)}. Employees can punch from their own login, or you can upload the file from the attendance machine under “Upload punches”.
        </Notice>
      )}
      {month.employees.length === 0 ? (
        <Empty>No employees were on the rolls in {periodLabel(period)}.</Empty>
      ) : (
        <>
          <div className="card overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr>
                  <th className="th sticky left-0 bg-white">Employee</th>
                  {days.map((d) => <th key={d} className="px-0.5 py-2 text-center text-[10px] font-semibold text-stone-500">{d}</th>)}
                  <th className="th num">P</th>
                  <th className="th num">A</th>
                  <th className="th num">L</th>
                  <th className="th num">Late</th>
                  <th className="th num">OT hrs</th>
                  <th className="th num">Unpaid</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {month.employees.map((e) => (
                  <tr key={e.id}>
                    <td className="td sticky left-0 whitespace-nowrap bg-white">
                      <span className="font-mono text-xs text-stone-500">{e.emp_code}</span> {e.full_name}
                    </td>
                    {e.summary.marks.map((m) => (
                      <td key={m.date} className="px-0.5 py-1.5 text-center" title={m.summary ? `${m.date}: in ${m.summary.firstIn === null ? '—' : hhmm(m.summary.firstIn)}, out ${m.summary.lastOut === null ? '—' : hhmm(m.summary.lastOut)}` : m.date}>
                        <Mark mark={m.mark} />
                      </td>
                    ))}
                    <td className="td num">{e.summary.present + e.summary.halfDays * 0.5}</td>
                    <td className="td num">{e.summary.absent}</td>
                    <td className="td num">{e.summary.leave}</td>
                    <td className="td num">{e.summary.lateCount}</td>
                    <td className="td num">{(e.summary.overtimeMinutes / 60).toFixed(1)}</td>
                    <td className="td num font-semibold">{e.summary.suggestedUnpaidDays}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <MarkLegend />
          <p className="text-xs text-stone-500">
            “Unpaid” is absences, half of each half day, and approved unpaid leave, up to today. Overtime hours are shown for information; overtime pay is not added to payroll automatically. Add it as a one-off earning on the payroll screen.
          </p>
          {!data.locked && month.anyPunches && (
            <form action={applySuggestedLopAction}>
              <input type="hidden" name="client_id" value={client.id} />
              <input type="hidden" name="period" value={period} />
              <ConfirmSubmit
                label="Use these unpaid days for payroll"
                question={`Replace the unpaid days saved for ${periodLabel(period)} with the “Unpaid” column above?`}
                confirmLabel="Yes, use them"
                className="btn-primary"
              />
            </form>
          )}
        </>
      )}
    </div>
  );
}
