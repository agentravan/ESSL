import Link from 'next/link';
import { isFirm, requireUser, homeFor } from '@/lib/auth';
import { cookies } from 'next/headers';
import { logoutAction } from '@/lib/actions/auth';
import { toggleThemeAction } from '@/lib/actions/prefs';
import { QuickSearch } from '@/components/quick-search';

export const dynamic = 'force-dynamic';

const ROLE_LABEL = { firm_admin: 'Administrator', firm_staff: 'Office staff', client_hr: 'Client HR', employee: 'Employee' } as const;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser({ allowPasswordChange: true });
  const links: { href: string; label: string }[] = [];
  if (isFirm(user)) {
    links.push({ href: '/clients', label: 'Clients' }, { href: '/templates', label: 'Letter templates' }, { href: '/rules', label: 'Statutory rules' });
    if (user.role === 'firm_admin') links.push({ href: '/users', label: 'Logins' }, { href: '/audit', label: 'Activity log' });
  } else if (user.role === 'client_hr') {
    links.push({ href: `/c/${user.clientId}`, label: 'Overview' });
  } else {
    links.push({ href: '/me', label: 'My page' });
  }
  const demo = process.env.DEMO_BANNER === '1';
  const dark = (await cookies()).get('theme')?.value === 'dark';
  return (
    <div className="min-h-screen">
      {demo && (
        <div className="bg-amber-400 px-4 py-1.5 text-center text-xs font-semibold text-amber-950">
          Sample data for testing. Do not use these figures for real payroll or filings.
        </div>
      )}
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5">
          <Link href={homeFor(user)} className="flex items-center gap-2 font-semibold text-stone-900">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-600 text-sm font-bold text-white">T</span>
            Teamwork HRMS
          </Link>
          <nav className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto" aria-label="Main">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm text-stone-700 hover:bg-stone-100 hover:text-stone-900">
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 text-sm sm:gap-3">
            {user.role !== 'employee' && <QuickSearch />}
            <form action={toggleThemeAction}>
              <button type="submit" className="btn-secondary px-2.5 py-1.5" aria-label={dark ? 'Switch to light screen' : 'Switch to dark screen'} title={dark ? 'Light screen' : 'Dark screen'}>
                {dark ? 'Light' : 'Dark'}
              </button>
            </form>
            <Link href="/account" className="text-right leading-tight hover:underline">
              <span className="block max-w-[11rem] truncate font-medium text-stone-900">{user.fullName}</span>
              <span className="block text-xs text-stone-500">{ROLE_LABEL[user.role]}</span>
            </Link>
            <form action={logoutAction}>
              <button type="submit" className="btn-secondary">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
