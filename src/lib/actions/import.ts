'use server';

import { as, requireFirm } from '../auth';
import { encryptField } from '../crypto';
import { friendlyError } from '../db';
import { checkEmployeeSheet, type ImportProblem } from '../import/employees';
import { readTable } from '../import/table';
import { loadRules } from '../payroll/rules';
import { currentPeriod } from '../payroll/period';
import { last4, maskPan } from '../validate';
import { isUuid, str } from './util';

export interface ImportState {
  problems?: ImportProblem[];
  error?: string;
  imported?: number;
  ignoredColumns?: string[];
  matchedColumns?: string[];
  fileName?: string;
}

/** Imports every row or none: if any line has a problem, nothing is saved. */
export async function importEmployeesAction(_prev: ImportState, form: FormData): Promise<ImportState> {
  const user = await requireFirm();
  const clientId = str(form, 'client_id');
  if (!isUuid(clientId)) return { error: 'Client not found.' };
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose a file first.' };
  if (file.size > 4 * 1024 * 1024) return { error: 'The file is larger than 4 MB. Remove unused sheets or split it.' };
  let table: string[][];
  try {
    table = await readTable(file.name, await file.arrayBuffer());
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'The file could not be read.', fileName: file.name };
  }
  try {
    return await as(user, async (sql) => {
      const client = await sql.one<{ state: string }>('select state from clients where id = $1', [clientId]);
      if (!client) return { error: 'Client not found.' };
      const rules = await loadRules(sql, currentPeriod(), []);
      const check = checkEmployeeSheet(table, { state: client.state, esiLimit: rules.esi.wageLimit });
      const problems = [...check.problems];
      if (check.employees.length > 0) {
        const existing = await sql<{ emp_code: string }>(
          'select emp_code from employees where client_id = $1 and emp_code = any($2::text[])',
          [clientId, check.employees.map((e) => e.emp_code)],
        );
        const taken = new Set(existing.map((e) => e.emp_code));
        for (const e of check.employees) {
          if (taken.has(e.emp_code)) problems.push({ line: e.line, column: 'Employee code', message: `"${e.emp_code}" already exists for this client.` });
        }
      }
      const base = { ignoredColumns: check.ignoredColumns, matchedColumns: check.matchedColumns, fileName: file.name };
      if (problems.length > 0) return { ...base, problems: problems.sort((a, b) => a.line - b.line).slice(0, 200) };
      for (const e of check.employees) {
        const row = await sql.one<{ id: string }>(
          `insert into employees (client_id, emp_code, full_name, father_name, gender, dob, doj, designation, department, location,
              work_state, email, phone, uan, pf_number, esi_number, pf_applicable, esi_applicable, tax_regime, bank_name, bank_ifsc,
              pan_masked, pan_enc, aadhaar_last4, aadhaar_enc, bank_acct_last4, bank_acct_enc)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27) returning id`,
          [clientId, e.emp_code, e.full_name, e.father_name, e.gender, e.dob, e.doj, e.designation, e.department, e.location,
           e.work_state, e.email, e.phone, e.uan, e.pf_number, e.esi_number, e.pf_applicable, e.esi_applicable, e.tax_regime,
           e.bank_name, e.bank_ifsc,
           e.pan ? maskPan(e.pan) : '', e.pan ? encryptField(e.pan) : null,
           e.aadhaar ? last4(e.aadhaar) : '', e.aadhaar ? encryptField(e.aadhaar) : null,
           e.bank_account ? last4(e.bank_account) : '', e.bank_account ? encryptField(e.bank_account) : null],
        );
        const s = e.structure;
        await sql(
          `insert into salary_structures (client_id, employee_id, effective_from, basic, da, hra, conveyance, medical, special, lta, other, notes)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'Imported')`,
          [clientId, row!.id, e.doj, s.basic, s.da, s.hra, s.conveyance, s.medical, s.special, s.lta, s.other],
        );
      }
      await sql('select audit($1, $2, $3, $4, $5)', ['employee.import', 'client', clientId, clientId, JSON.stringify({ file: file.name, employees: check.employees.length })]);
      return { ...base, imported: check.employees.length };
    });
  } catch (err) {
    return { error: friendlyError(err), fileName: file.name };
  }
}
