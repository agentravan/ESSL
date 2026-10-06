import Link from 'next/link';
import { as, requireFirm } from '@/lib/auth';
import { Badge, Empty, Flash, PageHeader, TableWrap } from '@/components/ui';
import { stateName } from '@/lib/states';
import { periodLabel } from '@/lib/payroll/period';

export const metadata = { title: 'Clients' };

interface Row {
  id: string;
  code: string;
  name: string;
  state: string;
  active: boolean;
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
      `select c.id, c.code, c.name, c.state, c.active, c.pf_wage_rule,
              (select count(*) from employees e where e.client_id = c.id and e.status <> 'exited') as headcount,
              r.period::text as last_period, r.status as last_status
         from clients c
         left join lateral (select period, status from payroll_runs pr where pr.client_id = c.id order by period desc limit 1) r on true
        where c.active or $1
        order by c.name`,
      [showAll],
    ),
  );
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
                  {!c.active && <Badge>Inactive</Badge>}
                  {!c.pf_wage_rule && <Badge tone="amber">PF wage rule not chosen</Badge>}
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </>
  );
}
