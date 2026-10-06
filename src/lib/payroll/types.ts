// Shapes used by the payroll engine. The engine is pure: it takes numbers in
// and returns numbers out, so every case can be tested without a database.

export type Period = string; // 'YYYY-MM'

export const COMPONENT_KEYS = ['basic', 'da', 'hra', 'conveyance', 'medical', 'special', 'lta', 'other'] as const;
export type ComponentKey = (typeof COMPONENT_KEYS)[number];
export type Components = Record<ComponentKey, number>;

export const COMPONENT_LABELS: Record<ComponentKey, string> = {
  basic: 'Basic',
  da: 'Dearness Allowance',
  hra: 'House Rent Allowance',
  conveyance: 'Conveyance Allowance',
  medical: 'Medical Allowance',
  special: 'Special Allowance',
  lta: 'Leave Travel Allowance',
  other: 'Other Allowance',
};

export interface PfRule {
  wageCeiling: number;
  employeeRate: number; // percent
  epsRate: number;
  edliRate: number;
  adminRate: number;
  adminMin: number; // per establishment per month, applied on the run total
}

export interface EsiRule {
  wageLimit: number;
  wageLimitPwd: number;
  employeeRate: number;
  employerRate: number;
  dailyWageExempt: number;
}

export interface PtSlab {
  upTo: number | null; // inclusive upper limit of monthly gross; null = no limit
  amount: number;
  feb?: number; // amount in February, when different
}

export interface PtRule {
  none?: boolean;
  slabs?: PtSlab[];
  female?: PtSlab[];
}

export interface TaxSlab {
  upTo: number | null;
  rate: number; // percent
}

export interface TaxRule {
  standardDeduction: number;
  slabs: TaxSlab[];
  rebate: { incomeLimit: number; max: number; marginalRelief: boolean };
  surcharge: { above: number; rate: number }[];
  cess: number; // percent
  ptDeductible: boolean;
}

export interface RuleSet {
  pf: PfRule;
  esi: EsiRule;
  pt: PtRule | null; // null = no rule on file for this state
  tax: TaxRule;
}

export type DayBasis = 'calendar' | 'fixed26' | 'fixed30';
export type PfWageRule = 'basic_da' | 'fifty_percent';

export interface PayrollEmployee {
  gender: 'M' | 'F' | 'O';
  workState: string;
  doj: string; // 'YYYY-MM-DD'
  exitDate: string | null;
  pfApplicable: boolean;
  pfRestrict: boolean;
  epsApplicable: boolean;
  esiApplicable: boolean;
  pwd: boolean;
  ptApplicable: boolean;
  taxRegime: 'new' | 'old';
  oldRegimeDeductions: number;
  tdsOverrideMonthly: number | null;
}

export interface Adjustment {
  kind: 'earning' | 'deduction';
  label: string;
  amount: number;
  taxable: boolean;
}

export interface YearToDate {
  taxablePaid: number; // taxable salary already paid this financial year, before this month
  tdsPaid: number;
  ptPaid: number;
}

export interface PayrollInput {
  period: Period;
  dayBasis: DayBasis;
  pfWageRule: PfWageRule;
  employee: PayrollEmployee;
  structure: Components;
  lopDays: number;
  adjustments: Adjustment[];
  ytd: YearToDate;
  rules: RuleSet;
}

export interface TdsWorking {
  method: 'computed' | 'override' | 'none';
  monthsRemainingAfter: number;
  annualGross: number;
  standardDeduction: number;
  otherDeductions: number;
  taxableIncome: number;
  taxOnSlabs: number;
  rebate: number;
  marginalRelief: number;
  surcharge: number;
  cess: number;
  annualTax: number;
  alreadyDeducted: number;
}

export interface PayrollResult {
  baseDays: number;
  employedDays: number;
  paidDays: number;
  lopDays: number;
  full: Components;
  earned: Components;
  grossFull: number;
  grossEarned: number;
  adjustmentEarnings: number;
  adjustmentDeductions: number;
  totalEarnings: number; // grossEarned + adjustment earnings
  taxableEarned: number;
  pf: {
    applicable: boolean;
    wageBasicDa: number;
    wageFiftyPercent: number;
    wageUsed: number; // before the ceiling
    ceiling: number;
    pfWage: number; // wage on which 12% is computed
    epsWage: number;
    employee: number;
    employerEpf: number;
    eps: number;
    edli: number;
    admin: number; // before the establishment minimum
    employeeIfBasicDa: number; // what the employee share would be under each rule
    employeeIfFiftyPercent: number;
  };
  esi: { applicable: boolean; wage: number; employee: number; employer: number };
  pt: number;
  tds: number;
  tdsWorking: TdsWorking;
  totalDeductions: number;
  netPay: number;
  employerCost: number;
  warnings: string[];
}
