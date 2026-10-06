import { redirect } from 'next/navigation';
import { getUser, homeFor } from '@/lib/auth';
import { databaseConfigured } from '@/lib/db';
import { loginAction } from '@/lib/actions/auth';
import { Flash, Notice, TextField } from '@/components/ui';
import { SubmitButton } from '@/components/client';

export const metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const ready = databaseConfigured();
  if (ready) {
    let user = null;
    try {
      user = await getUser();
    } catch {
      user = null;
    }
    if (user) redirect(homeFor(user));
  }
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-brand-600 text-lg font-bold text-white">T</div>
          <h1 className="text-xl font-semibold text-stone-900">Teamwork HRMS</h1>
          <p className="mt-1 text-sm text-stone-600">Sign in to continue</p>
        </div>
        <Flash params={params} />
        {!ready && (
          <div className="mb-4">
            <Notice tone="warn">
              The database is not connected yet, so nobody can sign in. The app is installed and waiting for its database.
            </Notice>
          </div>
        )}
        <form action={loginAction} className="card space-y-4 p-5">
          <TextField label="Email" name="email" type="email" autoComplete="username" required autoFocus />
          <TextField label="Password" name="password" type="password" autoComplete="current-password" required />
          <SubmitButton className="btn-primary w-full" pendingText="Signing in…">
            Sign in
          </SubmitButton>
        </form>
        <p className="mt-4 text-center text-xs text-stone-500">Forgot your password? Ask your administrator to reset it.</p>
      </div>
    </main>
  );
}
