// Turns a stored payroll line into what the payslip PDF and the screens show.

import { dmy } from '../format';
import type { PayslipInput } from '../pdf/payslip';
import { periodLabel } from './period';
import type { StoredCalc } from './run';
import { COMPONENT_KEYS, COMPONENT_LABELS } from './types';

export interface LineEmp {
  code: string;
  name: string;
  designation: string;
  department: string;
  location: string;
  doj: string;
  uan: string;
  pfNumber: string;
  esiNumber: string;
  pan: string;
  bankName: string;
  bankAccount: string;
  workState: string;
  taxRegime: string;
}

export function earningRows(calc: StoredCalc): { label: string; full: number | null; earned: number }[] {
  const r = calc.result;
  const rows: { label: string; full: number | null; earned: number }[] = [];
  for (const k of COMPONENT_KEYS) {
    if (r.full[k] > 0) rows.push({ label: COMPONENT_LABELS[k], full: r.full[k], earned: r.earned[k] });
  }
  for (const a of calc.adjustments) {
    if (a.kind === 'earning') rows.push({ label: a.label, full: null, earned: a.amount });
  }
  return rows;
}

export function deductionRows(calc: StoredCalc): { label: string; amount: number }[] {
  const r = calc.result;
  const rows: { label: string; amount: number }[] = [];
  if (r.pf.employee > 0) rows.push({ label: 'Provident Fund', amount: r.pf.employee });
  if (r.esi.employee > 0) rows.push({ label: 'ESI', amount: r.esi.employee });
  if (r.pt > 0) rows.push({ label: 'Professional Tax', amount: r.pt });
  if (r.tds > 0) rows.push({ label: 'Income Tax (TDS)', amount: r.tds });
  for (const a of calc.adjustments) {
    if (a.kind === 'deduction') rows.push({ label: a.label, amount: a.amount });
  }
  return rows;
}

export function payslipInput(args: {
  client: { name: string; legal_name: string; address: string };
  period: string;
  emp: LineEmp;
  calc: StoredCalc;
  note?: string;
}): PayslipInput {
  const { emp, calc } = args;
  const r = calc.result;
  return {
    client: { name: args.client.legal_name || args.client.name, address: args.client.address },
    periodLabel: periodLabel(args.period),
    employee: [
      ['Employee', emp.name],
      ['Employee code', emp.code],
      ['Designation', emp.designation],
      ['Department', emp.department],
      ['Location', emp.location],
      ['Date of joining', dmy(emp.doj)],
      ['PAN', emp.pan],
      ['UAN', emp.uan],
      ['ESI number', emp.esiNumber],
      ['Bank', emp.bankName],
      ['Account', emp.bankAccount ? `XXXX${emp.bankAccount}` : ''],
      ['Tax regime', emp.taxRegime === 'old' ? 'Old' : 'New'],
    ],
    days: { base: r.baseDays, paid: r.paidDays, lop: r.lopDays },
    earnings: earningRows(calc),
    deductions: deductionRows(calc),
    totalEarnings: r.totalEarnings,
    totalDeductions: r.totalDeductions,
    netPay: r.netPay,
    note: args.note,
  };
}
