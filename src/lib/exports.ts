// Statutory and bank files built from a payroll month. Pure functions.
//
// The layouts follow the public upload formats (EPFO ECR text file, ESIC
// monthly contribution sheet). Portals change their formats from time to
// time, so each file should be checked against the portal's current sample
// before the first real upload.

import { toCsv } from './csv';
import type { LineEmp } from './payroll/payslip-data';
import type { StoredCalc } from './payroll/run';

export interface ExportLine {
  emp: LineEmp;
  calc: StoredCalc;
}

export interface ExportProblem {
  code: string;
  name: string;
  message: string;
}

const clean = (s: string) => s.replace(/[#~\r\n]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();

/** EPFO Electronic Challan cum Return: one line per member, fields separated by #~# */
export function pfEcr(lines: ExportLine[]): { text: string; problems: ExportProblem[]; members: number } {
  const problems: ExportProblem[] = [];
  const rows: string[] = [];
  for (const { emp, calc } of lines) {
    const r = calc.result;
    if (!r.pf.applicable || r.pf.pfWage <= 0) continue;
    if (!/^\d{12}$/.test(emp.uan)) {
      problems.push({ code: emp.code, name: emp.name, message: 'No valid 12-digit UAN, so this member is left out of the ECR file.' });
      continue;
    }
    rows.push(
      [
        emp.uan,
        clean(emp.name),
        Math.round(r.totalEarnings),
        Math.round(r.pf.pfWage),
        Math.round(r.pf.epsWage),
        Math.round(Math.min(r.pf.wageUsed, r.pf.ceiling)),
        r.pf.employee,
        r.pf.eps,
        r.pf.employerEpf,
        Math.round(r.lopDays),
        0,
      ].join('#~#'),
    );
  }
  return { text: rows.join('\r\n') + (rows.length ? '\r\n' : ''), problems, members: rows.length };
}

/** ESIC monthly contribution sheet. */
export function esiSheet(lines: ExportLine[]): { csv: string; problems: ExportProblem[]; members: number } {
  const problems: ExportProblem[] = [];
  const rows: (string | number)[][] = [
    ['IP Number', 'IP Name', 'No of Days for which wages paid/payable during the month', 'Total Monthly Wages', 'Reason Code for Zero workings days', 'Last Working Day'],
  ];
  for (const { emp, calc } of lines) {
    const r = calc.result;
    if (!r.esi.applicable) continue;
    if (!/^\d{10,17}$/.test(emp.esiNumber)) {
      problems.push({ code: emp.code, name: emp.name, message: 'No ESI (IP) number, so this person is left out of the ESI sheet.' });
      continue;
    }
    const days = Math.ceil(r.paidDays);
    rows.push([emp.esiNumber, clean(emp.name), days, Math.round(r.esi.wage), days === 0 ? 1 : '', '']);
  }
  return { csv: toCsv(rows), problems, members: rows.length - 1 };
}

/** Professional tax deducted, by state. */
export function ptStatement(lines: ExportLine[]): { csv: string; members: number } {
  const rows: (string | number)[][] = [['State', 'Employee code', 'Name', 'Gross for the month', 'Professional tax']];
  const sorted = [...lines].sort((a, b) => a.emp.workState.localeCompare(b.emp.workState) || a.emp.code.localeCompare(b.emp.code));
  let total = 0;
  for (const { emp, calc } of sorted) {
    if (calc.result.pt <= 0) continue;
    rows.push([emp.workState, emp.code, emp.name, calc.result.totalEarnings, calc.result.pt]);
    total += calc.result.pt;
  }
  rows.push(['', '', 'Total', '', total]);
  return { csv: toCsv(rows), members: rows.length - 2 };
}

/** Salary transfer list for the bank. Account numbers are passed in already decrypted. */
export function bankSheet(
  lines: ExportLine[],
  accounts: Map<string, { account: string; ifsc: string; bank: string }>,
  narration: string,
): { csv: string; problems: ExportProblem[]; members: number; total: number } {
  const problems: ExportProblem[] = [];
  const rows: (string | number)[][] = [['Employee code', 'Beneficiary name', 'Account number', 'IFSC', 'Bank', 'Amount', 'Narration']];
  let total = 0;
  for (const { emp, calc } of lines) {
    const net = calc.result.netPay;
    if (net <= 0) continue;
    const a = accounts.get(emp.code);
    if (!a || !a.account || !a.ifsc) {
      problems.push({ code: emp.code, name: emp.name, message: 'Bank account or IFSC is missing, so this person is left out of the bank file.' });
      continue;
    }
    // A leading apostrophe keeps Excel from turning a long account number into 1.23E+15.
    rows.push([emp.code, emp.name, `'${a.account}`, a.ifsc, a.bank, net, narration]);
    total += net;
  }
  return { csv: toCsv(rows), problems, members: rows.length - 1, total };
}
