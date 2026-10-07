import type { Components } from './payroll/types';

export interface Employee {
  id: string;
  client_id: string;
  emp_code: string;
  full_name: string;
  father_name: string;
  gender: 'M' | 'F' | 'O';
  dob: string | null;
  doj: string;
  exit_date: string | null;
  designation: string;
  department: string;
  location: string;
  work_state: string;
  email: string;
  phone: string;
  address: string;
  status: 'pre_onboarding' | 'probation' | 'active' | 'on_notice' | 'exited';
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
  aadhaar_last4: string;
  bank_name: string;
  bank_ifsc: string;
  bank_acct_last4: string;
  manager_id: string | null;
}

/** Columns safe to read into a page. Encrypted columns are fetched only when revealing. */
export const EMPLOYEE_COLUMNS = `id, client_id, emp_code, full_name, father_name, gender, dob, doj, exit_date,
  designation, department, location, work_state, email, phone, address, status, pf_applicable, pf_restrict,
  eps_applicable, uan, pf_number, esi_applicable, esi_number, pwd, pt_applicable, tax_regime,
  old_regime_deductions, tds_override_monthly, opening_fy, opening_taxable_ytd, opening_tds_ytd,
  pan_masked, aadhaar_last4, bank_name, bank_ifsc, bank_acct_last4, manager_id`;

export interface SalaryStructure extends Components {
  id: string;
  employee_id: string;
  effective_from: string;
  notes: string;
}

export const STATUS_LABEL: Record<Employee['status'], string> = {
  pre_onboarding: 'Pre-onboarding',
  probation: 'Probation',
  active: 'Active',
  on_notice: 'On notice',
  exited: 'Exited',
};

export const STATUS_TONE: Record<Employee['status'], 'grey' | 'green' | 'amber' | 'red' | 'blue'> = {
  pre_onboarding: 'blue',
  probation: 'amber',
  active: 'green',
  on_notice: 'amber',
  exited: 'grey',
};

export const GENDER_LABEL = { M: 'Male', F: 'Female', O: 'Other' } as const;
