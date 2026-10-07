import Link from 'next/link';
import { as, requireClientAccess } from '@/lib/auth';
import { getClient } from '@/lib/clients';
import { PriorityBadge, SlaBadge, StatusBadge } from '@/components/grievances';
import { Badge, Card, Empty, Flash, Stat, TableWrap } from '@/components/ui';
import { dmy } from '@/lib/format';
import { categoryLabel, GRIEVANCE_COLUMNS, PRIORITIES, type GrievanceRow } from '@/lib/grievances';

export const metadata = { title: 'Grievances' };

type Row = GrievanceRow & { full_name: string | null; emp_code: string | null };

export default async function GrievancesPage({ params, searchParams }: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { clientId } = await params;
  const query = await searchParams;
  const user = await requireClientAccess(clientId);
  const client = await getClient(user, clientId);
  const show = query.show === 'all' ? 'all' : 'open';
  const rows = await as(user, (sql) => sql<Row>(
    `select ${GRIEVANCE_COLUMNS}, e.full_name, e.emp_code
       from grievances g left join employees e on e.id = g.employee_id
      where g.client_id = $1
      order by (g.status in ('open', 'in_progress')) desc, g.sla_due_at asc limit 500`,
    [client.id],
  ));
  const now = Date.now();
  const active = rows.filter((r) => r.status === 'open' || r.status === 'in_progress');
  const overdue = active.filter((r) => new Date(r.sla_due_at).getTime() < now);
  const done = rows.filter((r) => r.status === 'resolved' || r.status === 'closed');
  const inTime = done.filter((r) => r.closed_at && new Date(r.closed_at).getTime() <= new Date(r.sla_due_at).getTime());
  const list = show === 'all' ? rows : active;
  const base = `/c/${client.id}/grievances`;
  return (
    <div className="space-y-5">
      <Flash params={query} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Open concerns" value={active.length} />
        <Stat label="Past the time limit" value={overdue.length} sub={overdue.length ? 'Look at these first' : undefined} />
        <Stat label="Resolved" value={done.length} />
        <Stat label="Resolved in time" value={done.length ? `${Math.round((inTime.length / done.length) * 100)}%` : '—'} />
      </div>
      <Card
        title={show === 'all' ? 'All concerns' : 'Open concerns'}
        actions={<Link href={show === 'all' ? base : `${base}?show=all`} className="link text-sm">{show === 'all' ? 'Show open only' : 'Show all'}</Link>}
      >
        {list.length === 0 ? (
          <Empty>{show === 'all' ? 'No concerns have been raised.' : 'No open concerns. Employees raise them from “Raise a concern” in their own login.'}</Empty>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <th className="th">Reference</th>
                <th className="th">Subject</th>
                <th className="th">From</th>
                <th className="th">About</th>
                <th className="th">Priority</th>
                <th className="th">Status</th>
                <th className="th">Time limit</th>
                <th className="th">Raised</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {list.map((g) => (
                <tr key={g.id} className="hover:bg-stone-50">
                  <td className="td whitespace-nowrap font-mono text-xs"><Link href={`${base}/${g.id}`} className="link">{g.ref_no}</Link></td>
                  <td className="td max-w-[18rem] truncate">{g.subject}</td>
                  <td className="td whitespace-nowrap">{g.anonymous ? <Badge>No name given</Badge> : g.full_name ? `${g.full_name} (${g.emp_code})` : 'Former employee'}</td>
                  <td className="td whitespace-nowrap">{categoryLabel(g.category)}</td>
                  <td className="td"><PriorityBadge priority={g.priority} /></td>
                  <td className="td whitespace-nowrap"><StatusBadge status={g.status} /></td>
                  <td className="td whitespace-nowrap"><SlaBadge g={g} /></td>
                  <td className="td whitespace-nowrap">{dmy(String(g.created_at).slice(0, 10))}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
      <p className="text-xs text-stone-500">
        Time limits from when a concern is raised: {PRIORITIES.slice().reverse().map((p) => `${p.label} ${p.hours < 48 ? `${p.hours} hours` : `${p.hours / 24} days`}`).join(' · ')}.
        A harassment complaint is always at least High, and under the POSH Act it must go to the company’s Internal Committee.
      </p>
    </div>
  );
}
