// Applies db/migrations/*.sql in name order, once each.
// Usage: MIGRATE_DATABASE_URL=postgres://hrms_owner:...@host/db node scripts/migrate.mjs
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const url = process.env.MIGRATE_DATABASE_URL;
if (!url) {
  console.error('MIGRATE_DATABASE_URL is not set');
  process.exit(1);
}
const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations');
const ssl = process.env.DATABASE_SSL === 'off' ? false : { rejectUnauthorized: false };
const client = new pg.Client({ connectionString: url, ssl });

await client.connect();
try {
  await client.query('create table if not exists hrms.schema_migrations (name text primary key, applied_at timestamptz not null default now())');
  const done = new Set((await client.query('select name from hrms.schema_migrations')).rows.map((r) => r.name));
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = readFileSync(join(dir, file), 'utf8');
    process.stdout.write(`applying ${file} ... `);
    await client.query('begin');
    try {
      await client.query(sql);
      await client.query('insert into hrms.schema_migrations (name) values ($1)', [file]);
      await client.query('commit');
      console.log('ok');
    } catch (err) {
      await client.query('rollback');
      console.log('FAILED');
      throw err;
    }
  }
  console.log('database is up to date');
} finally {
  await client.end();
}
