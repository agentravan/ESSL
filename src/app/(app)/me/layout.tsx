import { Tabs } from '@/components/client';

export default function MeLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="mb-5 border-b border-stone-200">
        <Tabs
          tabs={[
            { href: '/me', label: 'My page', exact: true },
            { href: '/me/attendance', label: 'Attendance' },
            { href: '/me/leave', label: 'Leave' },
            { href: '/me/documents', label: 'My documents' },
            { href: '/me/grievances', label: 'Raise a concern' },
          ]}
        />
      </div>
      {children}
    </>
  );
}
