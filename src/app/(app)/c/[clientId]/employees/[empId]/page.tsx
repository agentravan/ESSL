import Link from 'next/link';
import { notFound } from 'next/navigation';
import { as, isFirm, requireClientAccess } from '@/lib/auth';
import { getClient } from '@/lib/clients';
import { EMPLOYEE_COLUMNS, GENDER_LABEL, STATUS_LABEL, STATUS_TONE, type Employee, type SalaryStructure } from '@/lib/employees';
import { saveStructureAction } from '@/lib/actions/employees';
import { isUuid } from '@/lib/actions/util';
import { StructureFields } from '@/components/employee-form';
import { CreateEmployeeLogin, ResetPassword, RevealIds } from '@/components/employee-client';
import { SubmitButton } from '@/components/client';
import { Badge, Card, DefList, Flash, PageHeader, TextField } from '@/components/ui';
import { dateTime, dmy, inr } from '@/lib/format';
import { COMPONENT_KEYS, COMPONENT_LABELS } from '@/lib/payroll/types';
import { periodLabel, todayIso } from '@/lib/payroll/period';
import { stateName } from '@/lib/states';

export const metadata = { title: 'Employee' };

export default async function EmployeePage({ params, searchParams }: {
  params: Promise<{ clientId: string; empId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { clientId, empId } = await params;
  const user = await requireClientAccess(clientId);
  const client = await getClient(user, clientId);
  if (!isUuid(empId)) notFound();
  const firm = isFirm(user);
  const data = await as(user, async (sql) => {
    const employee = await sql.one<Employee>(`select ${EMPLOYEE_COLUMNS} from employees where id = $1 and client_id = $2`, [empId, client.id]);
    if (!employee) return null;
    const structures = await sql<SalaryStructure>(
      'select * from salary_structures where employee_id = $1 order by effective_from desc',
      [empId],
    );
    const lines = await sql<{ id: string; run_id: string; period: string; status: string; gross_earned: number; net_pay: number }>(
      `select l.id, l.run_id, r.period::text, r.status, l.gross_earned, l.net_pay
         from payroll_lines l join payroll_runs r on r.id = l.run_id
        where l.employee_id = $1 order by r.period desc limit 24`,
      [empId],
    );
    const documents = await sql<{ id: string; title: string; letter_date: string; visible_to_employee: boolean }>(
      'select id, title, letter_date, visible_to_employee from documents where employee_id = $1 order by created_at desc',
      [empId],
    );
    const login = firm
      ? await sql.one<{ id: string; email: string; active: boolean; last_login_at: Date | null }>(
          'select id, email, active, last_login_at from users where employee_id = $1',
          [empId],
        )
      : null;
    return { employee, structures, lines, documents, login };
  });
  if (!data) notFound();
  const { employee: e, structures, lines, documents, login } = data;
  const base = `/c/${client.id}`;
  const current = structures[0] ?? null;
  const gross = current ? COMPONENT_KEYS.reduce((s, k) => s + current[k], 0) : 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title={e.full_name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs">{e.emp_code}</span>
            <Badge tone={STATUS_TONE[e.status]}>{STATUS_LABEL[e.status]}</Badge>
            {[e.designation, e.department].filter(Boolean).join(' · ')}
          </span>
        }
        back={{ href: `${base}/employees`, label: 'Employees' }}
        actions={firm ? <Link href={`${base}/employees/${e.id}/edit`} className="btn-secondary">Edit details</Link> : undefined}
      />
      <Flash params={await searchParams} />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Details">
          <DefList
            items={[
              ['Date of joining', dmy(e.doj)],
              ['Last working day', dmy(e.exit_date)],
              ["Father's name", e.father_name],
              ['Gender', GENDER_LABEL[e.gender]],
              ['Date of birth', dmy(e.dob)],
              ['Work location', [e.location, stateName(e.work_state)].filter(Boolean).join(', ')],
              ['Email', e.email],
              ['Phone', e.phone],
              ['Address', e.address],
            ]}
          />
        </Card>
        <Card title="Statutory and tax">
          <DefList
            items={[
              ['Provident fund', e.pf_applicable ? `Yes${e.pf_restrict ? ', limited to the ceiling' : ', on full wages'}${e.eps_applicable ? '' : ', no pension'}` : 'No'],
              ['UAN', e.uan],
              ['PF member number', e.pf_number],
              ['ESI', e.esi_applicable ? `Yes${e.esi_number ? ` (${e.esi_number})` : ''}` : 'No'],
              ['Professional tax', e.pt_applicable ? 'Yes' : 'No'],
              ['Tax regime', e.tax_regime === 'new' ? 'New' : `Old, deductions Rs ${inr(e.old_regime_deductions)}`],
              ['Fixed monthly TDS', e.tds_override_monthly === null ? 'Worked out by the system' : `Rs ${inr(e.tds_override_monthly)}`],
              ['Opening balances', e.opening_fy ? `${e.opening_fy}: salary Rs ${inr(e.opening_taxable_ytd)}, TDS Rs ${inr(e.opening_tds_ytd)}` : 'None'],
            ]}
          />
        </Card>
      </div>

      <Card title="PAN, Aadhaar and bank">
        <DefList
          items={[
            ['PAN', e.pan_masked],
            ['Aadhaar', e.aadhaar_last4 ? `XXXX XXXX ${e.aadhaar_last4}` : ''],
            ['Bank', [e.bank_name, e.bank_ifsc].filter(Boolean).join(' · ')],
            ['Account', e.bank_acct_last4 ? `XXXX${e.bank_acct_last4}` : ''],
          ]}
        />
        {firm && (e.pan_masked || e.aadhaar_last4 || e.bank_acct_last4) && (
          <div className="mt-4"><RevealIds employeeId={e.id} /></div>
        )}
      </Card>

      <Card title="Salary">
        {current ? (
          <>
            <p className="mb-3 text-sm text-stone-600">
              Monthly gross <strong className="text-stone-900">Rs {inr(gross)}</strong>, from {dmy(current.effective_from)}
              {current.notes ? ` (${current.notes})` : ''}
            </p>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr>
                    <th className="th">From</th>
                    {COMPONENT_KEYS.map((k) => <th key={k} className="th num">{COMPONENT_LABELS[k].replace(' Allowance', '')}</th>)}
                    <th className="th num">Gross</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {structures.map((s) => (
                    <tr key={s.id}>
                      <td className="td whitespace-nowrap">{dmy(s.effective_from)}</td>
                      {COMPONENT_KEYS.map((k) => <td key={k} className="td num">{s[k] ? inr(s[k]) : '–'}</td>)}
                      <td className="td num font-medium">{inr(COMPONENT_KEYS.reduce((t, k) => t + s[k], 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="text-sm text-stone-600">No salary structure yet. This employee is left out of payroll until one is added.</p>
        )}
        {firm && (
          <details className="mt-4 rounded-md border border-stone-200 p-3">
            <summary className="cursor-pointer text-sm font-medium text-brand-700">{current ? 'Revise salary' : 'Add salary structure'}</summary>
            <form action={saveStructureAction} className="mt-4 space-y-4">
              <input type="hidden" name="client_id" value={client.id} />
              <input type="hidden" name="employee_id" value={e.id} />
              <div className="grid gap-4 sm:grid-cols-3">
                <TextField label="Starts from" name="effective_from" type="date" required defaultValue={current ? todayIso().slice(0, 8) + '01' : e.doj} hint="Use the 1st of a month. Payroll uses the structure in force for each month." />
                <TextField label="Note" name="notes" maxLength={120} placeholder="e.g. Annual increment" className="sm:col-span-2" />
              </div>
              <StructureFields structure={current} />
              <SubmitButton>Save salary structure</SubmitButton>
            </form>
          </details>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Payslips">
          {lines.length === 0 ? (
            <p className="text-sm text-stone-600">No payslips yet.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {lines.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span>
                    {periodLabel(l.period.slice(0, 7))}{' '}
                    {l.status !== 'locked' && <Badge tone="amber">Draft</Badge>}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="tabular-nums text-stone-600">Net Rs {inr(l.net_pay)}</span>
                    <a href={`/api/payslip/${l.id}`} className="link" target="_blank" rel="noopener">PDF</a>
                    {firm && <Link href={`${base}/payroll/${l.run_id}/${l.id}`} className="link">Working</Link>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Letters" actions={firm ? <Link href={`${base}/letters/new?employee=${e.id}`} className="link text-sm">New letter</Link> : undefined}>
          {documents.length === 0 ? (
            <p className="text-sm text-stone-600">No letters yet.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {documents.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span>{d.title} <span className="text-stone-500">· {dmy(d.letter_date)}</span></span>
                  <span className="flex items-center gap-2">
                    {d.visible_to_employee && <Badge tone="blue">Shared with employee</Badge>}
                    <a href={`/api/document/${d.id}`} className="link" target="_blank" rel="noopener">PDF</a>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {user.role === 'firm_admin' && (
        <Card title="Employee login">
          {login ? (
            <div className="space-y-3 text-sm">
              <p>
                {login.email} · {login.active ? 'Active' : 'Disabled'} · Last sign-in: {login.last_login_at ? dateTime(login.last_login_at) : 'never'}
              </p>
              <ResetPassword userId={login.id} />
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-stone-600">
                A login lets this employee see their own details, finalised payslips and letters shared with them. Nothing else.
              </p>
              <CreateEmployeeLogin employeeId={e.id} />
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
