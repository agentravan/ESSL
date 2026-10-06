// Income tax on an annual taxable income, under whichever rule set is passed in.

import type { TaxRule } from './types';

export interface AnnualTax {
  taxOnSlabs: number;
  rebate: number;
  marginalRelief: number;
  surcharge: number;
  cess: number;
  total: number;
}

function roundRupee(x: number): number {
  return Math.round(x + 1e-9);
}

export function taxOnSlabs(income: number, rule: TaxRule): number {
  let tax = 0;
  let lower = 0;
  for (const slab of rule.slabs) {
    const upper = slab.upTo ?? Infinity;
    if (income > lower) {
      tax += ((Math.min(income, upper) - lower) * slab.rate) / 100;
    }
    lower = upper;
    if (income <= upper) break;
  }
  return tax;
}

export function computeAnnualTax(taxableIncome: number, rule: TaxRule): AnnualTax {
  const income = Math.max(0, taxableIncome);
  const slabTax = taxOnSlabs(income, rule);
  let rebate = 0;
  let marginalRelief = 0;
  let tax = slabTax;

  if (income <= rule.rebate.incomeLimit) {
    rebate = Math.min(tax, rule.rebate.max);
    tax -= rebate;
  } else if (rule.rebate.marginalRelief) {
    // Just above the rebate limit, tax cannot exceed the income earned above the limit.
    const cap = income - rule.rebate.incomeLimit;
    if (tax > cap) {
      marginalRelief = tax - cap;
      tax = cap;
    }
  }

  let surchargeRate = 0;
  for (const s of rule.surcharge) {
    if (income > s.above) surchargeRate = Math.max(surchargeRate, s.rate);
  }
  const surcharge = (tax * surchargeRate) / 100;
  const cess = ((tax + surcharge) * rule.cess) / 100;

  return {
    taxOnSlabs: roundRupee(slabTax),
    rebate: roundRupee(rebate),
    marginalRelief: roundRupee(marginalRelief),
    surcharge: roundRupee(surcharge),
    cess: roundRupee(cess),
    total: roundRupee(tax + surcharge + cess),
  };
}
