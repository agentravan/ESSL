import { notFound } from 'next/navigation';
import { as, requireFirm } from '@/lib/auth';
import { isUuid } from '@/lib/actions/util';
import { TemplateForm } from '@/components/template-form';
import { Flash, PageHeader } from '@/components/ui';

export const metadata = { title: 'Edit template' };

export default async function EditTemplatePage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const user = await requireFirm();
  if (!isUuid(id)) notFound();
  const data = await as(user, async (sql) => {
    const template = await sql.one<{ id: string; name: string; kind: string; client_id: string | null; body: string; active: boolean }>(
      'select id, name, kind, client_id, body, active from letter_templates where id = $1',
      [id],
    );
    const clients = await sql<{ id: string; name: string }>('select id, name from clients where active order by name');
    return { template, clients };
  });
  if (!data.template) notFound();
  return (
    <>
      <PageHeader title={data.template.name} back={{ href: '/templates', label: 'Letter templates' }} />
      <Flash params={await searchParams} />
      <TemplateForm template={data.template} clients={data.clients} />
    </>
  );
}
