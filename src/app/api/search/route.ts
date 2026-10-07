// Quick search for the box in the header. Returns only what the signed-in person may see
// (the database's row rules apply as on every other screen).

import { as, getUser, isFirm } from '@/lib/auth';

export const dynamic = 'force-dynamic';

interface Hit {
  kind: 'Client' | 'Employee' | 'Page';
  label: string;
  sub: string;
  href: string;
}

const CLIENT_PAGES = [
  ['Overview', ''], ['Employees', '/employees'], ['Add employee', '/employees/new'], ['Attendance', '/attendance'], ['Leave', '/leave'],
  ['Payroll', '/payroll'], ['Letters', '/letters'], ['Documents', '/documents'], ['Grievances', '/grievances'],
] as const;

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return Response.json({ hits: [] }, { status: 401 });
  if (user.role === 'employee') return Response.json({ hits: [] });
  let q = '';
  try {
    const body = (await req.json()) as { q?: unknown };
    q = typeof body.q === 'string' ? body.q.trim().slice(0, 60) : '';
  } catch {
    q = '';
  }
  const hits: Hit[] = [];
  const needle = q.toLowerCase();
  const pages: Hit[] = [];
  if (isFirm(user)) {
    pages.push(
      { kind: 'Page', label: 'Clients', sub: 'Dashboard and client list', href: '/clients' },
      { kind: 'Page', label: 'Add client', sub: '', href: '/clients/new' },
      { kind: 'Page', label: 'Letter templates', sub: '', href: '/templates' },
      { kind: 'Page', label: 'Statutory rules', sub: 'PF, ESI, professional tax, income tax', href: '/rules' },
    );
    if (user.role === 'firm_admin') {
      pages.push({ kind: 'Page', label: 'Logins', sub: 'Create and switch off logins', href: '/users' }, { kind: 'Page', label: 'Activity log', sub: '', href: '/audit' });
    }
  } else if (user.clientId) {
    for (const [label, path] of CLIENT_PAGES) pages.push({ kind: 'Page', label, sub: '', href: `/c/${user.clientId}${path}` });
  }
  pages.push({ kind: 'Page', label: 'My account', sub: 'Change password', href: '/account' });
  if (needle.length < 2) return Response.json({ hits: pages.slice(0, 8) });

  const like = `%${needle.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  await as(user, async (sql) => {
    if (isFirm(user)) {
      const clients = await sql<{ id: string; name: string; code: string }>(
        'select id, name, code from clients where lower(name) like $1 or lower(code) like $1 order by active desc, name limit 6', [like],
      );
      for (const c of clients) hits.push({ kind: 'Client', label: c.name, sub: c.code, href: `/c/${c.id}` });
    }
    const employees = await sql<{ id: string; client_id: string; full_name: string; emp_code: string; client_name: string; designation: string }>(
      `select e.id, e.client_id, e.full_name, e.emp_code, c.name as client_name, e.designation
         from employees e join clients c on c.id = e.client_id
        where lower(e.full_name) like $1 or lower(e.emp_code) like $1
        order by (e.status = 'exited'), e.full_name limit 8`,
      [like],
    );
    for (const e of employees) {
      hits.push({ kind: 'Employee', label: e.full_name, sub: [e.emp_code, e.designation, isFirm(user) ? e.client_name : ''].filter(Boolean).join(' · '), href: `/c/${e.client_id}/employees/${e.id}` });
    }
  });
  for (const p of pages) if (p.label.toLowerCase().includes(needle)) hits.push(p);
  return Response.json({ hits: hits.slice(0, 16) }, { headers: { 'cache-control': 'private, no-store' } });
}
