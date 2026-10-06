// Helpers shared by server actions.

import { redirect } from 'next/navigation';
import { friendlyError } from '../db';

export function str(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === 'string' ? v.trim() : '';
}

export function bool(form: FormData, key: string): boolean {
  return form.get(key) === 'on' || form.get(key) === 'true';
}

/** A money or number field; empty means 0. Throws a readable error on anything else. */
export function num(form: FormData, key: string, label: string): number {
  const raw = str(form, key).replace(/,/g, '');
  if (raw === '') return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new FormError(`${label} must be a number, zero or more.`);
  return n;
}

export function optionalNum(form: FormData, key: string, label: string): number | null {
  return str(form, key) === '' ? null : num(form, key, label);
}

export class FormError extends Error {}

export function withQuery(path: string, key: 'msg' | 'err', text: string): string {
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}${key}=${encodeURIComponent(text)}`;
}

/**
 * Runs the body of a form action. On success goes to `then` with a message;
 * on failure goes back to `back` with the reason. Never returns.
 */
export async function run(back: string, body: () => Promise<{ to: string; msg?: string }>): Promise<never> {
  let result: { to: string; msg?: string };
  try {
    result = await body();
  } catch (err) {
    if (isRedirect(err)) throw err;
    const message = err instanceof FormError ? err.message : friendlyError(err);
    redirect(withQuery(back, 'err', message));
  }
  redirect(result.msg ? withQuery(result.to, 'msg', result.msg) : result.to);
}

function isRedirect(err: unknown): boolean {
  const digest = (err as { digest?: unknown })?.digest;
  return typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT');
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v: string): boolean {
  return UUID.test(v);
}
