'use server';

import { as, requireFirm, setPassword, type SessionUser } from '../auth';
import { decryptField, encryptField, generatePassword, hashPassword } from '../crypto';
import { UserError, friendlyError, type Sql } from '../db';
import { COMPONENT_KEYS, type Components } from '../payroll/types';
import { STATE_CODES } from '../states';
import {
  aadhaarProblem, accountProblem, cleanAadhaar, cleanAccount, cleanIfsc, cleanPan, emailProblem, ifscProblem,
  isIsoDate, last4, maskPan, panProblem, uanProblem,
} from '../validate';
import { bool, FormError, isUuid, num, optionalNum, run, str } from './util';

const STATUSES = ['pre_onboarding', 'probation', 'active', 'on_notice', 'exited'];

function readComponents(form: FormData): Components {
  const c = {} as Components;
  for (const k of COMPONENT_KEYS) c[k] = num(form, k, k);
  return c;
}

function employeeFields(form: FormData) {
  const emp_code = str(form, 'emp_code').toUpperCase();
  const full_name = str(form, 'full_name');
  const gender = str(form, 'gender') || 'M';
  const dob = str(form, 'dob');
  const doj = str(form, 'doj');
  const exit_date = str(form, 'exit_date');
  const work_state = str(form, 'work_state');
  const status = str(form, 'status') || 'active';
  const email = str(form, 'email').toLowerCase();
  const uan = str(form, 'uan');
  const tax_regime = str(form, 'tax_regime') || 'new';
  const opening_fy = str(form, 'opening_fy');
  if (!/^[A-Z0-9/_-]{1,20}$/.test(emp_code)) throw new FormError('Employee code must be 1 to 20 letters, digits, / or -.');
  if (!full_name) throw new FormError('Enter the employee name.');
  if (!['M', 'F', 'O'].includes(gender)) throw new FormError('Choose the gender.');
  if (dob && !isIsoDate(dob)) throw new FormError('Date of birth is not a valid date.');
  if (!isIsoDate(doj)) throw new FormError('Enter the date of joining.');
  if (dob && dob >= doj) throw new FormError('Date of birth must be before the date of joining.');
  if (exit_date && !isIsoDate(exit_date)) throw new FormError('Last working day is not a valid date.');
  if (exit_date && exit_date < doj) throw new FormError('Last working day cannot be before the date of joining.');
  if (status === 'exited' && !exit_date) throw new FormError('Enter the last working day for an exited employee.');
  if (!STATE_CODES.has(work_state)) throw new FormError('Choose the work state.');
  if (!STATUSES.includes(status)) throw new FormError('Choose a status.');
  if (email && emailProblem(email)) throw new FormError(emailProblem(email)!);
  if (uan && uanProblem(uan)) throw new FormError(uanProblem(uan)!);
  if (!['new', 'old'].includes(tax_regime)) throw new FormError('Choose the tax regime.');
  if (opening_fy && !/^\d{4}-\d{2}$/.test(opening_fy)) throw new FormError('Opening balance year must look like 2026-27.');
  return {
    emp_code, full_name, father_name: str(form, 'father_name'), gender, dob: dob || null, doj, exit_date: exit_date || null,
    designation: str(form, 'designation'), department: str(form, 'department'), location: str(form, 'location'),
    work_state, email, phone: str(form, 'phone'), address: str(form, 'address'), status,
    pf_applicable: bool(form, 'pf_applicable'), pf_restrict: bool(form, 'pf_restrict'), eps_applicable: bool(form, 'eps_applicable'),
    uan, pf_number: str(form, 'pf_number'), esi_applicable: bool(form, 'esi_applicable'), esi_number: str(form, 'esi_number'),
    pwd: bool(form, 'pwd'), pt_applicable: bool(form, 'pt_applicable'), tax_regime,
    old_regime_deductions: num(form, 'old_regime_deductions', 'Declared deductions'),
    tds_override_monthly: optionalNum(form, 'tds_override_monthly', 'Fixed monthly TDS'),
    opening_fy,
    opening_taxable_ytd: num(form, 'opening_taxable_ytd', 'Opening taxable salary'),
    opening_tds_ytd: num(form, 'opening_tds_ytd', 'Opening TDS'),
    bank_name: str(form, 'bank_name'),
    bank_ifsc: str(form, 'bank_ifsc') ? cleanIfsc(str(form, 'bank_ifsc')) : '',
  };
}

/** Validates and encrypts whichever sensitive values were typed in. Empty means "leave as it is". */
function sensitiveUpdates(form: FormData): { column: string; value: string }[] {
  const out: { column: string; value: string }[] = [];
  const pan = str(form, 'pan');
  if (pan) {
    const p = panProblem(pan);
    if (p) throw new FormError(p);
    out.push({ column: 'pan_enc', value: encryptField(cleanPan(pan)) }, { column: 'pan_masked', value: maskPan(cleanPan(pan)) });
  }
  const aadhaar = str(form, 'aadhaar');
  if (aadhaar) {
    const p = aadhaarProblem(aadhaar);
    if (p) throw new FormError(p);
    const a = cleanAadhaar(aadhaar);
    out.push({ column: 'aadhaar_enc', value: encryptField(a) }, { column: 'aadhaar_last4', value: last4(a) });
  }
  const account = str(form, 'bank_account');
  if (account) {
    const p = accountProblem(account);
    if (p) throw new FormError(p);
    const a = cleanAccount(account);
    out.push({ column: 'bank_acct_enc', value: encryptField(a) }, { column: 'bank_acct_last4', value: last4(a) });
  }
  const ifsc = str(form, 'bank_ifsc');
  if (ifsc && ifscProblem(ifsc)) throw new FormError(ifscProblem(ifsc)!);
  return out;
}

async function applySensitive(sql: Sql, employeeId: string, updates: { column: string; value: string }[]): Promise<void> {
  // Column names come from the fixed list in sensitiveUpdates, never from the form.
  for (const u of updates) {
    await sql(`update employees set ${u.column} = $2 where id = $1`, [employeeId, u.value]);
  }
}

export async function createEmployeeAction(form: FormData): Promise<void> {
  const user = await requireFirm();
  const clientId = str(form, 'client_id');
  if (!isUuid(clientId)) return;
  await run(`/c/${clientId}/employees/new`, async () => {
    const f = employeeFields(form);
    const sensitive = sensitiveUpdates(form);
    const structure = readComponents(form);
    const id = await as(user, async (sql) => {
      const row = await sql.one<{ id: string }>(
        `insert into employees (client_id, emp_code, full_name, father_name, gender, dob, doj, exit_date, designation,
            department, location, work_state, email, phone, address, status, pf_applicable, pf_restrict, eps_applicable,
            uan, pf_number, esi_applicable, esi_number, pwd, pt_applicable, tax_regime, old_regime_deductions,
            tds_override_monthly, opening_fy, opening_taxable_ytd, opening_tds_ytd, bank_name, bank_ifsc)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33)
         returning id`,
        [clientId, f.emp_code, f.full_name, f.father_name, f.gender, f.dob, f.doj, f.exit_date, f.designation,
         f.department, f.location, f.work_state, f.email, f.phone, f.address, f.status, f.pf_applicable, f.pf_restrict,
         f.eps_applicable, f.uan, f.pf_number, f.esi_applicable, f.esi_number, f.pwd, f.pt_applicable, f.tax_regime,
         f.old_regime_deductions, f.tds_override_monthly, f.opening_fy, f.opening_taxable_ytd, f.opening_tds_ytd,
         f.bank_name, f.bank_ifsc],
      );
      const empId = row!.id;
      await applySensitive(sql, empId, sensitive);
      if (COMPONENT_KEYS.some((k) => structure[k] > 0)) {
        await sql(
          `insert into salary_structures (client_id, employee_id, effective_from, basic, da, hra, conveyance, medical, special, lta, other)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [clientId, empId, f.doj, structure.basic, structure.da, structure.hra, structure.conveyance, structure.medical,
           structure.special, structure.lta, structure.other],
        );
      }
      await sql('select audit($1, $2, $3, $4, $5)', ['employee.create', 'employee', empId, clientId, JSON.stringify({ emp_code: f.emp_code })]);
      return empId;
    });
    return { to: `/c/${clientId}/employees/${id}`, msg: `${f.full_name} added.` };
  });
}

export async function updateEmployeeAction(form: FormData): Promise<void> {
  const user = await requireFirm();
  const clientId = str(form, 'client_id');
  const id = str(form, 'id');
  if (!isUuid(clientId) || !isUuid(id)) return;
  await run(`/c/${clientId}/employees/${id}/edit`, async () => {
    const f = employeeFields(form);
    const sensitive = sensitiveUpdates(form);
    await as(user, async (sql) => {
      const rows = await sql(
        `update employees set emp_code=$3, full_name=$4, father_name=$5, gender=$6, dob=$7, doj=$8, exit_date=$9,
            designation=$10, department=$11, location=$12, work_state=$13, email=$14, phone=$15, address=$16, status=$17,
            pf_applicable=$18, pf_restrict=$19, eps_applicable=$20, uan=$21, pf_number=$22, esi_applicable=$23,
            esi_number=$24, pwd=$25, pt_applicable=$26, tax_regime=$27, old_regime_deductions=$28,
            tds_override_monthly=$29, opening_fy=$30, opening_taxable_ytd=$31, opening_tds_ytd=$32, bank_name=$33, bank_ifsc=$34
          where id=$1 and client_id=$2 returning id`,
        [id, clientId, f.emp_code, f.full_name, f.father_name, f.gender, f.dob, f.doj, f.exit_date, f.designation,
         f.department, f.location, f.work_state, f.email, f.phone, f.address, f.status, f.pf_applicable, f.pf_restrict,
         f.eps_applicable, f.uan, f.pf_number, f.esi_applicable, f.esi_number, f.pwd, f.pt_applicable, f.tax_regime,
         f.old_regime_deductions, f.tds_override_monthly, f.opening_fy, f.opening_taxable_ytd, f.opening_tds_ytd,
         f.bank_name, f.bank_ifsc],
      );
      if (rows.length === 0) throw new UserError('Employee not found.');
      await applySensitive(sql, id, sensitive);
      await sql('select audit($1, $2, $3, $4, $5)', [
        'employee.update', 'employee', id, clientId,
        JSON.stringify({ sensitive_changed: sensitive.map((s) => s.column).filter((c) => c.endsWith('_enc')) }),
      ]);
    });
    return { to: `/c/${clientId}/employees/${id}`, msg: 'Saved.' };
  });
}

export async function saveStructureAction(form: FormData): Promise<void> {
  const user = await requireFirm();
  const clientId = str(form, 'client_id');
  const id = str(form, 'employee_id');
  if (!isUuid(clientId) || !isUuid(id)) return;
  await run(`/c/${clientId}/employees/${id}`, async () => {
    const from = str(form, 'effective_from');
    if (!isIsoDate(from)) throw new FormError('Enter the date the new salary starts from.');
    const c = readComponents(form);
    if (!COMPONENT_KEYS.some((k) => c[k] > 0)) throw new FormError('Enter at least one salary amount.');
    await as(user, async (sql) => {
      await sql(
        `insert into salary_structures (client_id, employee_id, effective_from, basic, da, hra, conveyance, medical, special, lta, other, notes)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         on conflict (employee_id, effective_from) do update set basic=excluded.basic, da=excluded.da, hra=excluded.hra,
           conveyance=excluded.conveyance, medical=excluded.medical, special=excluded.special, lta=excluded.lta,
           other=excluded.other, notes=excluded.notes`,
        [clientId, id, from, c.basic, c.da, c.hra, c.conveyance, c.medical, c.special, c.lta, c.other, str(form, 'notes')],
      );
      await sql('select audit($1, $2, $3, $4, $5)', ['salary.save', 'employee', id, clientId, JSON.stringify({ effective_from: from })]);
    });
    return { to: `/c/${clientId}/employees/${id}`, msg: 'Salary structure saved.' };
  });
}

export interface RevealState {
  values?: { pan: string; aadhaar: string; account: string };
  error?: string;
}

/** Shows the full PAN, Aadhaar and bank account to firm users, and records that it was done. */
export async function revealSecretsAction(_prev: RevealState, form: FormData): Promise<RevealState> {
  const user = await requireFirm();
  const id = str(form, 'employee_id');
  if (!isUuid(id)) return { error: 'Employee not found.' };
  try {
    const row = await as(user, async (sql) => {
      const r = await sql.one<{ client_id: string; pan_enc: string | null; aadhaar_enc: string | null; bank_acct_enc: string | null }>(
        'select client_id, pan_enc, aadhaar_enc, bank_acct_enc from employees where id = $1',
        [id],
      );
      if (r) await sql('select audit($1, $2, $3, $4, $5)', ['employee.reveal_ids', 'employee', id, r.client_id, '{}']);
      return r;
    });
    if (!row) return { error: 'Employee not found.' };
    return {
      values: {
        pan: row.pan_enc ? decryptField(row.pan_enc) : '',
        aadhaar: row.aadhaar_enc ? decryptField(row.aadhaar_enc) : '',
        account: row.bank_acct_enc ? decryptField(row.bank_acct_enc) : '',
      },
    };
  } catch (err) {
    return { error: err instanceof Error && err.name === 'DataKeyMissing' ? err.message : friendlyError(err) };
  }
}

export interface LoginState {
  created?: { email: string; password: string };
  error?: string;
}

async function requireAdminUser(): Promise<SessionUser> {
  const user = await requireFirm();
  if (user.role !== 'firm_admin') throw new UserError('Only an administrator can manage logins.');
  return user;
}

/** Creates a login for an employee (their own page only) with a temporary password shown once. */
export async function createEmployeeLoginAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  try {
    const user = await requireAdminUser();
    const id = str(form, 'employee_id');
    if (!isUuid(id)) return { error: 'Employee not found.' };
    const password = generatePassword();
    const hash = await hashPassword(password);
    const email = await as(user, async (sql) => {
      const emp = await sql.one<{ client_id: string; full_name: string; email: string }>(
        'select client_id, full_name, email from employees where id = $1',
        [id],
      );
      if (!emp) throw new UserError('Employee not found.');
      if (!emp.email) throw new UserError('Add an email address to the employee record first.');
      const created = await sql.one<{ id: string }>(
        `insert into users (email, password_hash, full_name, role, client_id, employee_id, must_change_password)
         values ($1, $2, $3, 'employee', $4, $5, true) returning id`,
        [emp.email, hash, emp.full_name, emp.client_id, id],
      );
      await sql('select audit($1, $2, $3, $4, $5)', ['user.create', 'user', created!.id, emp.client_id, JSON.stringify({ role: 'employee' })]);
      return emp.email;
    });
    return { created: { email, password } };
  } catch (err) {
    return { error: friendlyError(err) };
  }
}

export async function resetPasswordAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  try {
    const user = await requireAdminUser();
    const userId = str(form, 'user_id');
    if (!isUuid(userId)) return { error: 'Login not found.' };
    if (userId === user.id) return { error: 'Change your own password from My account.' };
    const target = await as(user, (sql) => sql.one<{ email: string }>('select email from users where id = $1', [userId]));
    if (!target) return { error: 'Login not found.' };
    const password = generatePassword();
    await setPassword(user, userId, password, true);
    return { created: { email: target.email, password } };
  } catch (err) {
    return { error: friendlyError(err) };
  }
}
