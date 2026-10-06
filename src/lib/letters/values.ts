// Works out the value of every standard placeholder for one employee.

import { inr, longDate, rupeesInWords } from '../format';
import { COMPONENT_KEYS, COMPONENT_LABELS, type Components } from '../payroll/types';

export interface LetterContext {
  letterDate: string;
  refNo: string;
  employee: {
    full_name: string;
    emp_code: string;
    father_name: string;
    gender: 'M' | 'F' | 'O';
    designation: string;
    department: string;
    location: string;
    doj: string;
    exit_date: string | null;
    address: string;
    email: string;
  };
  client: { name: string; legal_name: string; address: string };
  structure: Components | null;
}

export function standardValues(ctx: LetterContext): Record<string, string> {
  const e = ctx.employee;
  const gross = ctx.structure ? COMPONENT_KEYS.reduce((s, k) => s + ctx.structure![k], 0) : 0;
  const v: Record<string, string> = {
    letter_date: longDate(ctx.letterDate),
    ref_no: ctx.refNo,
    employee_name: e.full_name,
    title: e.gender === 'F' ? 'Ms.' : e.gender === 'M' ? 'Mr.' : '',
    employee_code: e.emp_code,
    father_name: e.father_name,
    designation: e.designation,
    department: e.department,
    location: e.location,
    date_of_joining: longDate(e.doj),
    exit_date: longDate(e.exit_date),
    employee_address: e.address,
    employee_email: e.email,
    client_name: ctx.client.name,
    client_legal_name: ctx.client.legal_name || ctx.client.name,
    client_address: ctx.client.address.replace(/\s*\r?\n\s*/g, ', '),
  };
  if (gross > 0 && ctx.structure) {
    v.gross_monthly = inr(gross);
    v.gross_annual = inr(gross * 12);
    v.gross_annual_words = rupeesInWords(gross * 12);
    v.basic_monthly = inr(ctx.structure.basic);
  }
  return v;
}

export function salaryRows(structure: Components | null): { label: string; monthly: number }[] {
  if (!structure) return [];
  return COMPONENT_KEYS.filter((k) => structure[k] > 0).map((k) => ({ label: COMPONENT_LABELS[k], monthly: structure[k] }));
}
