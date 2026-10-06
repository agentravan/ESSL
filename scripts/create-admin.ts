// Creates an administrator login and prints a temporary password once.
// Usage: MIGRATE_DATABASE_URL=... npx tsx scripts/create-admin.ts email "Full Name"
import pg from 'pg';
import { generatePassword, hashPassword } from '../src/lib/crypto';

async function main() {
  const [email, name] = process.argv.slice(2);
  const url = process.env.MIGRATE_DATABASE_URL;
  if (!url || !email || !name) {
    console.error('Usage: MIGRATE_DATABASE_URL=... npx tsx scripts/create-admin.ts email "Full Name"');
    process.exit(1);
  }
  const password = generatePassword();
  const hash = await hashPassword(password);
  const client = new pg.Client({ connectionString: url, ssl: process.env.DATABASE_SSL === 'off' ? false : { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(
      `insert into hrms.users (email, password_hash, full_name, role, must_change_password)
       values (lower($1), $2, $3, 'firm_admin', true)
       on conflict (email) do update set password_hash = excluded.password_hash, must_change_password = true, active = true,
         failed_attempts = 0, locked_until = null`,
      [email, hash, name],
    );
    console.log(`Administrator: ${email.toLowerCase()}`);
    console.log(`Temporary password: ${password}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
