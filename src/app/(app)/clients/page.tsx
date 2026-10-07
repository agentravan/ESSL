import Link from 'next/link';
import { as, requireFirm } from '@/lib/auth';
import { Badge, Card, Empty, Flash, PageHeader, Stat, TableWrap } from '@/components/ui';
import { BarChart, BarList } from '@/components/charts';
import { ConfirmSubmit } from '@/components/client';
import { CreateDemoForm } from '@/components/demo-client';
import { deleteDemoClientAction } from '@/lib/actions/demo';
import { stateName } from '@/lib/states';
import { periodLabel } from '@/lib/payroll/period';

export const metadata = { title: 'Clients' };
export const maxDuration = 60;

interface Row {
  id: string;
  code: string;
  name: string;
  state: string;
  active: boolean;
  is_demo: boolean;
  pf_wage_rule: string | null;
  headcount: number;
  last_period: string | null;
  last_status: string | null;
}

export default async function ClientsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const user = await requireFirm();
  const showAll = params.all === '1';
  const rows = await as(user, (sql) =>
    sql<Row>(
      `select c.id, c.code, c.name, c.state, c.active, c.is_demo, c.pf_wage_rule,
              (select count(*) from employees e where e.client_id = c.id and e.status <> 'exited') as headcount,
              r.period::text as last_period, r.status as last_status
         from clients c
         left join lateral (select period, status from payroll_runs pr where pr.client_id = c.id order by period desc limit 1) r on true
        where c.active or $1
        order by c.name`,
      [showAll],
    ),
  );
  const board = await as(user, async (sql) => {
    const counts = await sql.one<{ pending_leave: number; open_grievances: number; overdue: number; docs_waiting: number; drafts: number }>(
      `select (select count(*) from leave_requests where status = 'pending') as pending_leave,
              (select count(*) from grievances where status in ('open', 'in_progress')) as open_grievances,
              (select count(*) from grievances where status in ('open', 'in_progress') and sla_due_at < now()) as overdue,
              (select count(*) from employee_documents where status = 'uploaded') as docs_waiting,
              (select count(*) from payroll_runs where status = 'draft') as drafts`,
    );
    const months = await sql<{ period: string; net: number; cost: number }>(
      `select period::text, sum(coalesce((totals->>'netPay')::numeric, 0)) as net, sum(coalesce((totals->>'employerCost')::numeric, 0)) as cost
         from payroll_runs where period >= (date_trunc('month', now()) - interval '5 months')::date group by period order by period`,
    );
    return { counts: counts!, months };
  });
  const admin = user.role === 'firm_admin';
  const headcount = rows.reduce((s, r) => s + Number(r.headcount), 0);
  return (
    <>
      <PageHeader
        title="Clients"
        subtitle={`${rows.length} ${rows.length === 1 ? 'client' : 'clients'}${showAll ? ', including inactive' : ''}`}
        actions={
          <>
            <Link href={showAll ? '/clients' : '/clients?all=1'} className="btn-secondary">
              {showAll ? 'Hide inactive' : 'Show inactive'}
            </Link>
            <Link href="/clients/new" className="btn-primary">Add client</Link>
          </>
        }
      />
      <Flash params={params} />
      <div className="mb-5 space-y-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat label="Employees, all clients" value={headcount} sub={`${rows.length} clients`} />
          <Stat label="Payroll months in draft" value={board.counts.drafts} />
          <Stat label="Leave waiting" value={board.counts.pending_leave} />
          <Stat label="Open concerns" value={board.counts.open_grievances} sub={Number(board.counts.overdue) ? `${board.counts.overdue} past the time limit` : undefined} />
          <Stat label="Documents to verify" value={board.counts.docs_waiting} />
        </div>
        {rows.length > 0 && (
          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="Payroll by month, all clients">
              <BarChart
                money
                labels={{ a: 'Net pay', b: 'Cost to company' }}
                data={board.months.map((m) => ({ label: periodLabel(m.period.slice(0, 7)).slice(0, 3) + ' ' + m.period.slice(2, 4), a: Number(m.net), b: Number(m.cost) }))}
              />
            </Card>
            <Card title="Employees by client">
              <BarList rows={rows.filter((r) => Number(r.headcount) > 0).sort((a, b) => Number(b.headcount) - Number(a.headcount)).slice(0, 8).map((r) => ({ label: r.name, value: Number(r.headcount), href: `/c/${r.id}` }))} />
            </Card>
          </div>
        )}
      </div>
      {rows.length === 0 ? (
        <Empty>
          No clients yet. <Link href="/clients/new" className="link">Add your first client</Link>.
        </Empty>
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <th className="th">Client</th>
              <th className="th">State</th>
              <th className="th num">Employees</th>
              <th className="th">Last payroll</th>
              <th className="th">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((c) => (
              <tr key={c.id} className="hover:bg-stone-50">
                <td className="td">
                  <Link href={`/c/${c.id}`} className="link">{c.name}</Link>
                  <span className="ml-2 text-xs text-stone-500">{c.code}</span>
                </td>
                <td className="td">{stateName(c.state)}</td>
                <td className="td num">{c.headcount}</td>
                <td className="td">
                  {c.last_period ? (
                    <>
                      {periodLabel(c.last_period.slice(0, 7))}{' '}
                      <Badge tone={c.last_status === 'locked' ? 'green' : 'amber'}>{c.last_status === 'locked' ? 'Locked' : 'Draft'}</Badge>
                    </>
                  ) : (
                    <span className="text-stone-400">None</span>
                  )}
                </td>
                <td className="td space-x-1">
                  {c.is_demo && <Badge tone="blue">Demo</Badge>}
                  {!c.active && <Badge>Inactive</Badge>}
                  {!c.pf_wage_rule && <Badge tone="amber">PF wage rule not chosen</Badge>}
                  {c.is_demo && admin && (
                    <form action={deleteDemoClientAction} className="mt-1 inline-block">
                      <input type="hidden" name="client_id" value={c.id} />
                      <ConfirmSubmit label="Delete demo" question={`Delete ${c.name} and everything in it?`} confirmLabel="Yes, delete" pendingText="Deleting…" />
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
      {admin && (
        <div className="mt-6">
          <Card title="Demo client for a prospect">
            <CreateDemoForm />
          </Card>
        </div>
      )}
    </>
  );
}
