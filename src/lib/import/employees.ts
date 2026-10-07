// Checks an uploaded employee sheet line by line. Pure: no database here.

import { COMPONENT_KEYS, type Components } from '../payroll/types';
import { findState } from '../states';
import {
  aadhaarProblem, accountProblem, cleanAadhaar, cleanAccount, cleanIfsc, cleanPan, emailProblem, ifscProblem,
  panProblem, parseAmount, parseDateLoose, uanProblem,
} from '../validate';
import { excelSerialToDate } from './table';

export type Field =
  | 'emp_code' | 'full_name' | 'father_name' | 'gender' | 'dob' | 'doj' | 'designation' | 'department' | 'location'
  | 'work_state' | 'email' | 'phone' | 'uan' | 'pf_number' | 'esi_number' | 'pf_applicable' | 'esi_applicable'
  | 'tax_regime' | 'pan' | 'aadhaar' | 'bank_name' | 'bank_ifsc' | 'bank_account' | 'gross'
  | 'basic' | 'da' | 'hra' | 'conveyance' | 'medical' | 'special' | 'lta' | 'other';

const SYNONYMS: Record<Field, string[]> = {
  emp_code: ['empcode', 'employeecode', 'code', 'empid', 'employeeid', 'empno', 'employeeno', 'ecode', 'staffcode'],
  full_name: ['name', 'employeename', 'fullname', 'empname', 'nameofemployee'],
  father_name: ['fathername', 'fathersname', 'fatherhusbandname', 'fathershusbandname', 'fatherorhusbandname'],
  gender: ['gender', 'sex'],
  dob: ['dob', 'dateofbirth', 'birthdate'],
  doj: ['doj', 'dateofjoining', 'joiningdate', 'dateofjoin', 'joindate'],
  designation: ['designation', 'position', 'jobtitle'],
  department: ['department', 'dept'],
  location: ['location', 'worklocation', 'branch', 'city'],
  work_state: ['state', 'workstate', 'ptstate'],
  email: ['email', 'emailid', 'emailaddress', 'mailid'],
  phone: ['phone', 'mobile', 'mobileno', 'mobilenumber', 'phoneno', 'contactno', 'contactnumber'],
  uan: ['uan', 'uanno', 'uannumber'],
  pf_number: ['pfno', 'pfnumber', 'pfmemberid', 'pfaccountno'],
  esi_number: ['esino', 'esinumber', 'esicno', 'esicnumber', 'ipnumber', 'ipno'],
  pf_applicable: ['pf', 'pfapplicable', 'pfyn', 'pfdeduction'],
  esi_applicable: ['esi', 'esic', 'esiapplicable', 'esicapplicable', 'esiyn'],
  tax_regime: ['taxregime', 'regime'],
  pan: ['pan', 'panno', 'pannumber'],
  aadhaar: ['aadhaar', 'aadhar', 'aadhaarno', 'aadharno', 'aadhaarnumber', 'aadharnumber'],
  bank_name: ['bank', 'bankname'],
  bank_ifsc: ['ifsc', 'ifsccode', 'bankifsc'],
  bank_account: ['accountno', 'accountnumber', 'bankaccount', 'bankaccountno', 'bankaccountnumber', 'acno', 'bankacno'],
  gross: ['gross', 'grosssalary', 'monthlygross', 'totalgross', 'grosspay'],
  basic: ['basic', 'basicsalary', 'basicpay'],
  da: ['da', 'dearnessallowance'],
  hra: ['hra', 'houserentallowance'],
  conveyance: ['conveyance', 'conveyanceallowance', 'conv', 'transportallowance'],
  medical: ['medical', 'medicalallowance'],
  special: ['special', 'specialallowance', 'splallowance'],
  lta: ['lta', 'leavetravelallowance'],
  other: ['other', 'otherallowance', 'otherallowances', 'others'],
};

export const FIELD_LABELS: Record<Field, string> = {
  emp_code: 'Employee code', full_name: 'Name', father_name: "Father's name", gender: 'Gender', dob: 'Date of birth',
  doj: 'Date of joining', designation: 'Designation', department: 'Department', location: 'Location', work_state: 'State',
  email: 'Email', phone: 'Mobile', uan: 'UAN', pf_number: 'PF number', esi_number: 'ESI number', pf_applicable: 'PF (Y/N)',
  esi_applicable: 'ESI (Y/N)', tax_regime: 'Tax regime', pan: 'PAN', aadhaar: 'Aadhaar', bank_name: 'Bank name',
  bank_ifsc: 'IFSC', bank_account: 'Account number', gross: 'Gross', basic: 'Basic', da: 'DA', hra: 'HRA',
  conveyance: 'Conveyance', medical: 'Medical', special: 'Special allowance', lta: 'LTA', other: 'Other allowance',
};

export const TEMPLATE_HEADER: Field[] = [
  'emp_code', 'full_name', 'father_name', 'gender', 'dob', 'doj', 'designation', 'department', 'location', 'work_state',
  'email', 'phone', 'uan', 'esi_number', 'pf_applicable', 'esi_applicable', 'tax_regime',
  'basic', 'da', 'hra', 'conveyance', 'medical', 'special', 'lta', 'other',
];

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export interface ImportedEmployee {
  line: number;
  emp_code: string;
  full_name: string;
  father_name: string;
  gender: 'M' | 'F' | 'O';
  dob: string | null;
  doj: string;
  designation: string;
  department: string;
  location: string;
  work_state: string;
  email: string;
  phone: string;
  uan: string;
  pf_number: string;
  esi_number: string;
  pf_applicable: boolean;
  esi_applicable: boolean;
  tax_regime: 'new' | 'old';
  pan: string;
  aadhaar: string;
  bank_name: string;
  bank_ifsc: string;
  bank_account: string;
  structure: Components;
}

export interface ImportProblem {
  line: number; // line in the file, 1 = header
  column: string;
  message: string;
}

export interface ImportCheck {
  employees: ImportedEmployee[];
  problems: ImportProblem[];
  ignoredColumns: string[];
  matchedColumns: string[];
}

function parseDate(value: string): string | null {
  return parseDateLoose(value) ?? excelSerialToDate(value);
}

function yesNo(value: string): boolean | null {
  const v = norm(value);
  if (['y', 'yes', 'true', '1', 'applicable'].includes(v)) return true;
  if (['n', 'no', 'false', '0', 'na', 'notapplicable'].includes(v)) return false;
  return null;
}

export function checkEmployeeSheet(table: string[][], defaults: { state: string; esiLimit: number }): ImportCheck {
  const problems: ImportProblem[] = [];
  const out: ImportedEmployee[] = [];
  if (table.length < 2) {
    return { employees: [], problems: [{ line: 1, column: '', message: 'The file needs a heading row and at least one employee.' }], ignoredColumns: [], matchedColumns: [] };
  }
  const header = table[0];
  const col = new Map<Field, number>();
  const ignored: string[] = [];
  header.forEach((h, i) => {
    const key = norm(h);
    if (!key) return;
    const field = (Object.keys(SYNONYMS) as Field[]).find((f) => SYNONYMS[f].includes(key) || norm(f) === key);
    if (field && !col.has(field)) col.set(field, i);
    else ignored.push(h);
  });
  for (const required of ['emp_code', 'full_name', 'doj'] as Field[]) {
    if (!col.has(required)) problems.push({ line: 1, column: FIELD_LABELS[required], message: `Column "${FIELD_LABELS[required]}" is missing from the heading row.` });
  }
  if (!COMPONENT_KEYS.some((k) => col.has(k))) {
    problems.push({ line: 1, column: 'Basic', message: 'No salary columns found. Add at least a "Basic" column.' });
  }
  if (problems.length > 0) return { employees: [], problems, ignoredColumns: ignored, matchedColumns: [] };
  if (table.length - 1 > 2000) {
    return { employees: [], problems: [{ line: 1, column: '', message: 'More than 2,000 rows. Split the file and import in parts.' }], ignoredColumns: ignored, matchedColumns: [] };
  }

  const seen = new Map<string, number>();
  for (let r = 1; r < table.length; r++) {
    const row = table[r];
    const line = r + 1;
    const get = (f: Field): string => {
      const i = col.get(f);
      return i === undefined ? '' : (row[i] ?? '').trim();
    };
    const bad = (f: Field, message: string) => problems.push({ line, column: FIELD_LABELS[f], message });

    const emp_code = get('emp_code').toUpperCase();
    if (!emp_code) bad('emp_code', 'Employee code is empty.');
    else if (!/^[A-Z0-9/_-]{1,20}$/.test(emp_code)) bad('emp_code', `"${emp_code}" can only have letters, digits, / _ and -, up to 20 characters.`);
    else if (seen.has(emp_code)) bad('emp_code', `"${emp_code}" is also on line ${seen.get(emp_code)}.`);
    else seen.set(emp_code, line);

    const full_name = get('full_name');
    if (!full_name) bad('full_name', 'Name is empty.');

    const dojRaw = get('doj');
    const doj = parseDate(dojRaw);
    if (!dojRaw) bad('doj', 'Date of joining is empty.');
    else if (!doj) bad('doj', `"${dojRaw}" is not a date. Use DD-MM-YYYY.`);

    const dobRaw = get('dob');
    const dob = dobRaw ? parseDate(dobRaw) : null;
    if (dobRaw && !dob) bad('dob', `"${dobRaw}" is not a date. Use DD-MM-YYYY.`);
    if (dob && doj && dob >= doj) bad('dob', 'Date of birth is not before the date of joining.');

    let gender: 'M' | 'F' | 'O' = 'M';
    const g = norm(get('gender'));
    if (g) {
      if (['m', 'male'].includes(g)) gender = 'M';
      else if (['f', 'female'].includes(g)) gender = 'F';
      else if (['o', 'other', 'others', 'transgender'].includes(g)) gender = 'O';
      else bad('gender', `"${get('gender')}" is not understood. Use M or F.`);
    }

    let work_state = defaults.state;
    const stateRaw = get('work_state');
    if (stateRaw) {
      const s = findState(stateRaw);
      if (s) work_state = s;
      else bad('work_state', `"${stateRaw}" is not a state name or code this system knows.`);
    }

    const email = get('email').toLowerCase();
    if (email && emailProblem(email)) bad('email', emailProblem(email)!);
    const uan = get('uan').replace(/\s/g, '');
    if (uan && uanProblem(uan)) bad('uan', uanProblem(uan)!);
    const pan = get('pan') ? cleanPan(get('pan')) : '';
    if (pan && panProblem(pan)) bad('pan', panProblem(pan)!);
    const aadhaar = get('aadhaar') ? cleanAadhaar(get('aadhaar')) : '';
    if (aadhaar && aadhaarProblem(aadhaar)) bad('aadhaar', aadhaarProblem(aadhaar)!);
    const bank_ifsc = get('bank_ifsc') ? cleanIfsc(get('bank_ifsc')) : '';
    if (bank_ifsc && ifscProblem(bank_ifsc)) bad('bank_ifsc', ifscProblem(bank_ifsc)!);
    const bank_account = get('bank_account') ? cleanAccount(get('bank_account')) : '';
    if (bank_account && accountProblem(bank_account)) bad('bank_account', accountProblem(bank_account)!);

    const structure = {} as Components;
    let gross = 0;
    for (const k of COMPONENT_KEYS) {
      const raw = get(k);
      if (!raw || raw === '-') structure[k] = 0;
      else {
        const n = parseAmount(raw);
        if (n === null) {
          bad(k, `"${raw}" is not an amount.`);
          structure[k] = 0;
        } else structure[k] = n;
      }
      gross += structure[k];
    }
    if (gross <= 0) bad('basic', 'All salary amounts are zero or empty.');
    const grossRaw = get('gross');
    if (grossRaw) {
      const stated = parseAmount(grossRaw);
      if (stated === null) bad('gross', `"${grossRaw}" is not an amount.`);
      else if (Math.abs(stated - gross) > 0.5) bad('gross', `Gross says ${stated}, but the salary columns add up to ${gross}.`);
    }

    let pf_applicable = true;
    const pfRaw = get('pf_applicable');
    if (pfRaw) {
      const v = yesNo(pfRaw);
      if (v === null) bad('pf_applicable', `"${pfRaw}" is not understood. Use Y or N.`);
      else pf_applicable = v;
    }
    const esi_number = get('esi_number');
    let esi_applicable = col.has('esi_applicable') ? false : esi_number !== '' || (gross > 0 && gross <= defaults.esiLimit && col.has('esi_number'));
    const esiRaw = get('esi_applicable');
    if (esiRaw) {
      const v = yesNo(esiRaw);
      if (v === null) bad('esi_applicable', `"${esiRaw}" is not understood. Use Y or N.`);
      else esi_applicable = v;
    }
    let tax_regime: 'new' | 'old' = 'new';
    const regime = norm(get('tax_regime'));
    if (regime) {
      if (regime.startsWith('new')) tax_regime = 'new';
      else if (regime.startsWith('old')) tax_regime = 'old';
      else bad('tax_regime', `"${get('tax_regime')}" is not understood. Use New or Old.`);
    }

    out.push({
      line, emp_code, full_name, father_name: get('father_name'), gender, dob, doj: doj ?? '', designation: get('designation'),
      department: get('department'), location: get('location'), work_state, email, phone: get('phone'), uan,
      pf_number: get('pf_number'), esi_number, pf_applicable, esi_applicable, tax_regime, pan, aadhaar,
      bank_name: get('bank_name'), bank_ifsc, bank_account, structure,
    });
  }
  return {
    employees: problems.length === 0 ? out : [],
    problems,
    ignoredColumns: ignored,
    matchedColumns: [...col.keys()].map((f) => FIELD_LABELS[f]),
  };
}
