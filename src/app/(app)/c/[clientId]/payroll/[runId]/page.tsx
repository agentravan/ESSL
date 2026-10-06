import Link from 'next/link';
import { notFound } from 'next/navigation';
import { as, isFirm, requireClientAccess } from '@/lib/auth';
import { getClient, DAY_BASIS_LABEL, PF_RULE_LABEL } from '@/lib/clients';
import { deleteRunAction, lockRunAction, recalculateAction, unlockRunAction } from '@/lib/actions/payroll';
import { isUuid } from '@/lib/actions/util';
import { ConfirmSubmit, SubmitButton } from '@/components/client';
import { Badge, Empty, Flash, Notice, PageHeader, Stat, TableWrap } from '@/components/ui';
import { dateTime, inr } from '@/lib/format';
import type { LineEmp } from '@/lib/payroll/payslip-data';
import { periodLabel } from '@/lib/payroll/period';
import type { RunTotals, StoredCalc } from '@/lib/payroll/run';

export const metadata = { title: 'Payroll month' };

interface Line {
  id: string;
  emp: LineEmp;
  calc: StoredCalc;
  paid_days: number;
  gross_earned: number;
  pf_employee: number;
  esi_employee: number;
  pt: number;
  tds: number;
  other_deductions: number;
  net_pay: number;
}

export default async function RunPage({ params, searchParams }: {
  params: Promise<{ clientId: string; runId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { clientId, runId } = await params;
  const user = await requireClientAccess(clientId);
  const client = await getClient(user, clientId);
  if (!isUuid(runId)) notFound();
  const firm = isFirm(user);
  const data = await as(user, async (sql) => {
    const run = await sql.one<{
      id: string; period: string; status: string; totals: Partial<RunTotals>; settings: { pfWageRule?: 'basic_da' | 'fifty_percent'; dayBasis?: 'calendar' | 'fixed26' | 'fixed30' };
      computed_at: Date | null; locked_at: Date | null;
    }>('select id, period::text, status, totals, settings, computed_at, locked_at from payroll_runs where id = $1 and client_id = $2', [runId, client.id]);
    if (!run) return null;
    const lines = await sql<Line>(
      `select id, emp, calc, paid_days, gross_earned, pf_employee, esi_employee, pt, tds, other_deductions, net_pay
         from payroll_lines where run_id = $1 order by emp->>'code'`,
      [runId],
    );
    const stale = run.status === 'draft' && run.computed_at
      ? await sql.one<{ n: number }>(
          `with r as (select computed_at from payroll_runs where id = $3)
           select (select count(*) from attendance_monthly a, r where a.client_id = $1 and a.period = $2 and a.updated_at > r.computed_at)
                + (select count(*) from salary_structures s, r where s.client_id = $1 and s.created_at > r.computed_at)
                + (select count(*) from employees e, r where e.client_id = $1 and e.updated_at > r.computed_at) as n`,
          [client.id, run.period, run.id],
        )
      : null;
    return { run, lines, stale: (stale?.n ?? 0) > 0 };
  });
  if (!data) notFound();
  const { run, lines } = data;
  const t = run.totals ?? {};
  const period = run.period.slice(0, 7);
  const locked = run.status === 'locked';
  const base = `/c/${client.id}/payroll`;
  const hidden = (
    <>
      <input type="hidden" name="client_id" value={client.id} />
      <input type="hidden" name="run_id" value={run.id} />
    </>
  );
  return (
    <div className="space-y-5">
      <PageHeader
        title={`Payroll for ${periodLabel(period)}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={locked ? 'green' : 'amber'}>{locked ? 'Locked' : 'Draft'}</Badge>
            {locked ? `Locked ${dateTime(run.locked_at)}` : `Calculated ${dateTime(run.computed_at)}`}
            {run.settings?.pfWageRule && <span>· PF on {PF_RULE_LABEL[run.settings.pfWageRule]}</span>}
            {run.settings?.dayBasis && <span>· {DAY_BASIS_LABEL[run.settings.dayBasis]}</span>}
          </span>
        }
        back={{ href: base, label: 'Payroll' }}
        actions={<a href={`/api/register/${run.id}`} className="btn-secondary">Download register (Excel CSV)</a>}
      />
      <Flash params={await searchParams} />

      {firm && !locked && data.stale && (
        <Notice tone="warn">Attendance, salary or employee details changed after this was calculated. Recalculate to bring it up to date.</Notice>
      )}
      {firm && (t.unverifiedRules?.length ?? 0) > 0 && (
        <Notice tone="warn">
          <p className="font-medium">Statutory rules used here have not been checked yet</p>
          <p className="mt-0.5">{t.unverifiedRules!.join('; ')}. Check them on the <Link href="/rules" className="link">Statutory rules</Link> page and tick them as verified.</p>
        </Notice>
      )}
      {firm && (t.notes ?? []).map((n, i) => <Notice key={i} tone="warn">{n}</Notice>)}
      {(t.skipped?.length ?? 0) > 0 && (
        <Notice tone="warn">
          <p className="font-medium">Left out of this payroll</p>
          <ul className="mt-1 list-disc pl-5">
            {t.skipped!.map((s) => <li key={s.code}>{s.code} {s.name}: {s.reason}</li>)}
          </ul>
        </Notice>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Employees" value={t.headcount ?? 0} />
        <Stat label="Total earnings" value={`Rs ${inr(t.totalEarnings ?? 0)}`} />
        <Stat label="Net pay" value={`Rs ${inr(t.netPay ?? 0)}`} />
        <Stat label="Cost to employer" value={`Rs ${inr(t.employerCost ?? 0)}`} sub="Earnings + employer PF, EDLI, admin charge and ESI" />
      </div>

      <div className="card overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th className="th">Statutory totals</th>
              <th className="th num">Employee share</th>
              <th className="th num">Employer share</th>
              <th className="th num">To pay</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            <tr>
              <td className="td">Provident fund (EPF + EPS)</td>
              <td className="td num">{inr(t.pfEmployee ?? 0)}</td>
              <td className="td num">{inr(t.employerPf ?? 0)} <span className="text-xs text-stone-500">(EPS {inr(t.eps ?? 0)})</span></td>
              <td className="td num">{inr((t.pfEmployee ?? 0) + (t.employerPf ?? 0))}</td>
            </tr>
            <tr>
              <td className="td">EDLI and PF admin charge</td>
              <td className="td num">–</td>
              <td className="td num">{inr((t.edli ?? 0) + (t.pfAdmin ?? 0))} <span className="text-xs text-stone-500">(EDLI {inr(t.edli ?? 0)}, admin {inr(t.pfAdmin ?? 0)})</span></td>
              <td className="td num">{inr((t.edli ?? 0) + (t.pfAdmin ?? 0))}</td>
            </tr>
            <tr>
              <td className="td">ESI</td>
              <td className="td num">{inr(t.esiEmployee ?? 0)}</td>
              <td className="td num">{inr(t.esiEmployer ?? 0)}</td>
              <td className="td num">{inr((t.esiEmployee ?? 0) + (t.esiEmployer ?? 0))}</td>
            </tr>
            <tr>
              <td className="td">Professional tax</td>
              <td className="td num">{inr(t.pt ?? 0)}</td>
              <td className="td num">–</td>
              <td className="td num">{inr(t.pt ?? 0)}</td>
            </tr>
            <tr>
              <td className="td">Income tax (TDS)</td>
              <td className="td num">{inr(t.tds ?? 0)}</td>
              <td className="td num">–</td>
              <td className="td num">{inr(t.tds ?? 0)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {lines.length === 0 ? (
        <Empty>Nobody is on this payroll. Check that employees have a salary structure and a joining date on or before this month.</Empty>
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <th className="th">Employee</th>
              <th className="th num">Paid days</th>
              <th className="th num">Earnings</th>
              <th className="th num">PF</th>
              <th className="th num">ESI</th>
              <th className="th num">PT</th>
              <th className="th num">TDS</th>
              <th className="th num">Other</th>
              <th className="th num">Net pay</th>
              <th className="th"><span className="sr-only">Links</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {lines.map((l) => {
              const warnings = l.calc.result.warnings.length;
              return (
                <tr key={l.id} className="hover:bg-stone-50">
                  <td className="td">
                    <span className="font-mono text-xs text-stone-500">{l.emp.code}</span>{' '}
                    {firm ? <Link href={`${base}/${run.id}/${l.id}`} className="link">{l.emp.name}</Link> : l.emp.name}
                    {firm && warnings > 0 && <span className="ml-2"><Badge tone="amber">{warnings} to check</Badge></span>}
                  </td>
                  <td className="td num">{l.paid_days}</td>
                  <td className="td num">{inr(l.calc.result.totalEarnings)}</td>
                  <td className="td num">{inr(l.pf_employee)}</td>
                  <td className="td num">{inr(l.esi_employee)}</td>
                  <td className="td num">{inr(l.pt)}</td>
                  <td className="td num">{inr(l.tds)}</td>
                  <td className="td num">{inr(l.other_deductions)}</td>
                  <td className="td num font-semibold">{inr(l.net_pay)}</td>
                  <td className="td whitespace-nowrap">
                    <a href={`/api/payslip/${l.id}`} className="link" target="_blank" rel="noopener">Payslip</a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      )}
      <p className="text-xs text-stone-500">
        Rounding: earnings, PF and TDS to the nearest rupee; ESI to the next higher rupee. PF admin charge is at least the monthly minimum per establishment.
      </p>

      {firm && (
        <div className="flex flex-wrap items-start gap-3 border-t border-stone-200 pt-4">
          {!locked && (
            <>
              <form action={recalculateAction}>{hidden}<SubmitButton className="btn-secondary" pendingText="Calculating…">Recalculate</SubmitButton></form>
              <form action={lockRunAction}>
                {hidden}
                <ConfirmSubmit
                  label="Lock this month"
                  question="Locking makes payslips final and visible to the client and employees. Lock now?"
                  confirmLabel="Yes, lock"
                  className="btn-primary"
                />
              </form>
              <form action={deleteRunAction}>
                {hidden}
                <ConfirmSubmit label="Delete draft" question="Delete this draft calculation? Attendance and salary data are kept." confirmLabel="Yes, delete" />
              </form>
            </>
          )}
          {locked && user.role === 'firm_admin' && (
            <form action={unlockRunAction}>
              {hidden}
              <ConfirmSubmit label="Unlock to correct" question="Unlocking hides these payslips from the client and employees until you lock again. Unlock?" confirmLabel="Yes, unlock" />
            </form>
          )}
          {locked && user.role !== 'firm_admin' && <p className="text-sm text-stone-500">Only an administrator can unlock a locked month.</p>}
        </div>
      )}
    </div>
  );
}
