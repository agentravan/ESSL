// Database access. Every query runs inside a transaction that first tells
// Postgres which user is acting; row-level security does the rest.

import { Pool, types, type PoolClient } from 'pg';

// Dates stay as 'YYYY-MM-DD' strings (no time-zone shifts); numerics become numbers.
types.setTypeParser(1082, (v: string) => v);
types.setTypeParser(1700, (v: string) => parseFloat(v));
types.setTypeParser(20, (v: string) => Number(v));

declare global {
  // eslint-disable-next-line no-var
  var __hrmsPool: Pool | undefined;
}

function getPool(): Pool {
  if (!globalThis.__hrmsPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new DatabaseNotConfigured();
    const ssl = process.env.DATABASE_SSL === 'off' ? false : { rejectUnauthorized: false };
    globalThis.__hrmsPool = new Pool({
      connectionString,
      ssl,
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    });
    globalThis.__hrmsPool.on('error', (err) => console.error('idle database connection error', err.message));
  }
  return globalThis.__hrmsPool;
}

export class DatabaseNotConfigured extends Error {
  constructor() {
    super('DATABASE_URL is not set');
    this.name = 'DatabaseNotConfigured';
  }
}

export function databaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export interface Sql {
  <T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  one<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T | null>;
}

function makeSql(client: PoolClient): Sql {
  const run = async <T>(text: string, params: unknown[] = []): Promise<T[]> => {
    const res = await client.query(text, params);
    return res.rows as T[];
  };
  const sql = run as Sql;
  sql.one = async <T>(text: string, params: unknown[] = []): Promise<T | null> => {
    const rows = await run<T>(text, params);
    return rows[0] ?? null;
  };
  return sql;
}

/**
 * Runs fn in one transaction as the given user (null = nobody signed in).
 * Commits if fn returns, rolls back if it throws.
 */
export async function tx<T>(userId: string | null, fn: (sql: Sql) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    await client.query("select set_config('search_path', 'hrms', true), set_config('hrms.user_id', $1, true)", [
      userId ?? '',
    ]);
    const result = await fn(makeSql(client));
    await client.query('commit');
    return result;
  } catch (err) {
    try {
      await client.query('rollback');
    } catch {
      // connection is already broken; nothing more to do
    }
    throw err;
  } finally {
    client.release();
  }
}

/** Turns a database error into a sentence that can be shown to the person using the app. */
export function friendlyError(err: unknown): string {
  const e = err as { code?: string; message?: string; constraint?: string; detail?: string };
  switch (e?.code) {
    case '23505':
      if (e.constraint?.includes('emp_code')) return 'That employee code is already used for this client.';
      if (e.constraint?.includes('clients_code')) return 'That client code is already used.';
      if (e.constraint?.includes('users_email')) return 'A login with that email already exists.';
      if (e.constraint?.includes('payroll_runs')) return 'Payroll for that month already exists.';
      if (e.constraint?.includes('salary_structures')) return 'A salary structure already starts on that date.';
      if (e.constraint?.includes('statutory_rules')) return 'A rule of that kind already starts on that date.';
      return 'That record already exists.';
    case '23503':
      return 'This record is linked to other records and cannot be changed or removed that way.';
    case '23514':
      return 'One of the values is outside the allowed range.';
    case '23502':
      return 'A required value is missing.';
    case '22P02':
    case '22007':
    case '22008':
      return 'One of the values is not in the expected format.';
    case '42501':
      return 'You do not have permission to do that.';
    case 'P0001':
      return capitalise(e.message ?? 'That is not allowed.') + '.';
    default:
      if (err instanceof UserError) return err.message;
      if (err instanceof Error && err.name === 'DataKeyMissing') return err.message;
      console.error('unexpected error', err);
      return 'Something went wrong. Nothing was saved.';
  }
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/\.$/, '');
}

/** An error whose message is safe and useful to show as-is. */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserError';
  }
}
