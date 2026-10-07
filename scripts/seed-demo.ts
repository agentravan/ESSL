// Loads made-up sample data so the app can be tried out. Every name, number and
// company here is invented. Passwords are generated when the script runs and
// printed once; none are stored in this file.
//
// Usage (after scripts/migrate.mjs):
//   DATABASE_URL=... MIGRATE_DATABASE_URL=... DATA_KEY=... npx tsx scripts/seed-demo.ts [admin-email]
//
// Refuses to run if the database already has clients.

import pg from 'pg';
import { encryptField, generatePassword, hashPassword } from '../src/lib/crypto';
import { tx } from '../src/lib/db';
import { fillTemplate } from '../src/lib/letters/template';
import { salaryRows, standardValues } from '../src/lib/letters/values';
import { computeRun } from '../src/lib/payroll/run';
import type { Components } from '../src/lib/payroll/types';
import { maskPan } from '../src/lib/validate';

interface SeedEmployee {
  code: string;
  name: string;
  father: string;
  gender: 'M' | 'F';
  doj: string;
  exit?: string;
  status?: string;
  designation: string;
  department: string;
  state: string;
  location: string;
  salary: Partial<Components>;
  pf?: boolean;
  pfRestrict?: boolean;
  esi?: boolean;
  regime?: 'new' | 'old';
  oldDeductions?: number;
  n: number; // used to build obviously fake identifiers
}

const ZERO: Components = { basic: 0, da: 0, hra: 0, conveyance: 0, medical: 0, special: 0, lta: 0, other: 0 };

const CLIENTS: { code: string; name: string; legal: string; address: string; state: string; rule: 'basic_da' | 'fifty_percent'; employees: SeedEmployee[] }[] = [
  {
    code: 'NORTH',
    name: 'Northfield Traders (sample)',
    legal: 'Northfield Traders Private Limited',
    address: 'Plot 00, Sample Industrial Area\nGurugram, Haryana 122000',
    state: 'HR',
    rule: 'basic_da',
    employees: [
      { n: 1, code: 'NT001', name: 'Sample Employee One', father: 'Sample Father One', gender: 'F', doj: '2023-04-01', designation: 'Accounts Manager', department: 'Finance', state: 'HR', location: 'Gurugram', salary: { basic: 75000, hra: 37500, special: 37500 }, pfRestrict: true },
      { n: 2, code: 'NT002', name: 'Sample Employee Two', father: 'Sample Father Two', gender: 'M', doj: '2024-07-15', designation: 'Sales Executive', department: 'Sales', state: 'HR', location: 'Gurugram', salary: { basic: 20000, hra: 10000, special: 10000 } },
      { n: 3, code: 'NT003', name: 'Sample Employee Three', father: 'Sample Father Three', gender: 'M', doj: '2025-01-06', designation: 'Store Assistant', department: 'Warehouse', state: 'HR', location: 'Gurugram', salary: { basic: 12000, hra: 5000, conveyance: 1600 }, esi: true },
      { n: 4, code: 'NT004', name: 'Sample Employee Four', father: 'Sample Father Four', gender: 'F', doj: '2025-09-01', designation: 'Office Assistant', department: 'Admin', state: 'DL', location: 'New Delhi', salary: { basic: 15000, hra: 6000 }, esi: true },
      { n: 5, code: 'NT005', name: 'Sample Employee Five', father: 'Sample Father Five', gender: 'M', doj: '2022-11-10', designation: 'Operations Head', department: 'Operations', state: 'HR', location: 'Gurugram', salary: { basic: 50000, hra: 25000, special: 25000 }, pf: false, regime: 'old', oldDeductions: 150000 },
      { n: 6, code: 'NT006', name: 'Sample Employee Six', father: 'Sample Father Six', gender: 'M', doj: '2026-10-16', designation: 'Trainee', department: 'Sales', state: 'HR', location: 'Gurugram', status: 'probation', salary: { basic: 18000, hra: 7000 }, esi: false },
    ],
  },
  {
    code: 'SUNR',
    name: 'Sunrise Foods (sample)',
    legal: 'Sunrise Foods LLP',
    address: 'Unit 00, Sample Park\nPune, Maharashtra 411000',
    state: 'MH',
    rule: 'fifty_percent',
    employees: [
      { n: 11, code: 'SF001', name: 'Sample Person Alpha', father: 'Sample Father Alpha', gender: 'M', doj: '2024-02-01', designation: 'Plant Supervisor', department: 'Production', state: 'MH', location: 'Pune', salary: { basic: 12000, hra: 8000, special: 20000 } },
      { n: 12, code: 'SF002', name: 'Sample Person Beta', father: 'Sample Father Beta', gender: 'F', doj: '2024-06-10', designation: 'Quality Analyst', department: 'Quality', state: 'MH', location: 'Pune', salary: { basic: 16000, hra: 8000, special: 6000 } },
      { n: 13, code: 'SF003', name: 'Sample Person Gamma', father: 'Sample Father Gamma', gender: 'M', doj: '2025-03-03', designation: 'Machine Operator', department: 'Production', state: 'MH', location: 'Pune', salary: { basic: 11000, hra: 4000, conveyance: 1000 }, esi: true },
      { n: 14, code: 'SF004', name: 'Sample Person Delta', father: 'Sample Father Delta', gender: 'F', doj: '2023-08-21', designation: 'HR Executive', department: 'HR', state: 'KA', location: 'Bengaluru', salary: { basic: 22000, hra: 11000, special: 9000 } },
    ],
  },
];

async function main() {
  const adminEmail = (process.argv[2] ?? 'admin@sample.invalid').toLowerCase();
  const ownerUrl = process.env.MIGRATE_DATABASE_URL;
  if (!ownerUrl || !process.env.DATABASE_URL || !process.env.DATA_KEY) {
    console.error('Set DATABASE_URL, MIGRATE_DATABASE_URL and DATA_KEY first.');
    process.exit(1);
  }
  const ssl = process.env.DATABASE_SSL === 'off' ? false : { rejectUnauthorized: false };
  const owner = new pg.Client({ connectionString: ownerUrl, ssl });
  await owner.connect();

  const existing = await owner.query('select count(*)::int as n from hrms.clients');
  if (existing.rows[0].n > 0) {
    console.error('This database already has clients. Sample data is only loaded into an empty database.');
    await owner.end();
    process.exit(1);
  }

  const logins: { who: string; email: string; password: string }[] = [];
  const makeUser = async (who: string, email: string, name: string, role: string, clientId: string | null, employeeId: string | null) => {
    const password = generatePassword();
    const res = await owner.query(
      `insert into hrms.users (email, password_hash, full_name, role, client_id, employee_id, must_change_password)
       values ($1, $2, $3, $4, $5, $6, false)
       on conflict (email) do update set password_hash = excluded.password_hash, active = true
       returning id`,
      [email, await hashPassword(password), name, role, clientId, employeeId],
    );
    logins.push({ who, email, password });
    return res.rows[0].id as string;
  };

  const adminId = await makeUser('Administrator (you)', adminEmail, 'Office Administrator', 'firm_admin', null, null);
  await makeUser('Office staff', 'staff@sample.invalid', 'Sample Staff Member', 'firm_staff', null, null);

  const clientIds: Record<string, string> = {};
  const employeeIds: Record<string, string> = {};

  // Everything below goes through the same path the web app uses: the
  // restricted database role, acting as the administrator.
  await tx(adminId, async (sql) => {
    await sql("update firm_settings set firm_name = 'Teamwork (sample office)' where id = 1");
    for (const c of CLIENTS) {
      const row = await sql.one<{ id: string }>(
        `insert into clients (code, name, legal_name, address, state, pf_wage_rule, day_basis, contact_name, pf_code, esi_code)
         values ($1,$2,$3,$4,$5,$6,'calendar','Sample Contact','SAMPLE0000000000','00000000000000000') returning id`,
        [c.code, c.name, c.legal, c.address, c.state, c.rule],
      );
      clientIds[c.code] = row!.id;
      for (const e of c.employees) {
        const pan = `SAMPL${String(e.n).padStart(4, '0')}X`;
        const account = `0000000${String(1000 + e.n)}`;
        const emp = await sql.one<{ id: string }>(
          `insert into employees (client_id, emp_code, full_name, father_name, gender, dob, doj, exit_date, designation, department,
              location, work_state, email, phone, address, status, pf_applicable, pf_restrict, esi_applicable, uan, esi_number,
              tax_regime, old_regime_deductions, pan_masked, pan_enc, bank_name, bank_ifsc, bank_acct_last4, bank_acct_enc)
           values ($1,$2,$3,$4,$5,'1990-01-01',$6,$7,$8,$9,$10,$11,$12,'0000000000','Sample address, not a real place',$13,$14,$15,$16,$17,$18,
                   $19,$20,$21,$22,'Sample Bank','SAMP0000000',$23,$24) returning id`,
          [row!.id, e.code, e.name, e.father, e.gender, e.doj, e.exit ?? null, e.designation, e.department, e.location, e.state,
           `${e.code.toLowerCase()}@sample.invalid`, e.status ?? 'active', e.pf ?? true, e.pfRestrict ?? true, e.esi ?? false,
           e.pf === false ? '' : `1000000000${String(e.n).padStart(2, '0')}`, e.esi ? `00000000${String(e.n).padStart(2, '0')}` : '',
           e.regime ?? 'new', e.oldDeductions ?? 0, maskPan(pan), encryptField(pan), account.slice(-4), encryptField(account)],
        );
        employeeIds[e.code] = emp!.id;
        const s = { ...ZERO, ...e.salary };
        await sql(
          `insert into salary_structures (client_id, employee_id, effective_from, basic, da, hra, conveyance, medical, special, lta, other)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [row!.id, emp!.id, e.doj, s.basic, s.da, s.hra, s.conveyance, s.medical, s.special, s.lta, s.other],
        );
      }
    }
    // Attendance: a few unpaid days so the figures are not all round numbers.
    const lop: [string, string, string, number][] = [
      ['NORTH', 'NT003', '2026-09-01', 2],
      ['NORTH', 'NT002', '2026-10-01', 1],
      ['NORTH', 'NT004', '2026-10-01', 0.5],
      ['SUNR', 'SF003', '2026-09-01', 1],
    ];
    for (const [client, code, period, days] of lop) {
      await sql(
        'insert into attendance_monthly (client_id, employee_id, period, lop_days, remarks, updated_by) values ($1,$2,$3,$4,$5,$6)',
        [clientIds[client], employeeIds[code], period, days, 'Leave without pay', adminId],
      );
    }
    await sql(
      "insert into payroll_adjustments (client_id, employee_id, period, kind, label, amount, taxable) values ($1,$2,'2026-10-01','earning','Sales incentive',5000,true)",
      [clientIds.NORTH, employeeIds.NT002],
    );
    await sql(
      "insert into payroll_adjustments (client_id, employee_id, period, kind, label, amount, taxable) values ($1,$2,'2026-10-01','deduction','Salary advance recovery',3000,false)",
      [clientIds.NORTH, employeeIds.NT003],
    );
  });

  // Payroll: August and September locked, October left as a draft to play with.
  for (const c of CLIENTS) {
    for (const period of ['2026-08', '2026-09', '2026-10']) {
      await tx(adminId, async (sql) => {
        const { runId } = await computeRun(sql, adminId, clientIds[c.code], period);
        if (period !== '2026-10') {
          await sql("update payroll_runs set status = 'locked', locked_at = now(), locked_by = $2 where id = $1", [runId, adminId]);
        }
      });
    }
  }

  // One letter, shared with the employee who gets a login.
  await tx(adminId, async (sql) => {
    const template = await sql.one<{ id: string; body: string }>("select id, body from letter_templates where name = 'Appointment letter'");
    const e = CLIENTS[0].employees[1];
    const client = CLIENTS[0];
    const structure = { ...ZERO, ...e.salary };
    const values = standardValues({
      letterDate: '2024-07-15',
      refNo: 'NORTH/HR/2024/001',
      employee: { full_name: e.name, emp_code: e.code, father_name: e.father, gender: e.gender, designation: e.designation, department: e.department, location: e.location, doj: e.doj, exit_date: null, address: 'Sample address, not a real place', email: '' },
      client: { name: client.name, legal_name: client.legal, address: client.address },
      structure,
    });
    Object.assign(values, { probation_months: '6', notice_days: '30', signatory_name: 'Sample Signatory', signatory_designation: 'Director' });
    const filled = fillTemplate(template!.body, values);
    if (filled.missing.length) throw new Error(`template fields missing: ${filled.missing.join(', ')}`);
    await sql(
      `insert into documents (client_id, employee_id, title, ref_no, template_id, body, data, letter_date, visible_to_employee, created_by)
       values ($1,$2,'Appointment letter','NORTH/HR/2024/001',$3,$4,$5,'2024-07-15',true,$6)`,
      [clientIds.NORTH, employeeIds.NT002, template!.id, filled.text, JSON.stringify({ salaryRows: salaryRows(structure) }), adminId],
    );
  });

  await makeUser('Client HR for Northfield Traders', 'hr.north@sample.invalid', 'Sample Client HR', 'client_hr', clientIds.NORTH, null);
  await makeUser('Client HR for Sunrise Foods', 'hr.sunrise@sample.invalid', 'Sample Client HR Two', 'client_hr', clientIds.SUNR, null);
  await makeUser('Employee (Sample Employee Two)', 'nt002@sample.invalid', 'Sample Employee Two', 'employee', clientIds.NORTH, employeeIds.NT002);

  await owner.end();
  console.log('\nSample data loaded. Logins (shown once):\n');
  for (const l of logins) console.log(`  ${l.who}\n    email:    ${l.email}\n    password: ${l.password}\n`);
  if (process.env.SEED_LOGINS_FILE) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(process.env.SEED_LOGINS_FILE, JSON.stringify({ logins, clientIds, employeeIds }, null, 2), { mode: 0o600 });
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
