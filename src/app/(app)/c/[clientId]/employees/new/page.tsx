import { requireFirm } from '@/lib/auth';
import { getClient } from '@/lib/clients';
import { createEmployeeAction } from '@/lib/actions/employees';
import { EmployeeForm } from '@/components/employee-form';
import { Flash, PageHeader } from '@/components/ui';

export const metadata = { title: 'Add employee' };

export default async function NewEmployeePage({ params, searchParams }: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { clientId } = await params;
  const user = await requireFirm();
  const client = await getClient(user, clientId);
  return (
    <div className="max-w-4xl">
      <PageHeader title="Add employee" back={{ href: `/c/${client.id}/employees`, label: 'Employees' }} />
      <Flash params={await searchParams} />
      <EmployeeForm clientId={client.id} clientState={client.state} action={createEmployeeAction} />
    </div>
  );
}
