import { notFound } from 'next/navigation';
import { as, requireFirm } from '@/lib/auth';
import { getClient, PF_RULE_LABEL } from '@/lib/clients';
import { addAdjustmentAction, deleteAdjustmentAction } from '@/lib/actions/payroll';
import { isUuid } from '@/lib/actions/util';
import { SubmitButton } from '@/components/client';
import { Badge, Card, CheckField, Flash, Notice, PageHeader, SelectField, TextField } from '@/components/ui';
import { inr } from '@/lib/format';
import { deductionRows, earningRows, type LineEmp } from '@/lib/payroll/payslip-data';
import { periodLabel } from '@/lib/payroll/period';
import type { StoredCalc } from '@/lib/payroll/run';

export const metadata = { title: 'Payroll working' };

function Row({ label, value, strong }: { label: React.ReactNode; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-1.5 text-sm ${strong ? 'font-semibold text-stone-900' : 'text-stone-700'}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

export default async function LinePage({ params, searchParams }: {
  params: Promise<{ clientId: string; runId: string; lineId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { clientId, runId, lineId } = await params;
  const user = await requireFirm();
  const client = await getClient(user, clientId);
  if (!isUuid(runId) || !isUuid(lineId)) notFound();
  const data = await as(user, async (sql) => {
    const line = await sql.one<{ id: string; employee_id: string; emp: LineEmp; calc: StoredCalc; period: string; status: string; settings: { pfWageRule?: 'basic_da' | 'fifty_percent' } }>(
      `select l.id, l.employee_id, l.emp, l.calc, r.period::text, r.status, r.settings
         from payroll_lines l join payroll_runs r on r.id = l.run_id
        where l.id = $1 and l.run_id = $2 and l.client_id = $3`,
      [lineId, runId, client.id],
    );
    if (!line) return null;
    const adjustments = await sql<{ id: string; kind: string; label: string; amount: number; taxable: boolean }>(
      'select id, kind, label, amount, taxable from payroll_adjustments where employee_id = $1 and period = $2 order by created_at',
      [line.employee_id, line.period],
    );
    return { line, adjustments };
  });
  if (!data) notFound();
  const { line, adjustments } = data;
  const r = line.calc.result;
  const w = r.tdsWorking;
  const period = line.period.slice(0, 7);
  const locked = line.status === 'locked';
  const here = `/c/${client.id}/payroll/${runId}/${line.id}`;
  const rule = line.settings?.pfWageRule ?? 'basic_da';
  return (
    <div className="space-y-5">
      <PageHeader
        title={`${line.emp.name}: ${periodLabel(period)}`}
        subtitle={<span className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs">{line.emp.code}</span>{line.emp.designation}<Badge tone={locked ? 'green' : 'amber'}>{locked ? 'Locked' : 'Draft'}</Badge></span>}
        back={{ href: `/c/${client.id}/payroll/${runId}`, label: `Payroll for ${periodLabel(period)}` }}
        actions={<a href={`/api/payslip/${line.id}`} target="_blank" rel="noopener" className="btn-secondary">Payslip PDF</a>}
      />
      <Flash params={await searchParams} />
      {r.warnings.length > 0 && (
        <Notice tone="warn">
          <p className="font-medium">To check</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">{r.warnings.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </Notice>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Days and earnings">
          <Row label="Days counted for a full month" value={r.baseDays} />
          <Row label="Days on the rolls this month" value={r.employedDays} />
          <Row label="Loss-of-pay days" value={r.lopDays} />
          <Row label="Paid days" value={r.paidDays} strong />
          <div className="my-2 border-t border-stone-200" />
          <div className="flex justify-between text-xs font-semibold uppercase tracking-wide text-stone-500">
            <span>Earning</span><span>Full month → earned</span>
          </div>
          {earningRows(line.calc).map((e, i) => (
            <Row key={i} label={e.label} value={e.full === null ? inr(e.earned) : `${inr(e.full)} → ${inr(e.earned)}`} />
          ))}
          <Row label="Total earnings" value={inr(r.totalEarnings)} strong />
        </Card>

        <Card title="Deductions and net pay">
          {deductionRows(line.calc).length === 0 && <p className="py-1.5 text-sm text-stone-500">No deductions this month.</p>}
          {deductionRows(line.calc).map((d, i) => <Row key={i} label={d.label} value={inr(d.amount)} />)}
          <Row label="Total deductions" value={inr(r.totalDeductions)} strong />
          <div className="my-2 border-t border-stone-200" />
          <Row label="Net pay" value={`Rs ${inr(r.netPay)}`} strong />
          <Row label="Cost to employer for this employee" value={inr(r.employerCost)} />
        </Card>

        <Card title="Provident fund working">
          {r.pf.applicable ? (
            <>
              <Row label="Basic + DA earned" value={inr(r.pf.wageBasicDa)} />
              <Row label="50% of gross earned, if higher" value={inr(r.pf.wageFiftyPercent)} />
              <Row label={`PF wage under this client's rule (${PF_RULE_LABEL[rule]})`} value={inr(r.pf.wageUsed)} />
              <Row label="Wage ceiling this month" value={inr(r.pf.ceiling)} />
              <Row label="Wage PF is charged on" value={inr(r.pf.pfWage)} strong />
              <Row label="Employee share (12%)" value={inr(r.pf.employee)} strong />
              <Row label="Employer: pension (EPS 8.33%)" value={inr(r.pf.eps)} />
              <Row label="Employer: provident fund (balance)" value={inr(r.pf.employerEpf)} />
              <Row label="Employer: EDLI (0.5%)" value={inr(r.pf.edli)} />
              <Row label="Employer: admin charge (0.5%)" value={inr(r.pf.admin)} />
              <div className="mt-2 rounded-md bg-stone-50 px-3 py-2 text-xs text-stone-600">
                Employee PF would be Rs {inr(r.pf.employeeIfBasicDa)} on Basic + DA and Rs {inr(r.pf.employeeIfFiftyPercent)} under the 50% wage rule.
              </div>
            </>
          ) : (
            <p className="text-sm text-stone-600">PF is switched off for this employee.</p>
          )}
        </Card>

        <Card title="ESI, professional tax and income tax working">
          <Row label="ESI wage" value={r.esi.applicable ? inr(r.esi.wage) : 'Not applicable'} />
          {r.esi.applicable && <Row label="ESI: employee 0.75%, employer 3.25%" value={`${inr(r.esi.employee)} / ${inr(r.esi.employer)}`} />}
          <Row label={`Professional tax (${line.emp.workState})`} value={inr(r.pt)} />
          <div className="my-2 border-t border-stone-200" />
          {w.method === 'none' ? (
            <p className="text-sm text-stone-600">No taxable pay this month.</p>
          ) : (
            <>
              <Row label={`Salary for the year, projected (${w.monthsRemainingAfter} more month(s))`} value={inr(w.annualGross)} />
              <Row label="Standard deduction" value={`– ${inr(w.standardDeduction)}`} />
              {w.otherDeductions > 0 && <Row label="Declared deductions and professional tax" value={`– ${inr(w.otherDeductions)}`} />}
              <Row label="Taxable income" value={inr(w.taxableIncome)} strong />
              <Row label="Tax on slabs" value={inr(w.taxOnSlabs)} />
              {w.rebate > 0 && <Row label="Rebate" value={`– ${inr(w.rebate)}`} />}
              {w.marginalRelief > 0 && <Row label="Marginal relief" value={`– ${inr(w.marginalRelief)}`} />}
              {w.surcharge > 0 && <Row label="Surcharge" value={inr(w.surcharge)} />}
              <Row label="Health and education cess" value={inr(w.cess)} />
              <Row label="Tax for the year" value={inr(w.annualTax)} strong />
              <Row label="Already deducted this year" value={inr(w.alreadyDeducted)} />
              <Row label={w.method === 'override' ? 'TDS this month (fixed amount set on the employee)' : `TDS this month (balance ÷ ${w.monthsRemainingAfter + 1})`} value={inr(r.tds)} strong />
            </>
          )}
        </Card>
      </div>

      <Card title="One-off earnings and deductions for this month">
        {adjustments.length === 0 ? (
          <p className="text-sm text-stone-600">None. Use this for arrears, incentives, advance recoveries and similar items.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {adjustments.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                <span>
                  {a.label}{' '}
                  <Badge tone={a.kind === 'earning' ? 'green' : 'red'}>{a.kind === 'earning' ? 'Earning' : 'Deduction'}</Badge>{' '}
                  {a.kind === 'earning' && !a.taxable && <Badge>Not taxable</Badge>}
                </span>
                <span className="flex items-center gap-3">
                  <span className="tabular-nums">Rs {inr(a.amount)}</span>
                  {!locked && (
                    <form action={deleteAdjustmentAction}>
                      <input type="hidden" name="client_id" value={client.id} />
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="back" value={here} />
                      <SubmitButton className="btn-danger" pendingText="Removing…">Remove</SubmitButton>
                    </form>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {!locked && (
          <form action={addAdjustmentAction} className="mt-4 grid items-end gap-3 border-t border-stone-200 pt-4 sm:grid-cols-5">
            <input type="hidden" name="client_id" value={client.id} />
            <input type="hidden" name="employee_id" value={line.employee_id} />
            <input type="hidden" name="period" value={period} />
            <input type="hidden" name="back" value={here} />
            <SelectField label="Type" name="kind" options={[{ value: 'earning', label: 'Earning' }, { value: 'deduction', label: 'Deduction' }]} />
            <TextField label="Name" name="label" required maxLength={60} placeholder="e.g. Incentive" className="sm:col-span-2" />
            <TextField label="Amount (Rs)" name="amount" type="number" min={1} step="0.01" required />
            <SubmitButton pendingText="Adding…">Add</SubmitButton>
            <div className="sm:col-span-5"><CheckField label="Taxable (earnings only)" name="taxable" defaultChecked /></div>
          </form>
        )}
      </Card>
    </div>
  );
}
