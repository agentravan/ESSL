import { Tabs } from '@/components/client';

export default async function AttendanceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const base = `/c/${clientId}/attendance`;
  return (
    <>
      <div className="mb-4">
        <Tabs
          tabs={[
            { href: base, label: 'Unpaid days for payroll', exact: true },
            { href: `${base}/daily`, label: 'Daily register' },
            { href: `${base}/upload`, label: 'Upload punches' },
          ]}
        />
      </div>
      {children}
    </>
  );
}
