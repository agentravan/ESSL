import { inr } from '@/lib/format';
import type { RuleKind } from '@/lib/payroll/rules';
import type { EsiRule, PfRule, PtRule, PtSlab, TaxRule } from '@/lib/payroll/types';

function ptSlabs(slabs: PtSlab[]): string {
  let from = 0;
  return slabs
    .map((s) => {
      const range = s.upTo === null ? `above ${inr(from)}` : `up to ${inr(s.upTo)}`;
      if (s.upTo !== null) from = s.upTo;
      return `${range}: ${s.amount === 0 ? 'nil' : inr(s.amount)}${s.feb !== undefined ? ` (${inr(s.feb)} in Feb)` : ''}`;
    })
    .join('; ');
}

/** A one-paragraph, plain-words reading of a rule's values. */
export function RuleSummary({ kind, data }: { kind: RuleKind; data: unknown }) {
  try {
    if (kind === 'pf') {
      const d = data as PfRule;
      return <>Wage ceiling Rs {inr(d.wageCeiling)}. Employee {d.employeeRate}%, pension {d.epsRate}%, EDLI {d.edliRate}%, admin charge {d.adminRate}% (minimum Rs {inr(d.adminMin)} a month).</>;
    }
    if (kind === 'esi') {
      const d = data as EsiRule;
      return <>Wage limit Rs {inr(d.wageLimit)} (Rs {inr(d.wageLimitPwd)} for persons with disability). Employee {d.employeeRate}%, employer {d.employerRate}%. No employee share at Rs {inr(d.dailyWageExempt)} a day or less.</>;
    }
    if (kind === 'pt') {
      const d = data as PtRule;
      if (d.none) return <>No professional tax.</>;
      return <>Monthly gross {ptSlabs(d.slabs ?? [])}.{d.female ? ` Women: ${ptSlabs(d.female)}.` : ''}</>;
    }
    const d = data as TaxRule;
    let from = 0;
    const slabs = d.slabs
      .map((s) => {
        const text = s.upTo === null ? `above ${inr(from)}: ${s.rate}%` : `up to ${inr(s.upTo)}: ${s.rate === 0 ? 'nil' : `${s.rate}%`}`;
        if (s.upTo !== null) from = s.upTo;
        return text;
      })
      .join('; ');
    return (
      <>
        Standard deduction Rs {inr(d.standardDeduction)}. Slabs {slabs}. Rebate up to Rs {inr(d.rebate.max)} for income up to Rs {inr(d.rebate.incomeLimit)}
        {d.rebate.marginalRelief ? ', with marginal relief' : ''}. Cess {d.cess}%.
      </>
    );
  } catch {
    return <>These values could not be read. Open the rule to correct them.</>;
  }
}
