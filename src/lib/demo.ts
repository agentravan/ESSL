// Builds a demo client: an invented company with invented people, attendance, leave,
// payroll and concerns, plus two logins, so a prospect can look around. Nothing here
// is real. A demo client is marked as such and can be deleted in one step.

import { randomBytes, randomUUID } from 'node:crypto';
import { istToIso, hhmm } from './attendance';
import { encryptField, generatePassword, hashPassword, sha256 } from './crypto';
import type { Sql } from './db';
import { codeFromBytes, slaDue } from './grievances';
import { addDays, eachDay, STANDARD_LEAVE_TYPES, weekday } from './leave';
import { computeRun } from './payroll/run';
import { addMonths, currentPeriod, firstDay, lastDay, todayIso } from './payroll/period';
import { maskPan } from './validate';

interface DemoPerson {
  name: string;
  father: string;
  gender: 'M' | 'F';
  designation: string;
  department: string;
  basic: number;
  hra: number;
  special: number;
  joinedYearsAgo: number;
  esi?: boolean;
}

const PEOPLE: DemoPerson[] = [
  { name: 'Demo Manager One', father: 'Demo Parent', gender: 'F', designation: 'General Manager', department: 'Management', basic: 60000, hra: 30000, special: 30000, joinedYearsAgo: 4 },
  { name: 'Demo Accountant', father: 'Demo Parent', gender: 'M', designation: 'Senior Accountant', department: 'Finance', basic: 30000, hra: 15000, special: 10000, joinedYearsAgo: 3 },
  { name: 'Demo HR Executive', father: 'Demo Parent', gender: 'F', designation: 'HR Executive', department: 'HR', basic: 22000, hra: 11000, special: 7000, joinedYearsAgo: 2 },
  { name: 'Demo Sales Lead', father: 'Demo Parent', gender: 'M', designation: 'Sales Lead', department: 'Sales', basic: 35000, hra: 17500, special: 12500, joinedYearsAgo: 3 },
  { name: 'Demo Sales Officer A', father: 'Demo Parent', gender: 'M', designation: 'Sales Officer', department: 'Sales', basic: 18000, hra: 9000, special: 5000, joinedYearsAgo: 1 },
  { name: 'Demo Sales Officer B', father: 'Demo Parent', gender: 'F', designation: 'Sales Officer', department: 'Sales', basic: 18000, hra: 9000, special: 5000, joinedYearsAgo: 1 },
  { name: 'Demo Engineer A', father: 'Demo Parent', gender: 'M', designation: 'Engineer', department: 'Operations', basic: 28000, hra: 14000, special: 8000, joinedYearsAgo: 2 },
  { name: 'Demo Engineer B', father: 'Demo Parent', gender: 'F', designation: 'Engineer', department: 'Operations', basic: 26000, hra: 13000, special: 7000, joinedYearsAgo: 1 },
  { name: 'Demo Supervisor', father: 'Demo Parent', gender: 'M', designation: 'Shift Supervisor', department: 'Operations', basic: 20000, hra: 8000, special: 4000, joinedYearsAgo: 5 },
  { name: 'Demo Operator A', father: 'Demo Parent', gender: 'M', designation: 'Operator', department: 'Operations', basic: 12000, hra: 4000, special: 2000, joinedYearsAgo: 2, esi: true },
  { name: 'Demo Operator B', father: 'Demo Parent', gender: 'F', designation: 'Operator', department: 'Operations', basic: 12000, hra: 4000, special: 2000, joinedYearsAgo: 1, esi: true },
  { name: 'Demo Office Assistant', father: 'Demo Parent', gender: 'M', designation: 'Office Assistant', department: 'Admin', basic: 11000, hra: 4000, special: 1500, joinedYearsAgo: 1, esi: true },
];

export interface DemoResult {
  clientId: string;
  code: string;
  name: string;
  logins: { who: string; email: string; password: string }[];
}

/** A small repeatable "random" number so two demo clients do not look identical but each is stable. */
function pick(seed: string, mod: number): number {
  return parseInt(sha256(seed).slice(0, 8), 16) % mod;
}

function shiftYear(iso: string, years: number): string {
  const y = Number(iso.slice(0, 4)) - years;
  const md = iso.slice(5) === '02-29' ? '02-28' : iso.slice(5);
  return `${y}-${md}`;
}

/** Everything except the payroll runs, in one transaction as the administrator. */
export async function buildDemoClient(sql: Sql, adminId: string, input: { name: string; industry: string }): Promise<DemoResult & { periods: string[] }> {
  const code = `DEMO${codeFromBytes(randomBytes(4), 4)}`;
  const today = todayIso();
  const period = currentPeriod();
  const prev = addMonths(period, -1);
  const prev2 = addMonths(period, -2);
  const name = `${input.name} (demo)`;
  const client = await sql.one<{ id: string }>(
    `insert into clients (code, name, legal_name, address, state, pf_wage_rule, day_basis, contact_name, pf_code, esi_code, is_demo, industry,
                          weekly_off, shift_start, shift_end, grace_minutes)
     values ($1,$2,$3,'Demo address, not a real place','HR','basic_da','calendar','Demo Contact','DEMO000000000000','00000000000000000',true,$4,'{0}','09:30','18:30',15)
     returning id`,
    [code, name, name, input.industry],
  );
  const clientId = client!.id;

  const ids: string[] = [];
  for (let i = 0; i < PEOPLE.length; i++) {
    const p = PEOPLE[i];
    const n = i + 1;
    const pan = `DEMOP${String(n).padStart(4, '0')}X`;
    const account = `000000${String(5000 + n)}`;
    // A couple of birthdays and anniversaries fall in the next few weeks, so the dashboard has something to show.
    const dob = shiftYear(addDays(today, i === 2 ? 4 : i === 6 ? 11 : 40 + i * 23), 26 + (i % 9));
    const doj = shiftYear(addDays(firstDay(prev2), i === 4 ? 75 : -(20 + i * 9)), p.joinedYearsAgo);
    const emp = await sql.one<{ id: string }>(
      `insert into employees (client_id, emp_code, full_name, father_name, gender, dob, doj, designation, department, location, work_state,
          email, phone, address, status, pf_applicable, pf_restrict, esi_applicable, uan, esi_number, tax_regime,
          pan_masked, pan_enc, bank_name, bank_ifsc, bank_acct_last4, bank_acct_enc, manager_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Gurugram','HR',$10,'0000000000','Demo address, not a real place','active',true,true,$11,$12,$13,'new',
               $14,$15,'Demo Bank','DEMO0000000',$16,$17,$18) returning id`,
      [clientId, `D${String(n).padStart(3, '0')}`, p.name, p.father, p.gender, dob, doj, p.designation, p.department,
       `d${String(n).padStart(3, '0')}.${code.toLowerCase()}@demo.invalid`, p.esi ?? false, `2000000000${String(n).padStart(2, '0')}`,
       p.esi ? `11000000${String(n).padStart(2, '0')}` : '', maskPan(pan), encryptField(pan), account.slice(-4), encryptField(account), i === 0 ? null : ids[0]],
    );
    ids.push(emp!.id);
    await sql(
      'insert into salary_structures (client_id, employee_id, effective_from, basic, hra, special) values ($1,$2,$3,$4,$5,$6)',
      [clientId, emp!.id, doj, p.basic, p.hra, p.special],
    );
  }

  // Leave types, a holiday, and a few requests.
  const typeIds: Record<string, string> = {};
  for (const t of STANDARD_LEAVE_TYPES) {
    const row = await sql.one<{ id: string }>(
      'insert into leave_types (client_id, code, name, annual_quota, paid) values ($1,$2,$3,$4,$5) returning id',
      [clientId, t.code, t.name, t.annual_quota, t.paid],
    );
    typeIds[t.code] = row!.id;
  }
  const workingDays = (from: string, to: string) => eachDay(from, to).filter((d) => weekday(d) !== 0);
  const prevDays = workingDays(firstDay(prev), lastDay(prev));
  const holiday = prevDays[9];
  await sql("insert into holidays (client_id, day, name) values ($1,$2,'Demo holiday')", [clientId, holiday]);
  const leave = async (emp: number, type: string, from: string, to: string, days: number, status: 'approved' | 'pending', reason: string) => {
    await sql(
      `insert into leave_requests (client_id, employee_id, leave_type_id, from_date, to_date, days, reason, status, decided_by, decided_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [clientId, ids[emp], typeIds[type], from, to, days, reason, status, status === 'approved' ? adminId : null, status === 'approved' ? new Date().toISOString() : null],
    );
  };
  await leave(4, 'CL', prevDays[3], prevDays[4], 2, 'approved', 'Family function');
  await leave(9, 'LWP', prevDays[12], prevDays[12], 1, 'approved', 'Personal work');
  await leave(7, 'SL', prevDays[15], prevDays[15], 1, 'approved', 'Fever');
  const ahead = workingDays(addDays(today, 3), addDays(today, 14));
  await leave(5, 'EL', ahead[0], ahead[2], 3, 'pending', 'Travel to home town');
  await leave(10, 'CL', ahead[4], ahead[4], 1, 'pending', 'Bank work');
  await leave(1, 'CL', today, today, 1, 'approved', 'Personal work');

  // Punches for this month up to today: mostly on time, a few late, a few missing.
  const empCol: string[] = [];
  const tsCol: string[] = [];
  const kindCol: string[] = [];
  for (const day of workingDays(firstDay(period), today)) {
    for (let i = 0; i < ids.length; i++) {
      if (day === today && (i === 1 || pick(`${code}|today|${i}`, 5) === 0)) continue; // on leave, or not in yet
      if (day !== today && pick(`${code}|${day}|${i}|absent`, 14) === 0) continue;
      const late = pick(`${code}|${day}|${i}|late`, 7) === 0 ? 30 : 0;
      empCol.push(ids[i]); tsCol.push(istToIso(day, hhmm(9 * 60 + 5 + pick(`${code}|${day}|${i}|in`, 35) + late))); kindCol.push('in');
      if (day !== today) {
        empCol.push(ids[i]); tsCol.push(istToIso(day, hhmm(18 * 60 + 25 + pick(`${code}|${day}|${i}|out`, 50)))); kindCol.push('out');
      }
    }
  }
  if (empCol.length) {
    await sql(
      `insert into attendance_punches (client_id, employee_id, ts, kind, source, note, created_by)
       select $1, e, t, k, 'import', 'Demo data', $5 from unnest($2::uuid[], $3::timestamptz[], $4::text[]) as u(e, t, k)`,
      [clientId, empCol, tsCol, kindCol, adminId],
    );
  }

  // Logins: one for the client's HR and one employee. Made before the concerns so one can carry the employee's name.
  const logins: DemoResult['logins'] = [];
  const makeLogin = async (who: string, email: string, fullName: string, role: 'client_hr' | 'employee', employeeId: string | null) => {
    const password = generatePassword();
    const row = await sql.one<{ id: string }>(
      `insert into users (email, password_hash, full_name, role, client_id, employee_id, must_change_password)
       values ($1,$2,$3,$4,$5,$6,false) returning id`,
      [email, await hashPassword(password), fullName, role, clientId, employeeId],
    );
    logins.push({ who, email, password });
    return row!.id;
  };
  await makeLogin('Client HR', `hr.${code.toLowerCase()}@demo.invalid`, 'Demo Client HR', 'client_hr', null);
  const empUser = await makeLogin(`Employee (${PEOPLE[4].name})`, `emp.${code.toLowerCase()}@demo.invalid`, PEOPLE[4].name, 'employee', ids[4]);
  await makeLogin(`Manager (${PEOPLE[0].name})`, `manager.${code.toLowerCase()}@demo.invalid`, PEOPLE[0].name, 'employee', ids[0]);

  // Concerns: one overdue, one in progress, one resolved, one without a name.
  const concern = async (o: { by: boolean; category: string; priority: 'low' | 'medium' | 'high' | 'critical'; subject: string; description: string;
    status: 'open' | 'in_progress' | 'resolved'; hoursAgo: number; resolution?: string }) => {
    const id = randomUUID();
    const created = new Date(Date.now() - o.hoursAgo * 3_600_000);
    await sql(
      `insert into grievances (id, client_id, ref_no, raised_by, employee_id, anonymous, tracking_hash, category, priority, subject, description,
                               status, sla_due_at, resolution, created_at, closed_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [id, clientId, `GRV-${codeFromBytes(randomBytes(6), 6)}`, o.by ? empUser : null, o.by ? ids[4] : null, !o.by,
       o.by ? null : sha256(codeFromBytes(randomBytes(12), 12)), o.category, o.priority, o.subject, o.description, o.status,
       slaDue(o.priority, created).toISOString(), o.resolution ?? '', created.toISOString(),
       o.status === 'resolved' ? new Date(created.getTime() + 20 * 3_600_000).toISOString() : null],
    );
    if (o.by) await sql("insert into grievance_events (grievance_id, client_id, at, actor, kind, body) values ($1,$2,$3,$4,'created','Concern raised.')", [id, clientId, created.toISOString(), empUser]);
    if (o.resolution) await sql("insert into grievance_events (grievance_id, client_id, at, actor, kind, body) values ($1,$2,$3,$4,'resolution',$5)", [id, clientId, new Date(created.getTime() + 20 * 3_600_000).toISOString(), adminId, o.resolution]);
  };
  await concern({ by: true, category: 'payroll', priority: 'high', subject: 'Travel claim for last month not paid', description: 'I submitted my travel bills on the 2nd. The amount did not come with salary. Please check and tell me when it will be paid.', status: 'open', hoursAgo: 70 });
  await concern({ by: false, category: 'workplace', priority: 'medium', subject: 'Drinking water cooler on the shop floor is not working', description: 'The water cooler near line 2 has not worked for a week. People are walking to the office block for water.', status: 'in_progress', hoursAgo: 30 });
  await concern({ by: true, category: 'hr_policy', priority: 'low', subject: 'How is earned leave carried forward?', description: 'I want to know how many earned leave days can be carried to next year and whether the rest is paid.', status: 'resolved', hoursAgo: 200, resolution: 'Up to 30 earned leave days carry forward. Days above that are paid with January salary.' });

  await sql('select audit($1, $2, $3, $4, $5)', ['demo.create', 'client', clientId, clientId, JSON.stringify({ code })]);
  return { clientId, code, name, logins, periods: [prev2, prev, period] };
}

/** Payroll for the two earlier months (locked) and this month (left as a draft). One transaction per month. */
export async function runDemoPayroll(sql: Sql, adminId: string, clientId: string, period: string, lock: boolean): Promise<void> {
  const { runId } = await computeRun(sql, adminId, clientId, period);
  if (lock) await sql("update payroll_runs set status = 'locked', locked_at = now(), locked_by = $2 where id = $1", [runId, adminId]);
}
