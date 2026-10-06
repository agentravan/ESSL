// Computes (or recomputes) a client's payroll for one month and stores the result.

import { UserError, type Sql } from '../db';
import { computePayroll } from './calc';
import { financialYear, firstDay, fyStart, isPeriod, lastDay, periodLabel } from './period';
import { loadRules } from './rules';
import { COMPONENT_KEYS, type Adjustment, type Components, type DayBasis, type PayrollResult, type PfWageRule } from './types';

export interface RunTotals {
  headcount: number;
  grossEarned: number;
  totalEarnings: number;
  pfEmployee: number;
  employerPf: number;
  eps: number;
  edli: number;
  pfAdmin: number;
  esiEmployee: number;
  esiEmployer: number;
  pt: number;
  tds: number;
  otherDeductions: number;
  netPay: number;
  employerCost: number;
  linesWithWarnings: number;
  skipped: { code: string; name: string; reason: string }[];
  unverifiedRules: string[];
  notes: string[];
}

export interface StoredCalc {
  result: PayrollResult;
  adjustments: Adjustment[];
}

interface EmpRow {
  id: string;
  emp_code: string;
  full_name: string;
  designation: string;
  department: string;
  location: string;
  gender: 'M' | 'F' | 'O';
  doj: string;
  exit_date: string | null;
  work_state: string;
  pf_applicable: boolean;
  pf_restrict: boolean;
  eps_applicable: boolean;
  uan: string;
  pf_number: string;
  esi_applicable: boolean;
  esi_number: string;
  pwd: boolean;
  pt_applicable: boolean;
  tax_regime: 'new' | 'old';
  old_regime_deductions: number;
  tds_override_monthly: number | null;
  opening_fy: string;
  opening_taxable_ytd: number;
  opening_tds_ytd: number;
  pan_masked: string;
  bank_name: string;
  bank_acct_last4: string;
}

export async function computeRun(sql: Sql, userId: string, clientId: string, period: string): Promise<{ runId: string; totals: RunTotals }> {
  if (!isPeriod(period)) throw new UserError('Choose a month.');
  const client = await sql.one<{ pf_wage_rule: PfWageRule | null; day_basis: DayBasis }>(
    'select pf_wage_rule, day_basis from clients where id = $1',
    [clientId],
  );
  if (!client) throw new UserError('Client not found.');
  if (!client.pf_wage_rule) {
    throw new UserError('Choose the PF wage rule for this client under Settings before running payroll.');
  }
  const start = firstDay(period);
  const end = lastDay(period);

  let run = await sql.one<{ id: string; status: string }>(
    'select id, status from payroll_runs where client_id = $1 and period = $2 for update',
    [clientId, start],
  );
  if (run?.status === 'locked') throw new UserError(`Payroll for ${periodLabel(period)} is locked.`);
  if (!run) {
    run = await sql.one<{ id: string; status: string }>(
      "insert into payroll_runs (client_id, period, status) values ($1, $2, 'draft') returning id, status",
      [clientId, start],
    );
  }
  const runId = run!.id;

  const employees = await sql<EmpRow>(
    `select id, emp_code, full_name, designation, department, location, gender, doj, exit_date, work_state,
            pf_applicable, pf_restrict, eps_applicable, uan, pf_number, esi_applicable, esi_number, pwd, pt_applicable,
            tax_regime, old_regime_deductions, tds_override_monthly, opening_fy, opening_taxable_ytd, opening_tds_ytd,
            pan_masked, bank_name, bank_acct_last4
       from employees
      where client_id = $1 and status <> 'pre_onboarding' and doj <= $3 and (exit_date is null or exit_date >= $2)
      order by emp_code`,
    [clientId, start, end],
  );
  const structures = await sql<Components & { employee_id: string }>(
    `select distinct on (employee_id) employee_id, basic, da, hra, conveyance, medical, special, lta, other
       from salary_structures where client_id = $1 and effective_from <= $2
      order by employee_id, effective_from desc`,
    [clientId, end],
  );
  const structureOf = new Map(structures.map((s) => [s.employee_id, s]));
  const attendance = await sql<{ employee_id: string; lop_days: number }>(
    'select employee_id, lop_days from attendance_monthly where client_id = $1 and period = $2',
    [clientId, start],
  );
  const lopOf = new Map(attendance.map((a) => [a.employee_id, a.lop_days]));
  const adjRows = await sql<Adjustment & { employee_id: string }>(
    'select employee_id, kind, label, amount, taxable from payroll_adjustments where client_id = $1 and period = $2 order by created_at',
    [clientId, start],
  );
  const adjustmentsOf = new Map<string, Adjustment[]>();
  for (const a of adjRows) {
    const list = adjustmentsOf.get(a.employee_id) ?? [];
    list.push({ kind: a.kind, label: a.label, amount: a.amount, taxable: a.taxable });
    adjustmentsOf.set(a.employee_id, list);
  }

  const fyFirst = firstDay(fyStart(period));
  const ytdRows = await sql<{ employee_id: string; taxable: number; tds: number; pt: number }>(
    `select l.employee_id, sum(l.taxable_earned) as taxable, sum(l.tds) as tds, sum(l.pt) as pt
       from payroll_lines l join payroll_runs r on r.id = l.run_id
      where r.client_id = $1 and r.period >= $2 and r.period < $3 and r.status = 'locked'
      group by l.employee_id`,
    [clientId, fyFirst, start],
  );
  const ytdOf = new Map(ytdRows.map((y) => [y.employee_id, y]));
  const earlierDrafts = await sql<{ period: string }>(
    "select period::text from payroll_runs where client_id = $1 and period >= $2 and period < $3 and status = 'draft' order by period",
    [clientId, fyFirst, start],
  );

  const rules = await loadRules(sql, period, employees.map((e) => e.work_state));
  const fy = financialYear(period);

  const totals: RunTotals = {
    headcount: 0, grossEarned: 0, totalEarnings: 0, pfEmployee: 0, employerPf: 0, eps: 0, edli: 0, pfAdmin: 0,
    esiEmployee: 0, esiEmployer: 0, pt: 0, tds: 0, otherDeductions: 0, netPay: 0, employerCost: 0,
    linesWithWarnings: 0, skipped: [], unverifiedRules: [], notes: [],
  };
  let adminSum = 0;
  let pfMembers = 0;
  const lines: Record<string, unknown>[] = [];

  for (const e of employees) {
    const s = structureOf.get(e.id);
    if (!s || !COMPONENT_KEYS.some((k) => s[k] > 0)) {
      totals.skipped.push({ code: e.emp_code, name: e.full_name, reason: 'No salary structure in force for this month' });
      continue;
    }
    const structure = {} as Components;
    for (const k of COMPONENT_KEYS) structure[k] = s[k];
    const y = ytdOf.get(e.id);
    const opening = e.opening_fy === fy;
    const adjustments = adjustmentsOf.get(e.id) ?? [];
    const result = computePayroll({
      period,
      dayBasis: client.day_basis,
      pfWageRule: client.pf_wage_rule,
      employee: {
        gender: e.gender, workState: e.work_state, doj: e.doj, exitDate: e.exit_date, pfApplicable: e.pf_applicable,
        pfRestrict: e.pf_restrict, epsApplicable: e.eps_applicable, esiApplicable: e.esi_applicable, pwd: e.pwd,
        ptApplicable: e.pt_applicable, taxRegime: e.tax_regime, oldRegimeDeductions: e.old_regime_deductions,
        tdsOverrideMonthly: e.tds_override_monthly,
      },
      structure,
      lopDays: lopOf.get(e.id) ?? 0,
      adjustments,
      ytd: {
        taxablePaid: (y?.taxable ?? 0) + (opening ? e.opening_taxable_ytd : 0),
        tdsPaid: (y?.tds ?? 0) + (opening ? e.opening_tds_ytd : 0),
        ptPaid: y?.pt ?? 0,
      },
      rules: { pf: rules.pf, esi: rules.esi, pt: rules.pt.get(e.work_state) ?? null, tax: e.tax_regime === 'old' ? rules.taxOld : rules.taxNew },
    });
    const stored: StoredCalc = { result, adjustments };
    lines.push({
      employee_id: e.id,
      emp: {
        code: e.emp_code, name: e.full_name, designation: e.designation, department: e.department, location: e.location,
        doj: e.doj, uan: e.uan, pfNumber: e.pf_number, esiNumber: e.esi_number, pan: e.pan_masked, bankName: e.bank_name,
        bankAccount: e.bank_acct_last4, workState: e.work_state, taxRegime: e.tax_regime,
      },
      calc: stored,
      paid_days: result.paidDays,
      gross_full: result.grossFull,
      gross_earned: result.grossEarned,
      taxable_earned: result.taxableEarned,
      pf_employee: result.pf.employee,
      esi_employee: result.esi.employee,
      pt: result.pt,
      tds: result.tds,
      other_deductions: result.adjustmentDeductions,
      total_deductions: result.totalDeductions,
      net_pay: result.netPay,
      employer_pf: result.pf.employerEpf + result.pf.eps,
      employer_esi: result.esi.employer,
    });
    totals.headcount += 1;
    totals.grossEarned += result.grossEarned;
    totals.totalEarnings += result.totalEarnings;
    totals.pfEmployee += result.pf.employee;
    totals.employerPf += result.pf.employerEpf + result.pf.eps;
    totals.eps += result.pf.eps;
    totals.edli += result.pf.edli;
    adminSum += result.pf.admin;
    if (result.pf.applicable && result.pf.pfWage > 0) pfMembers += 1;
    totals.esiEmployee += result.esi.employee;
    totals.esiEmployer += result.esi.employer;
    totals.pt += result.pt;
    totals.tds += result.tds;
    totals.otherDeductions += result.adjustmentDeductions;
    totals.netPay += result.netPay;
    totals.employerCost += result.employerCost - result.pf.admin;
    if (result.warnings.length > 0) totals.linesWithWarnings += 1;
  }
  totals.pfAdmin = pfMembers > 0 ? Math.max(rules.pf.adminMin, adminSum) : 0;
  totals.employerCost += totals.pfAdmin;
  totals.unverifiedRules = rules.used
    .filter((r) => !r.verified)
    .map((r) => `${r.kind === 'pt' ? `Professional tax (${r.state})` : r.kind === 'pf' ? 'Provident fund' : r.kind === 'esi' ? 'ESI' : r.kind === 'tax_new' ? 'Income tax, new regime' : 'Income tax, old regime'} from ${r.effective_from}`);
  if (earlierDrafts.length > 0) {
    totals.notes.push(
      `Earlier months of ${fy} are still in draft (${earlierDrafts.map((d) => periodLabel(d.period.slice(0, 7))).join(', ')}). ` +
        'TDS here counts only locked months, so lock those first and recalculate.',
    );
  }

  await sql('delete from payroll_lines where run_id = $1', [runId]);
  if (lines.length > 0) {
    await sql(
      `insert into payroll_lines (run_id, client_id, employee_id, emp, calc, paid_days, gross_full, gross_earned, taxable_earned,
          pf_employee, esi_employee, pt, tds, other_deductions, total_deductions, net_pay, employer_pf, employer_esi)
       select $1, $2, x.employee_id, x.emp, x.calc, x.paid_days, x.gross_full, x.gross_earned, x.taxable_earned,
              x.pf_employee, x.esi_employee, x.pt, x.tds, x.other_deductions, x.total_deductions, x.net_pay, x.employer_pf, x.employer_esi
         from jsonb_to_recordset($3::jsonb) as x(employee_id uuid, emp jsonb, calc jsonb, paid_days numeric, gross_full numeric,
              gross_earned numeric, taxable_earned numeric, pf_employee numeric, esi_employee numeric, pt numeric, tds numeric,
              other_deductions numeric, total_deductions numeric, net_pay numeric, employer_pf numeric, employer_esi numeric)`,
      [runId, clientId, JSON.stringify(lines)],
    );
  }
  await sql(
    'update payroll_runs set totals = $2, settings = $3, computed_at = now(), computed_by = $4 where id = $1',
    [
      runId,
      JSON.stringify(totals),
      JSON.stringify({ pfWageRule: client.pf_wage_rule, dayBasis: client.day_basis, ruleIds: rules.used.map((r) => r.id) }),
      userId,
    ],
  );
  await sql('select audit($1, $2, $3, $4, $5)', [
    'payroll.compute', 'payroll_run', runId, clientId, JSON.stringify({ period, headcount: totals.headcount, netPay: totals.netPay }),
  ]);
  return { runId, totals };
}
