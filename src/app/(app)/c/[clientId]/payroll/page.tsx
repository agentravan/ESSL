import Link from 'next/link';
import { as, isFirm, requireClientAccess } from '@/lib/auth';
import { getClient, PF_RULE_LABEL } from '@/lib/clients';
import { runPayrollAction } from '@/lib/actions/payroll';
import { SubmitButton } from '@/components/client';
import { Badge, Card, Empty, Flash, Notice, TableWrap } from '@/components/ui';
import { dateTime, inr } from '@/lib/format';
import { addMonths, currentPeriod, periodLabel } from '@/lib/payroll/period';
import type { RunTotals } from '@/lib/payroll/run';

export const metadata = { title: 'Payroll' };

export default async function PayrollPage({ params, searchParams }: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { clientId } = await params;
  const user = await requireClientAccess(clientId);
  const client = await getClient(user, clientId);
  const firm = isFirm(user);
  const runs = await as(user, (sql) =>
    sql<{ id: string; period: string; status: string; totals: Partial<RunTotals>; computed_at: Date | null; locked_at: Date | null }>(
      'select id, period::text, status, totals, computed_at, locked_at from payroll_runs where client_id = $1 order by period desc',
      [client.id],
    ),
  );
  const suggested = runs[0] ? addMonths(runs[0].period.slice(0, 7), runs[0].status === 'locked' ? 1 : 0) : currentPeriod();
  const base = `/c/${client.id}/payroll`;
  return (
    <div className="space-y-5">
      <Flash params={await searchParams} />
      {firm && (
        <Card title="Run payroll">
          {client.pf_wage_rule ? (
            <form action={runPayrollAction} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="client_id" value={client.id} />
              <div>
                <label htmlFor="period" className="mb-1 block text-sm font-medium text-stone-700">Month</label>
                <input id="period" name="period" type="month" required defaultValue={suggested} className="input w-44" />
              </div>
              <SubmitButton pendingText="Calculating…">Calculate</SubmitButton>
              <p className="basis-full text-xs text-stone-500">
                Uses the attendance saved for that month, each employee's salary structure in force, and the statutory rules for
                that month. PF wage rule for this client: {PF_RULE_LABEL[client.pf_wage_rule]}. You can recalculate as often as you
                like until the month is locked.
              </p>
            </form>
          ) : (
            <Notice tone="warn">
              Payroll cannot run yet: choose this client's PF wage rule in{' '}
              <Link href={`/c/${client.id}/settings`} className="link">Settings</Link>.
            </Notice>
          )}
        </Card>
      )}
      {runs.length === 0 ? (
        <Empty>{firm ? 'No payroll has been run for this client yet.' : 'No payroll has been finalised yet.'}</Empty>
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <th className="th">Month</th>
              <th className="th">Status</th>
              <th className="th num">Employees</th>
              <th className="th num">Gross</th>
              <th className="th num">Deductions</th>
              <th className="th num">Net pay</th>
              <th className="th">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {runs.map((r) => {
              const t = r.totals ?? {};
              const deductions = (t.pfEmployee ?? 0) + (t.esiEmployee ?? 0) + (t.pt ?? 0) + (t.tds ?? 0) + (t.otherDeductions ?? 0);
              return (
                <tr key={r.id} className="hover:bg-stone-50">
                  <td className="td"><Link href={`${base}/${r.id}`} className="link">{periodLabel(r.period.slice(0, 7))}</Link></td>
                  <td className="td"><Badge tone={r.status === 'locked' ? 'green' : 'amber'}>{r.status === 'locked' ? 'Locked' : 'Draft'}</Badge></td>
                  <td className="td num">{t.headcount ?? 0}</td>
                  <td className="td num">{inr(t.totalEarnings ?? 0)}</td>
                  <td className="td num">{inr(deductions)}</td>
                  <td className="td num font-medium">{inr(t.netPay ?? 0)}</td>
                  <td className="td whitespace-nowrap text-stone-500">{dateTime(r.locked_at ?? r.computed_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      )}
    </div>
  );
}
