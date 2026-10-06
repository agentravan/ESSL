import { as, requireFirm } from '@/lib/auth';
import { TemplateForm } from '@/components/template-form';
import { Flash, PageHeader } from '@/components/ui';

export const metadata = { title: 'New template' };

export default async function NewTemplatePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireFirm();
  const clients = await as(user, (sql) => sql<{ id: string; name: string }>('select id, name from clients where active order by name'));
  return (
    <>
      <PageHeader title="New template" back={{ href: '/templates', label: 'Letter templates' }} />
      <Flash params={await searchParams} />
      <TemplateForm clients={clients} />
    </>
  );
}
