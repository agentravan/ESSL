// Hand-worked payroll cases. Every expected figure below was calculated by
// hand from the rule values in RULES, not copied from the engine's output.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePayroll, employedDaysIn, professionalTax } from '../src/lib/payroll/calc';
import { computeAnnualTax } from '../src/lib/payroll/tax';
import { daysInMonth, financialYear, fyMonthIndex, addMonths, fyStart } from '../src/lib/payroll/period';
import type { Components, PayrollEmployee, PayrollInput, PfRule, PtRule, RuleSet, TaxRule } from '../src/lib/payroll/types';

const PF_15K: PfRule = { wageCeiling: 15000, employeeRate: 12, epsRate: 8.33, edliRate: 0.5, adminRate: 0.5, adminMin: 500 };
const PF_SEP26: PfRule = { ...PF_15K, wageCeiling: 19667 };
const PF_25K: PfRule = { ...PF_15K, wageCeiling: 25000 };

const TAX_NEW: TaxRule = {
  standardDeduction: 75000,
  slabs: [
    { upTo: 400000, rate: 0 },
    { upTo: 800000, rate: 5 },
    { upTo: 1200000, rate: 10 },
    { upTo: 1600000, rate: 15 },
    { upTo: 2000000, rate: 20 },
    { upTo: 2400000, rate: 25 },
    { upTo: null, rate: 30 },
  ],
  rebate: { incomeLimit: 1200000, max: 60000, marginalRelief: true },
  surcharge: [
    { above: 5000000, rate: 10 },
    { above: 10000000, rate: 15 },
    { above: 20000000, rate: 25 },
  ],
  cess: 4,
  ptDeductible: false,
};

const TAX_OLD: TaxRule = {
  standardDeduction: 50000,
  slabs: [
    { upTo: 250000, rate: 0 },
    { upTo: 500000, rate: 5 },
    { upTo: 1000000, rate: 20 },
    { upTo: null, rate: 30 },
  ],
  rebate: { incomeLimit: 500000, max: 12500, marginalRelief: false },
  surcharge: [{ above: 5000000, rate: 10 }],
  cess: 4,
  ptDeductible: true,
};

const PT_NONE: PtRule = { none: true };
const PT_MH: PtRule = {
  slabs: [
    { upTo: 7500, amount: 0 },
    { upTo: 10000, amount: 175 },
    { upTo: null, amount: 200, feb: 300 },
  ],
  female: [
    { upTo: 25000, amount: 0 },
    { upTo: null, amount: 200, feb: 300 },
  ],
};
const PT_KA: PtRule = { slabs: [{ upTo: 24999, amount: 0 }, { upTo: null, amount: 200, feb: 300 }] };

function rules(pf: PfRule, pt: PtRule | null = PT_NONE, tax: TaxRule = TAX_NEW): RuleSet {
  return {
    pf,
    esi: { wageLimit: 21000, wageLimitPwd: 25000, employeeRate: 0.75, employerRate: 3.25, dailyWageExempt: 176 },
    pt,
    tax,
  };
}

function comp(c: Partial<Components>): Components {
  return { basic: 0, da: 0, hra: 0, conveyance: 0, medical: 0, special: 0, lta: 0, other: 0, ...c };
}

function emp(e: Partial<PayrollEmployee> = {}): PayrollEmployee {
  return {
    gender: 'M',
    workState: 'HR',
    doj: '2020-01-01',
    exitDate: null,
    pfApplicable: true,
    pfRestrict: true,
    epsApplicable: true,
    esiApplicable: false,
    pwd: false,
    ptApplicable: true,
    taxRegime: 'new',
    oldRegimeDeductions: 0,
    tdsOverrideMonthly: null,
    ...e,
  };
}

function input(p: Partial<PayrollInput> & Pick<PayrollInput, 'period' | 'structure' | 'rules'>): PayrollInput {
  return {
    dayBasis: 'calendar',
    pfWageRule: 'basic_da',
    employee: emp(),
    lopDays: 0,
    adjustments: [],
    ytd: { taxablePaid: 0, tdsPaid: 0, ptPaid: 0 },
    ...p,
  };
}

// ------------------------------------------------------------------ periods
test('period arithmetic', () => {
  assert.equal(daysInMonth('2026-02'), 28);
  assert.equal(daysInMonth('2028-02'), 29);
  assert.equal(daysInMonth('2026-09'), 30);
  assert.equal(daysInMonth('2026-10'), 31);
  assert.equal(financialYear('2026-03'), '2025-26');
  assert.equal(financialYear('2026-04'), '2026-27');
  assert.equal(financialYear('2027-03'), '2026-27');
  assert.equal(fyMonthIndex('2026-04'), 0);
  assert.equal(fyMonthIndex('2026-10'), 6);
  assert.equal(fyMonthIndex('2027-03'), 11);
  assert.equal(addMonths('2026-12', 1), '2027-01');
  assert.equal(addMonths('2026-01', -1), '2025-12');
  assert.equal(fyStart('2027-02'), '2026-04');
});

test('days on the rolls', () => {
  assert.equal(employedDaysIn('2026-10', '2020-01-01', null), 31);
  assert.equal(employedDaysIn('2026-10', '2026-10-16', null), 16);
  assert.equal(employedDaysIn('2026-10', '2020-01-01', '2026-10-10'), 10);
  assert.equal(employedDaysIn('2026-10', '2026-11-01', null), 0);
  assert.equal(employedDaysIn('2026-10', '2020-01-01', '2026-09-30'), 0);
  assert.equal(employedDaysIn('2026-10', '2026-10-05', '2026-10-20'), 16);
});

// ------------------------------------------------------------------ straightforward month
test('Haryana employee, Rs 40,000 gross, October 2026', () => {
  const r = computePayroll(
    input({
      period: '2026-10',
      structure: comp({ basic: 20000, hra: 10000, special: 10000 }),
      employee: emp({ doj: '2026-10-01' }),
      rules: rules(PF_25K),
    }),
  );
  assert.equal(r.paidDays, 31);
  assert.equal(r.grossEarned, 40000);
  assert.equal(r.pf.pfWage, 20000);
  assert.equal(r.pf.employee, 2400); // 12% of 20,000
  assert.equal(r.pf.eps, 1666); // 8.33% of 20,000 = 1,666
  assert.equal(r.pf.employerEpf, 734); // 2,400 - 1,666
  assert.equal(r.pf.edli, 100);
  assert.equal(r.pf.admin, 100);
  assert.equal(r.esi.employee, 0);
  assert.equal(r.pt, 0);
  assert.equal(r.tds, 0); // 40,000 x 6 months = 2.4 lakh for the year
  assert.equal(r.netPay, 37600);
  assert.equal(r.employerCost, 40000 + 2400 + 100 + 100);
});

// ------------------------------------------------------------------ PF ceiling before and after 17 Sep 2026
test('PF ceiling: Rs 15,000 in August 2026, Rs 25,000 in October 2026', () => {
  const structure = comp({ basic: 30000, hra: 15000 });
  const aug = computePayroll(input({ period: '2026-08', structure, rules: rules(PF_15K) }));
  assert.equal(aug.pf.pfWage, 15000);
  assert.equal(aug.pf.employee, 1800);
  assert.equal(aug.pf.eps, 1250); // 8.33% of 15,000 = 1,249.5
  assert.equal(aug.pf.employerEpf, 550);
  assert.equal(aug.pf.edli, 75);
  assert.equal(aug.pf.admin, 75);

  const oct = computePayroll(input({ period: '2026-10', structure, rules: rules(PF_25K) }));
  assert.equal(oct.pf.pfWage, 25000);
  assert.equal(oct.pf.employee, 3000);
  assert.equal(oct.pf.eps, 2083); // 8.33% of 25,000 = 2,082.5
  assert.equal(oct.pf.employerEpf, 917);
  assert.equal(oct.pf.edli, 125);
  assert.equal(oct.pf.admin, 125);
});

test('PF on full wages when not restricted to the ceiling', () => {
  const r = computePayroll(
    input({
      period: '2026-10',
      structure: comp({ basic: 30000, hra: 15000 }),
      employee: emp({ pfRestrict: false }),
      rules: rules(PF_25K),
    }),
  );
  assert.equal(r.pf.pfWage, 30000);
  assert.equal(r.pf.employee, 3600);
  assert.equal(r.pf.eps, 2083); // pension stays on the ceiling
  assert.equal(r.pf.employerEpf, 1517);
  assert.equal(r.pf.edli, 125);
  assert.equal(r.pf.admin, 150);
});

test('PF switched off within the ceiling raises a warning', () => {
  const r = computePayroll(
    input({
      period: '2026-10',
      structure: comp({ basic: 18000, hra: 9000 }),
      employee: emp({ pfApplicable: false }),
      rules: rules(PF_25K),
    }),
  );
  assert.equal(r.pf.employee, 0);
  assert.equal(r.pf.eps, 0);
  assert.ok(r.warnings.some((w) => w.includes('PF is switched off')));
});

// ------------------------------------------------------------------ loss of pay and ESI
test('two loss-of-pay days in September 2026 with ESI', () => {
  const r = computePayroll(
    input({
      period: '2026-09',
      structure: comp({ basic: 15000, hra: 6000 }),
      employee: emp({ esiApplicable: true }),
      lopDays: 2,
      rules: rules(PF_SEP26),
    }),
  );
  assert.equal(r.paidDays, 28);
  assert.equal(r.earned.basic, 14000); // 15,000 x 28 / 30
  assert.equal(r.earned.hra, 5600);
  assert.equal(r.grossEarned, 19600);
  assert.equal(r.pf.employee, 1680); // 12% of 14,000
  assert.equal(r.pf.eps, 1166); // 8.33% of 14,000 = 1,166.2
  assert.equal(r.pf.employerEpf, 514);
  assert.equal(r.esi.wage, 19600);
  assert.equal(r.esi.employee, 147); // 0.75% of 19,600
  assert.equal(r.esi.employer, 637); // 3.25% of 19,600
  assert.equal(r.netPay, 19600 - 1680 - 147);
});

test('ESI rounds up to the next rupee', () => {
  const r = computePayroll(
    input({
      period: '2026-10',
      structure: comp({ basic: 10000, hra: 5555 }),
      employee: emp({ esiApplicable: true }),
      rules: rules(PF_25K),
    }),
  );
  assert.equal(r.esi.employee, 117); // 116.6625
  assert.equal(r.esi.employer, 506); // 505.5375
});

test('ESI employee share is nil at Rs 176 a day or less', () => {
  const r = computePayroll(
    input({
      period: '2026-10',
      dayBasis: 'calendar',
      structure: comp({ basic: 5456 }), // 31 days x 176
      employee: emp({ esiApplicable: true, pfApplicable: false }),
      rules: rules(PF_25K),
    }),
  );
  assert.equal(r.esi.employee, 0);
  assert.equal(r.esi.employer, 178); // 3.25% of 5,456 = 177.32
});

test('ESI warnings when the flag and the wage disagree', () => {
  const on = computePayroll(
    input({
      period: '2026-10',
      structure: comp({ basic: 15000, hra: 10000 }),
      employee: emp({ esiApplicable: true }),
      rules: rules(PF_25K),
    }),
  );
  assert.ok(on.warnings.some((w) => w.includes('ESI is switched on')));
  assert.equal(on.esi.employee, 188); // still deducted: 0.75% of 25,000 = 187.5

  const off = computePayroll(
    input({ period: '2026-10', structure: comp({ basic: 12000, hra: 6000 }), rules: rules(PF_25K) }),
  );
  assert.ok(off.warnings.some((w) => w.includes('ESI is switched off')));
});

// ------------------------------------------------------------------ 50% wage rule
test('50% wage rule changes the PF wage and both figures are reported', () => {
  const structure = comp({ basic: 12000, hra: 8000, special: 20000 });
  const basicDa = computePayroll(input({ period: '2026-10', structure, rules: rules(PF_25K) }));
  assert.equal(basicDa.pf.wageBasicDa, 12000);
  assert.equal(basicDa.pf.wageFiftyPercent, 20000);
  assert.equal(basicDa.pf.employee, 1440);
  assert.equal(basicDa.pf.employeeIfFiftyPercent, 2400);
  assert.ok(basicDa.warnings.some((w) => w.includes('50% wage rule')));

  const fifty = computePayroll(
    input({ period: '2026-10', structure, pfWageRule: 'fifty_percent', rules: rules(PF_25K) }),
  );
  assert.equal(fifty.pf.employee, 2400);
  assert.equal(fifty.pf.employeeIfBasicDa, 1440);
  assert.equal(fifty.pf.eps, 1666);
});

test('50% wage rule makes no difference when basic is already half of gross', () => {
  const r = computePayroll(
    input({ period: '2026-10', structure: comp({ basic: 20000, hra: 10000, special: 10000 }), rules: rules(PF_25K) }),
  );
  assert.equal(r.pf.wageBasicDa, r.pf.wageFiftyPercent);
  assert.ok(!r.warnings.some((w) => w.includes('50% wage rule')));
});

// ------------------------------------------------------------------ professional tax
test('professional tax slabs', () => {
  assert.equal(professionalTax(PT_MH, 40000, 'M', 2), 300);
  assert.equal(professionalTax(PT_MH, 40000, 'M', 3), 200);
  assert.equal(professionalTax(PT_MH, 9000, 'M', 5), 175);
  assert.equal(professionalTax(PT_MH, 7500, 'M', 5), 0);
  assert.equal(professionalTax(PT_MH, 25000, 'F', 5), 0);
  assert.equal(professionalTax(PT_MH, 26000, 'F', 5), 200);
  assert.equal(professionalTax(PT_MH, 26000, 'F', 2), 300);
  assert.equal(professionalTax(PT_KA, 24999, 'M', 5), 0);
  assert.equal(professionalTax(PT_KA, 25000, 'M', 5), 200);
  assert.equal(professionalTax(PT_NONE, 90000, 'M', 5), 0);
  assert.equal(professionalTax(null, 90000, 'M', 5), 0);
});

test('missing professional tax rule is reported, not guessed', () => {
  const r = computePayroll(
    input({
      period: '2026-10',
      structure: comp({ basic: 20000, hra: 10000 }),
      employee: emp({ workState: 'TN' }),
      rules: rules(PF_25K, null),
    }),
  );
  assert.equal(r.pt, 0);
  assert.ok(r.warnings.some((w) => w.includes('No professional tax rule')));
});

// ------------------------------------------------------------------ income tax
test('annual tax, new regime', () => {
  // 17,25,000: 20,000 + 40,000 + 60,000 + 20% of 1,25,000 = 1,45,000; cess 5,800
  assert.deepEqual(computeAnnualTax(1725000, TAX_NEW), {
    taxOnSlabs: 145000,
    rebate: 0,
    marginalRelief: 0,
    surcharge: 0,
    cess: 5800,
    total: 150800,
  });
  // exactly 12,00,000: tax 60,000, fully rebated
  assert.equal(computeAnnualTax(1200000, TAX_NEW).total, 0);
  assert.equal(computeAnnualTax(1200000, TAX_NEW).rebate, 60000);
  // 12,10,000: slab tax 61,500, limited to the 10,000 earned above 12 lakh; cess 400
  const mr = computeAnnualTax(1210000, TAX_NEW);
  assert.equal(mr.taxOnSlabs, 61500);
  assert.equal(mr.marginalRelief, 51500);
  assert.equal(mr.total, 10400);
  // 13,00,000: slab tax 75,000, below the 1,00,000 cap, so no relief; cess 3,000
  assert.equal(computeAnnualTax(1300000, TAX_NEW).total, 78000);
  assert.equal(computeAnnualTax(400000, TAX_NEW).total, 0);
  assert.equal(computeAnnualTax(0, TAX_NEW).total, 0);
});

test('annual tax, old regime', () => {
  assert.equal(computeAnnualTax(500000, TAX_OLD).total, 0); // 12,500 rebated
  // 10,00,000: 12,500 + 1,00,000 = 1,12,500; cess 4,500
  assert.equal(computeAnnualTax(1000000, TAX_OLD).total, 117000);
  // 5,00,010: no rebate and no marginal relief: 12,500 + 20% of 10 = 12,502; cess 500.08
  assert.equal(computeAnnualTax(500010, TAX_OLD).total, 13002);
});

test('surcharge above Rs 50 lakh', () => {
  // 60,00,000 new regime: 20k + 40k + 60k + 80k + 100k + 30% of 36,00,000 = 13,80,000
  // surcharge 10% = 1,38,000; cess 4% of 15,18,000 = 60,720
  const t = computeAnnualTax(6000000, TAX_NEW);
  assert.equal(t.taxOnSlabs, 1380000);
  assert.equal(t.surcharge, 138000);
  assert.equal(t.cess, 60720);
  assert.equal(t.total, 1578720);
});

test('TDS spread over the year, April 2026', () => {
  const r = computePayroll(
    input({
      period: '2026-04',
      structure: comp({ basic: 75000, hra: 37500, special: 37500 }),
      employee: emp({ pfApplicable: false }),
      rules: rules(PF_15K),
    }),
  );
  assert.equal(r.tdsWorking.annualGross, 1800000);
  assert.equal(r.tdsWorking.taxableIncome, 1725000);
  assert.equal(r.tdsWorking.annualTax, 150800);
  assert.equal(r.tds, 12567); // 1,50,800 / 12 = 12,566.67
  assert.equal(r.netPay, 150000 - 12567);
});

test('TDS catches up using what was already paid and deducted', () => {
  const r = computePayroll(
    input({
      period: '2026-10',
      structure: comp({ basic: 75000, hra: 37500, special: 37500 }),
      employee: emp({ pfApplicable: false }),
      ytd: { taxablePaid: 900000, tdsPaid: 60000, ptPaid: 0 },
      rules: rules(PF_25K),
    }),
  );
  assert.equal(r.tdsWorking.annualGross, 1800000);
  assert.equal(r.tds, 15133); // (1,50,800 - 60,000) / 6 = 15,133.33
});

test('no TDS up to Rs 12.75 lakh a year in the new regime', () => {
  const r = computePayroll(
    input({
      period: '2026-04',
      structure: comp({ basic: 53125, hra: 53125 }), // 1,06,250 x 12 = 12,75,000
      employee: emp({ pfApplicable: false }),
      rules: rules(PF_15K),
    }),
  );
  assert.equal(r.tdsWorking.taxableIncome, 1200000);
  assert.equal(r.tds, 0);
});

test('old regime: declared deductions and professional tax reduce taxable income', () => {
  const r = computePayroll(
    input({
      period: '2026-04',
      structure: comp({ basic: 50000, hra: 25000, special: 25000 }), // 12,00,000 a year
      employee: emp({ pfApplicable: false, taxRegime: 'old', oldRegimeDeductions: 150000, workState: 'MH' }),
      rules: rules(PF_15K, PT_MH, TAX_OLD),
    }),
  );
  assert.equal(r.pt, 200);
  // PT for the year as projected: 200 this month + 200 x 11 = 2,400
  assert.equal(r.tdsWorking.otherDeductions, 152400);
  // 12,00,000 - 50,000 - 1,52,400 = 9,97,600
  assert.equal(r.tdsWorking.taxableIncome, 997600);
  // 12,500 + 20% of 4,97,600 = 1,12,020; cess 4,480.8 -> total 1,16,501 (rounded)
  assert.equal(r.tdsWorking.annualTax, 116501);
  assert.equal(r.tds, 9708); // 1,16,501 / 12 = 9,708.4
  assert.equal(r.netPay, 100000 - 200 - 9708);
});

test('TDS override is used as given', () => {
  const r = computePayroll(
    input({
      period: '2026-04',
      structure: comp({ basic: 75000, hra: 75000 }),
      employee: emp({ pfApplicable: false, tdsOverrideMonthly: 5000 }),
      rules: rules(PF_15K),
    }),
  );
  assert.equal(r.tds, 5000);
  assert.equal(r.tdsWorking.method, 'override');
});

test('TDS stops projecting after the exit month', () => {
  const r = computePayroll(
    input({
      period: '2026-04',
      structure: comp({ basic: 75000, hra: 75000 }),
      employee: emp({ pfApplicable: false, exitDate: '2026-06-30' }),
      rules: rules(PF_15K),
    }),
  );
  assert.equal(r.tdsWorking.monthsRemainingAfter, 2);
  assert.equal(r.tdsWorking.annualGross, 450000);
  assert.equal(r.tds, 0);
});

// ------------------------------------------------------------------ joiners, leavers, day bases
test('joined on the 16th of a 31-day month', () => {
  const r = computePayroll(
    input({
      period: '2026-10',
      structure: comp({ basic: 31000 }),
      employee: emp({ doj: '2026-10-16', pfApplicable: false }),
      rules: rules(PF_25K),
    }),
  );
  assert.equal(r.employedDays, 16);
  assert.equal(r.paidDays, 16);
  assert.equal(r.earned.basic, 16000);
});

test('not yet joined: nothing is paid', () => {
  const r = computePayroll(
    input({
      period: '2026-10',
      structure: comp({ basic: 31000 }),
      employee: emp({ doj: '2026-11-03' }),
      rules: rules(PF_25K),
    }),
  );
  assert.equal(r.paidDays, 0);
  assert.equal(r.grossEarned, 0);
  assert.equal(r.netPay, 0);
  assert.equal(r.pf.employee, 0);
});

test('fixed 30-day basis pays a full month in February', () => {
  const r = computePayroll(
    input({
      period: '2027-02',
      dayBasis: 'fixed30',
      structure: comp({ basic: 30000 }),
      rules: rules(PF_25K),
    }),
  );
  assert.equal(r.baseDays, 30);
  assert.equal(r.paidDays, 30);
  assert.equal(r.earned.basic, 30000);
});

test('fixed 26-day basis with one loss-of-pay day', () => {
  const r = computePayroll(
    input({
      period: '2026-10',
      dayBasis: 'fixed26',
      structure: comp({ basic: 26000 }),
      lopDays: 1,
      rules: rules(PF_25K),
    }),
  );
  assert.equal(r.paidDays, 25);
  assert.equal(r.earned.basic, 25000);
});

test('more loss-of-pay days than days in the month', () => {
  const r = computePayroll(
    input({ period: '2026-09', structure: comp({ basic: 30000 }), lopDays: 31, rules: rules(PF_SEP26) }),
  );
  assert.equal(r.paidDays, 0);
  assert.equal(r.netPay, 0);
  assert.ok(r.warnings.some((w) => w.includes('Loss-of-pay')));
});

// ------------------------------------------------------------------ one-off adjustments
test('adjustments: incentive is paid and taxed, advance is recovered', () => {
  const r = computePayroll(
    input({
      period: '2026-10',
      structure: comp({ basic: 20000, hra: 10000, special: 10000 }),
      adjustments: [
        { kind: 'earning', label: 'Incentive', amount: 5000, taxable: true },
        { kind: 'deduction', label: 'Advance recovery', amount: 3000, taxable: false },
      ],
      rules: rules(PF_25K),
    }),
  );
  assert.equal(r.totalEarnings, 45000);
  assert.equal(r.taxableEarned, 45000);
  assert.equal(r.pf.employee, 2400); // incentive is not PF wage
  assert.equal(r.totalDeductions, 2400 + 3000);
  assert.equal(r.netPay, 45000 - 5400);
});

test('components always add up to gross and net', () => {
  for (const lop of [0, 0.5, 1, 3.5, 7, 12]) {
    const r = computePayroll(
      input({
        period: '2026-10',
        structure: comp({ basic: 17333, da: 1111, hra: 8667, conveyance: 1600, medical: 1250, special: 7777, lta: 999, other: 3 }),
        employee: emp({ esiApplicable: false }),
        lopDays: lop,
        rules: rules(PF_25K),
      }),
    );
    const sum = Object.values(r.earned).reduce((a, b) => a + b, 0);
    assert.equal(sum, r.grossEarned);
    assert.equal(r.netPay, r.totalEarnings - r.totalDeductions);
    assert.ok(Number.isInteger(r.netPay));
  }
});
