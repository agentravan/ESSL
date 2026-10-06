import Link from 'next/link';
import { as, isFirm, requireClientAccess } from '@/lib/auth';
import { getClient, DAY_BASIS_LABEL, PF_RULE_LABEL } from '@/lib/clients';
import { Badge, Card, DefList, Flash, Notice, Stat } from '@/components/ui';
import { inr } from '@/lib/format';
import { currentPeriod, periodLabel } from '@/lib/payroll/period';

export const metadata = { title: 'Client overview' };

export default async function ClientOverview({ params, searchParams }: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { clientId } = await params;
  const user = await requireClientAccess(clientId);
  const client = await getClient(user, clientId);
  const firm = isFirm(user);
  const data = await as(user, async (sql) => {
    const counts = await sql.one<{ active: number; exited: number; no_structure: number; no_pan: number; no_bank: number }>(
      `select count(*) filter (where status <> 'exited') as active,
              count(*) filter (where status = 'exited') as exited,
              count(*) filter (where status <> 'exited' and not exists
                 (select 1 from salary_structures s where s.employee_id = e.id)) as no_structure,
              count(*) filter (where status <> 'exited' and pan_masked = '') as no_pan,
              count(*) filter (where status <> 'exited' and bank_acct_last4 = '') as no_bank
         from employees e where client_id = $1`,
      [client.id],
    );
    const runs = await sql<{ id: string; period: string; status: string; totals: { headcount?: number; netPay?: number } }>(
      'select id, period::text, status, totals from payroll_runs where client_id = $1 order by period desc limit 4',
      [client.id],
    );
    return { counts: counts!, runs };
  });
  const base = `/c/${client.id}`;
  const todo: React.ReactNode[] = [];
  if (firm && !client.pf_wage_rule) {
    todo.push(<>Choose the PF wage rule in <Link className="link" href={`${base}/settings`}>Settings</Link>. Payroll cannot run until this is decided.</>);
  }
  if (data.counts.no_structure > 0) {
    todo.push(<>{data.counts.no_structure} employee(s) have no salary structure and will be left out of payroll.</>);
  }
  if (data.counts.no_pan > 0) todo.push(<>{data.counts.no_pan} employee(s) have no PAN on file.</>);
  if (data.counts.no_bank > 0) todo.push(<>{data.counts.no_bank} employee(s) have no bank account on file.</>);
  return (
    <div className="space-y-5">
      <Flash params={await searchParams} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Employees on rolls" value={data.counts.active} sub={data.counts.exited ? `${data.counts.exited} exited` : undefined} />
        <Stat
          label="Latest payroll"
          value={data.runs[0] ? periodLabel(data.runs[0].period.slice(0, 7)) : 'None'}
          sub={data.runs[0] ? (data.runs[0].status === 'locked' ? 'Locked' : 'Draft') : undefined}
        />
        <Stat label="Net pay, latest" value={data.runs[0]?.totals?.netPay !== undefined ? `Rs ${inr(data.runs[0].totals.netPay)}` : '—'} />
        <Stat label="This month" value={periodLabel(currentPeriod())} />
      </div>
      {todo.length > 0 && (
        <Notice tone="warn">
          <p className="font-medium">To look at</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {todo.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </Notice>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Recent payroll" actions={<Link href={`${base}/payroll`} className="link text-sm">All months</Link>}>
          {data.runs.length === 0 ? (
            <p className="text-sm text-stone-600">{firm ? 'No payroll has been run yet.' : 'No payroll has been finalised yet.'}</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {data.runs.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <Link href={`${base}/payroll/${r.id}`} className="link">{periodLabel(r.period.slice(0, 7))}</Link>
                  <span className="flex items-center gap-3">
                    <span className="tabular-nums text-stone-600">{r.totals?.headcount ?? 0} employees · Rs {inr(r.totals?.netPay ?? 0)}</span>
                    <Badge tone={r.status === 'locked' ? 'green' : 'amber'}>{r.status === 'locked' ? 'Locked' : 'Draft'}</Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Company details">
          <DefList
            items={[
              ['Legal name', client.legal_name || client.name],
              ['Contact', [client.contact_name, client.contact_phone, client.contact_email].filter(Boolean).join(' · ')],
              ['PF code', client.pf_code],
              ['ESI code', client.esi_code],
              ['PF wage rule', client.pf_wage_rule ? PF_RULE_LABEL[client.pf_wage_rule] : ''],
              ['Days counted for pay', DAY_BASIS_LABEL[client.day_basis]],
            ]}
          />
        </Card>
      </div>
    </div>
  );
}
