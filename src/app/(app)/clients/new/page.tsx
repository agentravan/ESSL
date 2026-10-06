import { requireFirm } from '@/lib/auth';
import { createClientAction } from '@/lib/actions/clients';
import { ClientForm } from '@/components/client-form';
import { Flash, PageHeader } from '@/components/ui';

export const metadata = { title: 'Add client' };

export default async function NewClientPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  await requireFirm();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Add client" back={{ href: '/clients', label: 'Clients' }} />
      <Flash params={params} />
      <ClientForm action={createClientAction} />
    </div>
  );
}
