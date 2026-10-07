'use server';

import { cookies } from 'next/headers';

/** Light or dark screen. Remembered on this device only. */
export async function toggleThemeAction(): Promise<void> {
  const jar = await cookies();
  const next = jar.get('theme')?.value === 'dark' ? 'light' : 'dark';
  jar.set('theme', next, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax', httpOnly: true, secure: process.env.NODE_ENV === 'production' });
}
