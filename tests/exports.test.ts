import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePayroll } from '../src/lib/payroll/calc';
import type { PayrollInput } from '../src/lib/payroll/types';
import { bankSheet, esiSheet, pfEcr, ptStatement, type ExportLine } from '../src/lib/exports';

const rules: PayrollInput['rules'] = {
  pf: { wageCeiling: 25000, employeeRate: 12, epsRate: 8.33, edliRate: 0.5, adminRate: 0.5, adminMin: 500 },
  esi: { wageLimit: 21000, wageLimitPwd: 25000, employeeRate: 0.75, employerRate: 3.25, dailyWageExempt: 176 },
  pt: { slabs: [{ upTo: 24999, amount: 0 }, { upTo: null, amount: 200, feb: 300 }] },
  tax: { standardDeduction: 75000, slabs: [{ upTo: 400000, rate: 0 }, { upTo: null, rate: 5 }], rebate: { incomeLimit: 1200000, max: 60000, marginalRelief: true }, surcharge: [], cess: 4, ptDeductible: false },
};

function line(code: string, name: string, basic: number, o: { uan?: string; esi?: string; esiOn?: boolean; pf?: boolean; lop?: number } = {}): ExportLine {
  const result = computePayroll({
    period: '2026-10', dayBasis: 'calendar', pfWageRule: 'basic_da',
    employee: { gender: 'M', workState: 'KA', doj: '2024-01-01', exitDate: null, pfApplicable: o.pf ?? true, pfRestrict: false, epsApplicable: true, esiApplicable: o.esiOn ?? false, pwd: false, ptApplicable: true, taxRegime: 'new', oldRegimeDeductions: 0, tdsOverrideMonthly: null },
    structure: { basic, da: 0, hra: 0, conveyance: 0, medical: 0, special: 0, lta: 0, other: 0 },
    lopDays: o.lop ?? 0, adjustments: [], ytd: { taxablePaid: 0, tdsPaid: 0, ptPaid: 0 }, rules,
  });
  return {
    emp: { code, name, designation: '', department: '', location: '', doj: '2024-01-01', uan: o.uan ?? '', pfNumber: '', esiNumber: o.esi ?? '', pan: '', bankName: '', bankAccount: '', workState: 'KA', taxRegime: 'new' },
    calc: { result, adjustments: [] },
  };
}

test('PF ECR lines, hand-checked', () => {
  const r = pfEcr([
    line('E1', 'Asha #Verma', 150000, { uan: '100000000001' }),
    line('E2', 'No Uan', 30000),
    line('E3', 'Not In Pf', 90000, { pf: false, uan: '100000000003' }),
  ]);
  // 1,50,000 on full wages: EPF wage 1,50,000, EPS and EDLI wage 25,000; EE 18,000; EPS 2,083; ER 15,917
  assert.equal(r.text, '100000000001#~#ASHA VERMA#~#150000#~#150000#~#25000#~#25000#~#18000#~#2083#~#15917#~#0#~#0\r\n');
  assert.equal(r.members, 1);
  assert.deepEqual(r.problems.map((p) => p.code), ['E2']);
});

test('ESI sheet', () => {
  const r = esiSheet([line('E1', 'Ravi', 15500, { esiOn: true, esi: '5200089935', lop: 1 }), line('E2', 'No Number', 15000, { esiOn: true }), line('E3', 'Not Esi', 50000)]);
  const rows = r.csv.trim().split('\r\n');
  assert.equal(rows.length, 2);
  assert.equal(rows[1], '5200089935,RAVI,30,15000,,'); // 15,500 x 30/31 = 15,000
  assert.deepEqual(r.problems.map((p) => p.code), ['E2']);
});

test('professional tax statement totals', () => {
  const r = ptStatement([line('E1', 'A', 30000), line('E2', 'B', 20000), line('E3', 'C', 90000)]);
  const rows = r.csv.trim().split('\r\n');
  assert.equal(rows.length, 4);
  assert.equal(rows[3], ',,Total,,400');
});

test('bank sheet uses full account numbers and skips people without one', () => {
  const accounts = new Map([['E1', { account: '437001514791', ifsc: 'ICIC0004370', bank: 'ICICI' }]]);
  const r = bankSheet([line('E1', 'A', 30000), line('E2', 'B', 30000)], accounts, 'Salary Oct 2026');
  const rows = r.csv.trim().split('\r\n');
  assert.equal(rows[1], "E1,A,'437001514791,ICIC0004370,ICICI,26200,Salary Oct 2026"); // 30,000 - 3,600 PF - 200 PT
  assert.equal(r.total, 26200);
  assert.deepEqual(r.problems.map((p) => p.code), ['E2']);
});
