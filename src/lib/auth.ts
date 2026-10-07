// Sign-in, sessions and role checks. Server only.

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { hashPassword, newToken, sha256, verifyPassword } from './crypto';
import { tx, type Sql } from './db';

export type Role = 'firm_admin' | 'firm_staff' | 'client_hr' | 'employee';

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  clientId: string | null;
  employeeId: string | null;
  mustChangePassword: boolean;
}

const COOKIE = 'hrms_session';
const SESSION_HOURS = 12;

interface SessionRow {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  client_id: string | null;
  employee_id: string | null;
  must_change_password: boolean;
}

/** The signed-in user for this request, or null. Looked up once per request. */
export const getUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const row = await tx(null, (sql) => sql.one<SessionRow>('select * from auth_session_user($1)', [sha256(token)]));
  if (!row || !row.id) return null;
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    clientId: row.client_id,
    employeeId: row.employee_id,
    mustChangePassword: row.must_change_password,
  };
});

export function isFirm(user: SessionUser): boolean {
  return user.role === 'firm_admin' || user.role === 'firm_staff';
}

export function homeFor(user: SessionUser): string {
  if (isFirm(user)) return '/clients';
  if (user.role === 'client_hr') return `/c/${user.clientId}`;
  return '/me';
}

/** Any signed-in user. Sends people with a temporary password to change it first. */
export async function requireUser(opts: { allowPasswordChange?: boolean } = {}): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect('/login');
  if (user.mustChangePassword && !opts.allowPasswordChange) redirect('/account?first=1');
  return user;
}

export async function requireFirm(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isFirm(user)) redirect(homeFor(user));
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== 'firm_admin') redirect(homeFor(user));
  return user;
}

/** Firm users, or the client's own HR login. Employees are sent to their own page. */
export async function requireClientAccess(clientId: string): Promise<SessionUser> {
  const user = await requireUser();
  if (isFirm(user)) return user;
  if (user.role === 'client_hr' && user.clientId === clientId) return user;
  redirect(homeFor(user));
}

export type EmployeeUser = SessionUser & { clientId: string; employeeId: string };

/** An employee login. Everyone else is sent to their own start page. */
export async function requireEmployee(): Promise<EmployeeUser> {
  const user = await requireUser();
  if (user.role !== 'employee' || !user.employeeId || !user.clientId) redirect(homeFor(user));
  return user as EmployeeUser;
}

/** Runs fn in a transaction as this user. */
export function as<T>(user: SessionUser, fn: (sql: Sql) => Promise<T>): Promise<T> {
  return tx(user.id, fn);
}

const DUMMY_HASH =
  'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';

export async function signIn(email: string, password: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const generic = 'Email or password is not correct.';
  const found = await tx(null, (sql) =>
    sql.one<{ id: string; password_hash: string; active: boolean; locked_until: Date | null }>(
      'select * from auth_user_by_email($1)',
      [email],
    ),
  );
  if (!found || !found.id) {
    await verifyPassword(password, DUMMY_HASH); // same work whether or not the email exists
    return { ok: false, message: generic };
  }
  if (found.locked_until && new Date(found.locked_until) > new Date()) {
    return { ok: false, message: 'Too many wrong attempts. Try again in 15 minutes.' };
  }
  const ok = await verifyPassword(password, found.password_hash);
  if (!ok || !found.active) {
    if (!ok) await tx(null, (sql) => sql('select auth_login_result($1, false)', [found.id]));
    return { ok: false, message: generic };
  }
  const token = newToken();
  await tx(null, async (sql) => {
    await sql('select auth_login_result($1, true)', [found.id]);
    await sql('select auth_create_session($1, $2, $3)', [found.id, sha256(token), SESSION_HOURS]);
  });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_HOURS * 3600,
  });
  return { ok: true };
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    await tx(null, (sql) => sql('select auth_delete_session($1)', [sha256(token)]));
    jar.delete(COOKIE);
  }
}

export async function setPassword(actor: SessionUser, userId: string, password: string, mustChange: boolean): Promise<void> {
  const hash = await hashPassword(password);
  await as(actor, (sql) => sql('select auth_set_password($1, $2, $3)', [userId, hash, mustChange]));
}

export async function checkOwnPassword(user: SessionUser, password: string): Promise<boolean> {
  const row = await as(user, (sql) => sql.one<{ h: string | null }>('select auth_my_hash() as h'));
  return row?.h ? verifyPassword(password, row.h) : false;
}

export const SESSION_COOKIE = COOKIE;
