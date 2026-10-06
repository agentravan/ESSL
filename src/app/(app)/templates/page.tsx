import Link from 'next/link';
import { as, requireFirm } from '@/lib/auth';
import { Badge, Empty, Flash, PageHeader, TableWrap } from '@/components/ui';
import { dateTime } from '@/lib/format';
import { lintTemplate } from '@/lib/letters/template';

export const metadata = { title: 'Letter templates' };

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireFirm();
  const rows = await as(user, (sql) =>
    sql<{ id: string; name: string; kind: string; active: boolean; body: string; updated_at: Date; client_name: string | null }>(
      `select t.id, t.name, t.kind, t.active, t.body, t.updated_at, c.name as client_name
         from letter_templates t left join clients c on c.id = t.client_id
        order by t.active desc, (t.client_id is not null), t.name`,
    ),
  );
  return (
    <>
      <PageHeader
        title="Letter templates"
        subtitle="The wording used for offer letters, appointment letters, agreements and other documents."
        actions={<Link href="/templates/new" className="btn-primary">New template</Link>}
      />
      <Flash params={await searchParams} />
      {rows.length === 0 ? (
        <Empty>No templates yet.</Empty>
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <th className="th">Template</th>
              <th className="th">Available to</th>
              <th className="th">Last changed</th>
              <th className="th">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((t) => {
              const issues = lintTemplate(t.body).length;
              return (
                <tr key={t.id} className="hover:bg-stone-50">
                  <td className="td"><Link href={`/templates/${t.id}`} className="link">{t.name}</Link></td>
                  <td className="td">{t.client_name ?? 'Every client'}</td>
                  <td className="td whitespace-nowrap text-stone-500">{dateTime(t.updated_at)}</td>
                  <td className="td space-x-1">
                    {!t.active && <Badge>Not in use</Badge>}
                    {issues > 0 && <Badge tone="amber">{issues} to check</Badge>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      )}
    </>
  );
}
