import { redirect } from 'next/navigation';
import { as, homeFor, requireUser } from '@/lib/auth';
import { EMPLOYEE_COLUMNS, STATUS_LABEL, type Employee } from '@/lib/employees';
import { Badge, Card, DefList, Empty, Flash, PageHeader } from '@/components/ui';
import { dmy, inr } from '@/lib/format';
import { periodLabel } from '@/lib/payroll/period';

export const metadata = { title: 'My page' };

export default async function MePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  if (user.role !== 'employee' || !user.employeeId) redirect(homeFor(user));
  const data = await as(user, async (sql) => {
    const employee = await sql.one<Employee>(`select ${EMPLOYEE_COLUMNS} from employees where id = $1`, [user.employeeId]);
    const client = await sql.one<{ name: string }>('select name from clients where id = $1', [user.clientId]);
    const lines = await sql<{ id: string; period: string; gross_earned: number; total_deductions: number; net_pay: number }>(
      `select l.id, r.period::text, l.gross_earned, l.total_deductions, l.net_pay
         from payroll_lines l join payroll_runs r on r.id = l.run_id
        where l.employee_id = $1 order by r.period desc limit 36`,
      [user.employeeId],
    );
    const documents = await sql<{ id: string; title: string; letter_date: string }>(
      'select id, title, letter_date from documents where employee_id = $1 order by letter_date desc',
      [user.employeeId],
    );
    return { employee, client, lines, documents };
  });
  const e = data.employee;
  if (!e) return <Empty>Your employee record could not be found. Please contact your HR office.</Empty>;
  return (
    <div className="space-y-5">
      <PageHeader title={e.full_name} subtitle={`${data.client?.name ?? ''} · ${e.designation || 'Employee'} · ${e.emp_code}`} />
      <Flash params={await searchParams} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="My payslips">
          {data.lines.length === 0 ? (
            <p className="text-sm text-stone-600">No payslips yet. They appear here once your payroll for a month is final.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {data.lines.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <span className="font-medium">{periodLabel(l.period.slice(0, 7))}</span>
                  <span className="flex items-center gap-4">
                    <span className="tabular-nums text-stone-600">Net pay Rs {inr(l.net_pay)}</span>
                    <a href={`/api/payslip/${l.id}`} target="_blank" rel="noopener" className="btn-secondary">Open payslip</a>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="My letters">
          {data.documents.length === 0 ? (
            <p className="text-sm text-stone-600">No letters have been shared with you yet.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {data.documents.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <span>{d.title} <span className="text-stone-500">· {dmy(d.letter_date)}</span></span>
                  <a href={`/api/document/${d.id}`} target="_blank" rel="noopener" className="btn-secondary">Open</a>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <Card title="My details">
        <DefList
          items={[
            ['Status', <Badge key="s" tone="green">{STATUS_LABEL[e.status]}</Badge>],
            ['Date of joining', dmy(e.doj)],
            ['Department', e.department],
            ['Work location', e.location],
            ['Email', e.email],
            ['Phone', e.phone],
            ['PAN', e.pan_masked],
            ['Aadhaar', e.aadhaar_last4 ? `XXXX XXXX ${e.aadhaar_last4}` : ''],
            ['UAN', e.uan],
            ['Bank account', e.bank_acct_last4 ? `${e.bank_name} XXXX${e.bank_acct_last4}`.trim() : ''],
            ['Tax regime', e.tax_regime === 'new' ? 'New' : 'Old'],
          ]}
        />
        <p className="mt-4 text-xs text-stone-500">If anything here is wrong, tell your HR office. You cannot change it yourself.</p>
      </Card>
    </div>
  );
}
