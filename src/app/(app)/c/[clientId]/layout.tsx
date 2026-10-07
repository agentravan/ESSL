import Link from 'next/link';
import { isFirm, requireClientAccess } from '@/lib/auth';
import { getClient } from '@/lib/clients';
import { Tabs } from '@/components/client';
import { Badge } from '@/components/ui';
import { stateName } from '@/lib/states';

export default async function ClientLayout({ children, params }: { children: React.ReactNode; params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const user = await requireClientAccess(clientId);
  const client = await getClient(user, clientId);
  const base = `/c/${client.id}`;
  const tabs = [
    { href: base, label: 'Overview', exact: true },
    { href: `${base}/employees`, label: 'Employees' },
    { href: `${base}/attendance`, label: 'Attendance' },
    { href: `${base}/leave`, label: 'Leave' },
    { href: `${base}/payroll`, label: 'Payroll' },
    { href: `${base}/letters`, label: 'Letters' },
    { href: `${base}/documents`, label: 'Documents' },
    { href: `${base}/grievances`, label: 'Grievances' },
  ];
  if (isFirm(user)) tabs.push({ href: `${base}/settings`, label: 'Settings' });
  return (
    <>
      <div className="mb-5 border-b border-stone-200">
        {isFirm(user) && (
          <Link href="/clients" className="text-sm text-stone-500 hover:text-stone-800">← All clients</Link>
        )}
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 pb-2">
          <h1 className="text-xl font-semibold tracking-tight text-stone-900 sm:text-2xl">{client.name}</h1>
          <span className="text-sm text-stone-500">{client.code} · {stateName(client.state)}</span>
          {!client.active && <Badge>Inactive</Badge>}
        </div>
        <Tabs tabs={tabs} />
      </div>
      {children}
    </>
  );
}
