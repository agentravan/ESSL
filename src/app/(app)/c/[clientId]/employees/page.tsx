import Link from 'next/link';
import { as, isFirm, requireClientAccess } from '@/lib/auth';
import { getClient } from '@/lib/clients';
import { STATUS_LABEL, STATUS_TONE, type Employee } from '@/lib/employees';
import { Badge, Empty, Flash, TableWrap } from '@/components/ui';
import { dmy, inr } from '@/lib/format';

export const metadata = { title: 'Employees' };

interface Row {
  id: string;
  emp_code: string;
  full_name: string;
  designation: string;
  department: string;
  doj: string;
  status: Employee['status'];
  pf_applicable: boolean;
  esi_applicable: boolean;
  gross: number | null;
}

export default async function EmployeesPage({ params, searchParams }: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { clientId } = await params;
  const sp = await searchParams;
  const user = await requireClientAccess(clientId);
  const client = await getClient(user, clientId);
  const q = (sp.q ?? '').trim();
  const show = sp.show === 'all' ? 'all' : 'current';
  const rows = await as(user, (sql) =>
    sql<Row>(
      `select e.id, e.emp_code, e.full_name, e.designation, e.department, e.doj, e.status, e.pf_applicable, e.esi_applicable,
              (select s.basic + s.da + s.hra + s.conveyance + s.medical + s.special + s.lta + s.other
                 from salary_structures s where s.employee_id = e.id order by s.effective_from desc limit 1) as gross
         from employees e
        where e.client_id = $1
          and ($2 = '' or e.full_name ilike '%' || $2 || '%' or e.emp_code ilike '%' || $2 || '%')
          and ($3 = 'all' or e.status <> 'exited')
        order by e.emp_code`,
      [client.id, q.replace(/[%_\\]/g, ''), show],
    ),
  );
  const base = `/c/${client.id}/employees`;
  return (
    <>
      <Flash params={sp} />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <form className="flex flex-wrap items-end gap-2" role="search">
          <div>
            <label htmlFor="q" className="mb-1 block text-xs font-medium text-stone-600">Search name or code</label>
            <input id="q" name="q" defaultValue={q} className="input w-56" />
          </div>
          <div>
            <label htmlFor="show" className="mb-1 block text-xs font-medium text-stone-600">Show</label>
            <select id="show" name="show" defaultValue={show} className="input">
              <option value="current">On rolls</option>
              <option value="all">Everyone, including exited</option>
            </select>
          </div>
          <button type="submit" className="btn-secondary">Search</button>
        </form>
        {isFirm(user) && (
          <div className="flex gap-2">
            <Link href={`${base}/import`} className="btn-secondary">Import from Excel</Link>
            <Link href={`${base}/new`} className="btn-primary">Add employee</Link>
          </div>
        )}
      </div>
      {rows.length === 0 ? (
        <Empty>{q ? 'No employee matches that search.' : 'No employees yet.'}</Empty>
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <th className="th">Code</th>
              <th className="th">Name</th>
              <th className="th">Designation</th>
              <th className="th">Joined</th>
              <th className="th num">Monthly gross</th>
              <th className="th">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((e) => (
              <tr key={e.id} className="hover:bg-stone-50">
                <td className="td font-mono text-xs">{e.emp_code}</td>
                <td className="td"><Link href={`${base}/${e.id}`} className="link">{e.full_name}</Link></td>
                <td className="td">{[e.designation, e.department].filter(Boolean).join(' · ')}</td>
                <td className="td whitespace-nowrap">{dmy(e.doj)}</td>
                <td className="td num">{e.gross === null ? <Badge tone="amber">No salary set</Badge> : inr(e.gross)}</td>
                <td className="td space-x-1 whitespace-nowrap">
                  <Badge tone={STATUS_TONE[e.status]}>{STATUS_LABEL[e.status]}</Badge>
                  {e.pf_applicable && <Badge>PF</Badge>}
                  {e.esi_applicable && <Badge>ESI</Badge>}
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
      <p className="mt-3 text-xs text-stone-500">{rows.length} shown</p>
    </>
  );
}
