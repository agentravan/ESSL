// Letter templates: plain text with {{placeholders}} and a few formatting marks.
//
//   # Title            centred heading
//   ## Section         bold sub-heading
//   - item             bullet
//   **bold**           bold text inside a line
//   {{salary_table}}   on a line by itself: the salary break-up table
//   ===                on a line by itself: start a new page
//
// Pure functions; no database or PDF code here.

export const BLOCK_PLACEHOLDERS = new Set(['salary_table']);

export interface PlaceholderInfo {
  key: string;
  label: string;
  source: 'employee' | 'client' | 'salary' | 'letter' | 'manual';
}

export const KNOWN_PLACEHOLDERS: PlaceholderInfo[] = [
  { key: 'letter_date', label: 'Date on the letter', source: 'letter' },
  { key: 'ref_no', label: 'Reference number', source: 'letter' },
  { key: 'employee_name', label: 'Employee name', source: 'employee' },
  { key: 'title', label: 'Mr. / Ms.', source: 'employee' },
  { key: 'employee_code', label: 'Employee code', source: 'employee' },
  { key: 'father_name', label: "Father's name", source: 'employee' },
  { key: 'designation', label: 'Designation', source: 'employee' },
  { key: 'department', label: 'Department', source: 'employee' },
  { key: 'location', label: 'Work location', source: 'employee' },
  { key: 'date_of_joining', label: 'Date of joining', source: 'employee' },
  { key: 'exit_date', label: 'Last working day', source: 'employee' },
  { key: 'employee_address', label: 'Employee address', source: 'employee' },
  { key: 'employee_email', label: 'Employee email', source: 'employee' },
  { key: 'client_name', label: 'Company name', source: 'client' },
  { key: 'client_legal_name', label: 'Company legal name', source: 'client' },
  { key: 'client_address', label: 'Company address', source: 'client' },
  { key: 'gross_monthly', label: 'Gross salary per month', source: 'salary' },
  { key: 'gross_annual', label: 'Gross salary per year', source: 'salary' },
  { key: 'gross_annual_words', label: 'Gross salary per year, in words', source: 'salary' },
  { key: 'basic_monthly', label: 'Basic per month', source: 'salary' },
  { key: 'salary_table', label: 'Salary break-up table', source: 'salary' },
  { key: 'probation_months', label: 'Probation period (months)', source: 'manual' },
  { key: 'notice_days', label: 'Notice period (days)', source: 'manual' },
  { key: 'offer_valid_until', label: 'Offer valid until', source: 'manual' },
  { key: 'jurisdiction', label: 'Courts having jurisdiction (city)', source: 'manual' },
  { key: 'signatory_name', label: 'Signed by (name)', source: 'manual' },
  { key: 'signatory_designation', label: 'Signed by (designation)', source: 'manual' },
];

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

/** Placeholder names used in a template, in order of first appearance. */
export function placeholdersIn(body: string): string[] {
  const seen: string[] = [];
  for (const m of body.matchAll(PLACEHOLDER_RE)) {
    const key = m[1].toLowerCase();
    if (!seen.includes(key)) seen.push(key);
  }
  return seen;
}

export interface TemplateProblem {
  line: number;
  message: string;
}

/** Things worth fixing before a template is used. */
export function lintTemplate(body: string): TemplateProblem[] {
  const problems: TemplateProblem[] = [];
  const known = new Set(KNOWN_PLACEHOLDERS.map((p) => p.key));
  const lines = body.split(/\r?\n/);
  lines.forEach((line, i) => {
    const stripped = line.replace(PLACEHOLDER_RE, '');
    if (stripped.includes('{{') || stripped.includes('}}')) {
      problems.push({ line: i + 1, message: 'Unfinished placeholder: check the {{ and }} on this line.' });
    }
    for (const m of line.matchAll(PLACEHOLDER_RE)) {
      const key = m[1].toLowerCase();
      if (BLOCK_PLACEHOLDERS.has(key) && line.trim().toLowerCase().replace(/\s/g, '') !== `{{${key}}}`) {
        problems.push({ line: i + 1, message: `{{${key}}} must be on a line by itself.` });
      }
      if (!known.has(key)) {
        problems.push({ line: i + 1, message: `{{${key}}} is not a standard field; it will be asked for each time.` });
      }
    }
    if ((line.match(/\*\*/g) ?? []).length % 2 === 1) {
      problems.push({ line: i + 1, message: 'Bold text starts with ** but does not end with **.' });
    }
  });
  if (!body.trim()) problems.push({ line: 1, message: 'The template is empty.' });
  return problems;
}

/**
 * Replaces every placeholder that has a value. Block placeholders are left in
 * place for the PDF renderer. Returns the text and the names still unfilled.
 */
export function fillTemplate(body: string, values: Record<string, string>): { text: string; missing: string[] } {
  const missing: string[] = [];
  const text = body.replace(PLACEHOLDER_RE, (whole, rawKey: string) => {
    const key = rawKey.toLowerCase();
    if (BLOCK_PLACEHOLDERS.has(key)) return `{{${key}}}`;
    const value = values[key];
    if (value === undefined || value.trim() === '') {
      if (!missing.includes(key)) missing.push(key);
      return whole;
    }
    return value.trim();
  });
  return { text, missing };
}

export function placeholderLabel(key: string): string {
  const known = KNOWN_PLACEHOLDERS.find((p) => p.key === key);
  if (known) return known.label;
  return key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}
