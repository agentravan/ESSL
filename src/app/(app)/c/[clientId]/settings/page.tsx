import { requireFirm } from '@/lib/auth';
import { getClient } from '@/lib/clients';
import { updateClientAction } from '@/lib/actions/clients';
import { ClientForm } from '@/components/client-form';
import { Flash } from '@/components/ui';

export const metadata = { title: 'Client settings' };

export default async function ClientSettingsPage({ params, searchParams }: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { clientId } = await params;
  const user = await requireFirm();
  const client = await getClient(user, clientId);
  return (
    <div className="max-w-3xl">
      <Flash params={await searchParams} />
      <ClientForm client={client} action={updateClientAction} />
    </div>
  );
}
