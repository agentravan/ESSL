import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Teamwork HRMS', template: '%s · Teamwork HRMS' },
  description: 'Client, employee, attendance, payroll and letters for an HR office.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#17665a' };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const dark = (await cookies()).get('theme')?.value === 'dark';
  return (
    <html lang="en-IN" className={dark ? 'dark' : undefined}>
      <body>{children}</body>
    </html>
  );
}
