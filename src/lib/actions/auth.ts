'use server';

import { redirect } from 'next/navigation';
import { checkOwnPassword, getUser, homeFor, requireUser, setPassword, signIn, signOut } from '../auth';
import { databaseConfigured } from '../db';
import { passwordProblem } from '../validate';
import { FormError, run, str, withQuery } from './util';

export async function loginAction(form: FormData): Promise<void> {
  if (!databaseConfigured()) redirect(withQuery('/login', 'err', 'The database is not connected yet.'));
  const email = str(form, 'email');
  const password = typeof form.get('password') === 'string' ? (form.get('password') as string) : '';
  if (!email || !password) redirect(withQuery('/login', 'err', 'Enter your email and password.'));
  let result: Awaited<ReturnType<typeof signIn>>;
  try {
    result = await signIn(email, password);
  } catch (err) {
    console.error('sign-in failed', err);
    redirect(withQuery('/login', 'err', 'Could not reach the database. Try again in a minute.'));
  }
  if (!result.ok) redirect(withQuery('/login', 'err', result.message));
  const user = await getUser();
  redirect(user ? homeFor(user) : '/');
}

export async function logoutAction(): Promise<void> {
  await signOut();
  redirect('/login');
}

export async function changePasswordAction(form: FormData): Promise<void> {
  const user = await requireUser({ allowPasswordChange: true });
  await run('/account', async () => {
    const current = (form.get('current') as string) ?? '';
    const next = (form.get('next') as string) ?? '';
    const again = (form.get('again') as string) ?? '';
    if (!(await checkOwnPassword(user, current))) throw new FormError('Your current password is not correct.');
    const problem = passwordProblem(next);
    if (problem) throw new FormError(problem);
    if (next !== again) throw new FormError('The two new passwords do not match.');
    if (next === current) throw new FormError('Choose a new password that is different from the current one.');
    await setPassword(user, user.id, next, false);
    return { to: homeFor(user), msg: 'Password changed.' };
  });
}
