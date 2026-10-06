// One employee, one month. Pure function: same input, same output.
//
// Rounding used here:
//   - each earned component: nearest rupee
//   - PF, EPS, EDLI, admin charge: nearest rupee (EPFO ECR practice)
//   - ESI: next higher rupee (ESIC practice)
//   - TDS: nearest rupee
// All of these are stated on the payroll screen so they can be checked.

import { computeAnnualTax } from './tax';
import { daysInMonth, fyMonthIndex, firstDay, lastDay, parsePeriod, periodOf } from './period';
import {
  COMPONENT_KEYS,
  type Components,
  type PayrollInput,
  type PayrollResult,
  type PtRule,
  type PtSlab,
  type TdsWorking,
} from './types';

export function roundRupee(x: number): number {
  return Math.round(x + 1e-9);
}

function ceilRupee(x: number): number {
  return Math.ceil(x - 1e-9);
}

function pct(amount: number, rate: number): number {
  return (amount * rate) / 100;
}

export function sumComponents(c: Components): number {
  return COMPONENT_KEYS.reduce((s, k) => s + (c[k] || 0), 0);
}

/** Calendar days of the month on which the person was on the rolls. */
export function employedDaysIn(period: string, doj: string, exitDate: string | null): number {
  const dim = daysInMonth(period);
  const start = firstDay(period);
  const end = lastDay(period);
  if (doj > end) return 0;
  if (exitDate && exitDate < start) return 0;
  const from = doj > start ? Number(doj.slice(8, 10)) : 1;
  const to = exitDate && exitDate < end ? Number(exitDate.slice(8, 10)) : dim;
  return Math.max(0, to - from + 1);
}

export function professionalTax(
  rule: PtRule | null,
  monthlyGross: number,
  gender: 'M' | 'F' | 'O',
  month: number,
): number {
  if (!rule || rule.none || monthlyGross <= 0) return 0;
  const slabs: PtSlab[] | undefined = gender === 'F' && rule.female ? rule.female : rule.slabs;
  if (!slabs) return 0;
  for (const slab of slabs) {
    if (slab.upTo === null || monthlyGross <= slab.upTo) {
      return month === 2 && slab.feb !== undefined ? slab.feb : slab.amount;
    }
  }
  return 0;
}

export function computePayroll(input: PayrollInput): PayrollResult {
  const { period, employee: emp, structure, rules } = input;
  const warnings: string[] = [];
  const dim = daysInMonth(period);
  const { month } = parsePeriod(period);

  // ---- days
  const employedDays = employedDaysIn(period, emp.doj, emp.exitDate);
  const lopDays = Math.max(0, input.lopDays);
  let baseDays: number;
  let paidDays: number;
  if (input.dayBasis === 'calendar') {
    baseDays = dim;
    paidDays = employedDays - lopDays;
  } else {
    baseDays = input.dayBasis === 'fixed26' ? 26 : 30;
    paidDays = employedDays === 0 ? 0 : baseDays - (dim - employedDays) - lopDays;
    if (employedDays > 0 && employedDays < dim) {
      warnings.push(`Joined or left during the month on a fixed ${baseDays}-day basis: check the paid days.`);
    }
  }
  if (paidDays < 0) {
    warnings.push('Loss-of-pay days are more than the days available; paid days set to 0.');
    paidDays = 0;
  }
  paidDays = Math.min(paidDays, baseDays);

  // ---- earnings
  const full = {} as Components;
  const earned = {} as Components;
  for (const k of COMPONENT_KEYS) {
    full[k] = Number(structure[k] || 0);
    earned[k] = roundRupee((full[k] * paidDays) / baseDays);
  }
  const grossFull = sumComponents(full);
  const grossEarned = sumComponents(earned);
  if (grossFull <= 0) warnings.push('No salary structure amounts are set for this employee.');

  let adjustmentEarnings = 0;
  let adjustmentEarningsTaxable = 0;
  let adjustmentDeductions = 0;
  for (const a of input.adjustments) {
    if (a.kind === 'earning') {
      adjustmentEarnings += a.amount;
      if (a.taxable) adjustmentEarningsTaxable += a.amount;
    } else {
      adjustmentDeductions += a.amount;
    }
  }
  adjustmentEarnings = roundRupee(adjustmentEarnings);
  adjustmentEarningsTaxable = roundRupee(adjustmentEarningsTaxable);
  adjustmentDeductions = roundRupee(adjustmentDeductions);
  const totalEarnings = grossEarned + adjustmentEarnings;
  const taxableEarned = grossEarned + adjustmentEarningsTaxable;

  // ---- provident fund
  const ceiling = rules.pf.wageCeiling;
  const wageBasicDa = earned.basic + earned.da;
  const wageFiftyPercent = Math.max(wageBasicDa, roundRupee(grossEarned * 0.5));
  const wageUsed = input.pfWageRule === 'fifty_percent' ? wageFiftyPercent : wageBasicDa;
  const pfOn = (wage: number) => roundRupee(pct(emp.pfRestrict ? Math.min(wage, ceiling) : wage, rules.pf.employeeRate));

  let pfWage = 0;
  let epsWage = 0;
  let pfEmployee = 0;
  let eps = 0;
  let employerEpf = 0;
  let edli = 0;
  let pfAdmin = 0;
  if (emp.pfApplicable) {
    pfWage = emp.pfRestrict ? Math.min(wageUsed, ceiling) : wageUsed;
    pfEmployee = roundRupee(pct(pfWage, rules.pf.employeeRate));
    epsWage = emp.epsApplicable ? Math.min(wageUsed, ceiling) : 0;
    eps = roundRupee(pct(epsWage, rules.pf.epsRate));
    employerEpf = pfEmployee - eps;
    edli = roundRupee(pct(Math.min(wageUsed, ceiling), rules.pf.edliRate));
    pfAdmin = roundRupee(pct(pfWage, rules.pf.adminRate));
  } else {
    const fullWage =
      input.pfWageRule === 'fifty_percent'
        ? Math.max(full.basic + full.da, roundRupee(grossFull * 0.5))
        : full.basic + full.da;
    if (fullWage > 0 && fullWage <= ceiling) {
      warnings.push(
        `PF is switched off, but the monthly PF wage (Rs ${fullWage}) is within the Rs ${ceiling} ceiling, where PF is compulsory.`,
      );
    }
  }
  if (emp.pfApplicable && wageBasicDa !== wageFiftyPercent) {
    const other = input.pfWageRule === 'fifty_percent' ? 'Basic + DA' : 'the 50% wage rule';
    const otherAmount = input.pfWageRule === 'fifty_percent' ? pfOn(wageBasicDa) : pfOn(wageFiftyPercent);
    if (otherAmount !== pfEmployee) {
      warnings.push(`Employee PF would be Rs ${otherAmount} under ${other} (Rs ${pfEmployee} used).`);
    }
  }

  // ---- ESI
  const esiLimit = emp.pwd ? rules.esi.wageLimitPwd : rules.esi.wageLimit;
  let esiWage = 0;
  let esiEmployee = 0;
  let esiEmployer = 0;
  if (emp.esiApplicable) {
    esiWage = totalEarnings;
    if (esiWage > 0) {
      const dailyWage = paidDays > 0 ? esiWage / paidDays : esiWage;
      esiEmployee = dailyWage <= rules.esi.dailyWageExempt ? 0 : ceilRupee(pct(esiWage, rules.esi.employeeRate));
      esiEmployer = ceilRupee(pct(esiWage, rules.esi.employerRate));
    }
    if (grossFull > esiLimit) {
      warnings.push(
        `ESI is switched on, but monthly gross (Rs ${grossFull}) is above the Rs ${esiLimit} limit. Correct only if the employee is continuing to the end of the contribution period.`,
      );
    }
  } else if (grossFull > 0 && grossFull <= esiLimit) {
    warnings.push(
      `ESI is switched off, but monthly gross (Rs ${grossFull}) is within the Rs ${esiLimit} limit. Check whether the establishment is covered.`,
    );
  }

  // ---- professional tax
  let pt = 0;
  if (emp.ptApplicable) {
    if (!rules.pt) {
      warnings.push(`No professional tax rule on file for state ${emp.workState}; none deducted.`);
    } else {
      pt = professionalTax(rules.pt, totalEarnings, emp.gender, month);
    }
  }

  // ---- income tax (TDS)
  const idx = fyMonthIndex(period);
  let monthsRemainingAfter = 11 - idx;
  if (emp.exitDate) {
    const exitPeriod = periodOf(emp.exitDate);
    if (exitPeriod <= period) {
      monthsRemainingAfter = 0;
    } else {
      const ep = parsePeriod(exitPeriod);
      const cp = parsePeriod(period);
      const gap = ep.year * 12 + ep.month - (cp.year * 12 + cp.month);
      monthsRemainingAfter = Math.min(monthsRemainingAfter, gap);
    }
  }
  const tdsWorking: TdsWorking = {
    method: 'none',
    monthsRemainingAfter,
    annualGross: 0,
    standardDeduction: 0,
    otherDeductions: 0,
    taxableIncome: 0,
    taxOnSlabs: 0,
    rebate: 0,
    marginalRelief: 0,
    surcharge: 0,
    cess: 0,
    annualTax: 0,
    alreadyDeducted: roundRupee(input.ytd.tdsPaid),
  };
  let tds = 0;
  if (taxableEarned > 0) {
    const annualGross = roundRupee(input.ytd.taxablePaid + taxableEarned + grossFull * monthsRemainingAfter);
    const standardDeduction = Math.min(rules.tax.standardDeduction, annualGross);
    let otherDeductions = 0;
    if (emp.taxRegime === 'old') {
      otherDeductions += Math.max(0, emp.oldRegimeDeductions);
    }
    if (rules.tax.ptDeductible) {
      const futurePt = emp.ptApplicable ? professionalTax(rules.pt, grossFull, emp.gender, 1) * monthsRemainingAfter : 0;
      otherDeductions += input.ytd.ptPaid + pt + futurePt;
    }
    otherDeductions = roundRupee(otherDeductions);
    // Total income is rounded to the nearest ten rupees.
    const taxableIncome = Math.round(Math.max(0, annualGross - standardDeduction - otherDeductions) / 10) * 10;
    const t = computeAnnualTax(taxableIncome, rules.tax);
    tdsWorking.annualGross = annualGross;
    tdsWorking.standardDeduction = standardDeduction;
    tdsWorking.otherDeductions = otherDeductions;
    tdsWorking.taxableIncome = taxableIncome;
    tdsWorking.taxOnSlabs = t.taxOnSlabs;
    tdsWorking.rebate = t.rebate;
    tdsWorking.marginalRelief = t.marginalRelief;
    tdsWorking.surcharge = t.surcharge;
    tdsWorking.cess = t.cess;
    tdsWorking.annualTax = t.total;
    if (t.surcharge > 0) {
      warnings.push('Surcharge applies at this income; marginal relief on surcharge is not computed. Check the TDS.');
    }
    if (emp.tdsOverrideMonthly !== null && emp.tdsOverrideMonthly !== undefined) {
      tds = roundRupee(emp.tdsOverrideMonthly);
      tdsWorking.method = 'override';
    } else {
      tds = Math.max(0, roundRupee((t.total - input.ytd.tdsPaid) / (monthsRemainingAfter + 1)));
      tdsWorking.method = 'computed';
    }
    const available = Math.max(0, totalEarnings - pfEmployee - esiEmployee - pt - adjustmentDeductions);
    if (tds > available) {
      warnings.push(`TDS of Rs ${tds} is more than the pay available this month; limited to Rs ${available}.`);
      tds = available;
    }
  }

  const totalDeductions = pfEmployee + esiEmployee + pt + tds + adjustmentDeductions;
  const netPay = totalEarnings - totalDeductions;
  if (netPay < 0) warnings.push('Net pay is negative. Reduce the deductions for this month.');

  return {
    baseDays,
    employedDays,
    paidDays,
    lopDays,
    full,
    earned,
    grossFull,
    grossEarned,
    adjustmentEarnings,
    adjustmentDeductions,
    totalEarnings,
    taxableEarned,
    pf: {
      applicable: emp.pfApplicable,
      wageBasicDa,
      wageFiftyPercent,
      wageUsed,
      ceiling,
      pfWage,
      epsWage,
      employee: pfEmployee,
      employerEpf,
      eps,
      edli,
      admin: pfAdmin,
      employeeIfBasicDa: emp.pfApplicable ? pfOn(wageBasicDa) : 0,
      employeeIfFiftyPercent: emp.pfApplicable ? pfOn(wageFiftyPercent) : 0,
    },
    esi: { applicable: emp.esiApplicable, wage: esiWage, employee: esiEmployee, employer: esiEmployer },
    pt,
    tds,
    tdsWorking,
    totalDeductions,
    netPay,
    employerCost: totalEarnings + pfEmployee + edli + pfAdmin + esiEmployer,
    warnings,
  };
}
