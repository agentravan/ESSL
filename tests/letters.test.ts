import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fillTemplate, lintTemplate, placeholdersIn } from '../src/lib/letters/template';
import { pdfSafe, parseRuns } from '../src/lib/pdf/draw';
import { renderLetterPdf } from '../src/lib/pdf/letter';
import { renderPayslipPdf } from '../src/lib/pdf/payslip';

const OUT = process.env.PDF_OUT;

test('placeholders are found once each, in order', () => {
  assert.deepEqual(placeholdersIn('Dear {{ Employee_Name }}, {{designation}} {{employee_name}} {{salary_table}}'), [
    'employee_name', 'designation', 'salary_table',
  ]);
});

test('filling reports what is still missing and leaves block placeholders', () => {
  const r = fillTemplate('Dear {{employee_name}} of {{client_name}}\n{{salary_table}}\n{{notice_days}}', {
    employee_name: ' Asha Verma ',
    notice_days: '',
  });
  assert.equal(r.text, 'Dear Asha Verma of {{client_name}}\n{{salary_table}}\n{{notice_days}}');
  assert.deepEqual(r.missing, ['client_name', 'notice_days']);
});

test('template linting', () => {
  assert.deepEqual(lintTemplate('Dear {{employee_name}},\n**Welcome** aboard.'), []);
  const problems = lintTemplate('Dear {{employee_name},\nPay: {{salary_table}} here\n**bold\n{{shoe_size}}');
  assert.equal(problems.length, 4);
  assert.equal(problems[0].line, 1);
  assert.ok(problems[1].message.includes('line by itself'));
  assert.ok(problems[2].message.includes('Bold'));
  assert.ok(problems[3].message.includes('not a standard field'));
  assert.equal(lintTemplate('  ').length, 1);
});

test('text is made safe for the PDF fonts', () => {
  assert.equal(pdfSafe('₹25,000 — “quoted” café'), 'Rs.25,000 - "quoted" café');
  assert.equal(pdfSafe('नमस्ते ok'), '?????? ok');
  assert.equal(pdfSafe('line one\r\nline two'), 'line one\nline two');
  assert.deepEqual(parseRuns('a **b** c'), [
    { text: 'a ', bold: false }, { text: 'b', bold: true }, { text: ' c', bold: false },
  ]);
});

test('letter PDF renders, including long text that needs a second page', async () => {
  const para = 'This paragraph is here to fill the page and prove that long text wraps and continues on a new page. '.repeat(6);
  const body = [
    '{{ignored}}', 'Date: 7 October 2026', '', 'Asha Verma', 'Gurugram', '', '# Offer of Employment', '',
    'Dear **Asha Verma**,', '', para, '', '## Salary', '{{salary_table}}', '- First point', '- Second point with ₹ sign',
    ...Array.from({ length: 12 }, () => para), '===', 'For Alpha Traders Pvt Ltd', '', '', 'Authorised Signatory',
  ].join('\n');
  const pdf = await renderLetterPdf({
    header: { name: 'Alpha Traders Pvt Ltd', address: 'Plot 12, Udyog Vihar\nGurugram, Haryana 122016' },
    body,
    salaryRows: [{ label: 'Basic', monthly: 20000 }, { label: 'House Rent Allowance', monthly: 10000 }, { label: 'LTA', monthly: 0 }],
    footerNote: 'Prepared by Teamwork',
  });
  assert.equal(Buffer.from(pdf.slice(0, 5)).toString(), '%PDF-');
  assert.ok(pdf.length > 3000);
  if (OUT) { mkdirSync(OUT, { recursive: true }); writeFileSync(`${OUT}/letter.pdf`, pdf); }
});

test('payslip PDF renders', async () => {
  const pdf = await renderPayslipPdf({
    client: { name: 'Alpha Traders Pvt Ltd', address: 'Plot 12, Udyog Vihar\nGurugram, Haryana 122016' },
    periodLabel: 'October 2026',
    employee: [
      ['Employee', 'Asha Verma'], ['Employee code', 'A001'], ['Designation', 'Accounts Executive'], ['Department', 'Finance'],
      ['Date of joining', '01 Jan 2024'], ['PAN', 'XXXXXX234F'], ['UAN', '100200300400'], ['Bank account', 'XXXX6789'],
    ],
    days: { base: 31, paid: 31, lop: 0 },
    earnings: [
      { label: 'Basic', full: 20000, earned: 20000 }, { label: 'House Rent Allowance', full: 10000, earned: 10000 },
      { label: 'Special Allowance', full: 10000, earned: 10000 }, { label: 'Incentive', full: null, earned: 5000 },
    ],
    deductions: [{ label: 'Provident Fund', amount: 2400 }, { label: 'Advance recovery', amount: 3000 }],
    totalEarnings: 45000, totalDeductions: 5400, netPay: 39600, note: 'SAMPLE DATA',
  });
  assert.equal(Buffer.from(pdf.slice(0, 5)).toString(), '%PDF-');
  if (OUT) { mkdirSync(OUT, { recursive: true }); writeFileSync(`${OUT}/payslip.pdf`, pdf); }
});

test('the standard templates in the database migration are clean and use only known fields', async () => {
  const { readFileSync } = await import('node:fs');
  const sql = readFileSync('db/migrations/004_letter_templates.sql', 'utf8');
  const bodies = [...sql.matchAll(/\$tpl\$([\s\S]*?)\$tpl\$/g)].map((m) => m[1]);
  assert.equal(bodies.length, 4);
  for (const body of bodies) {
    assert.deepEqual(lintTemplate(body), []);
    const pdf = await renderLetterPdf({ header: { name: 'Test Co', address: 'Gurugram' }, body, salaryRows: [{ label: 'Basic', monthly: 20000 }] });
    assert.ok(pdf.length > 1500);
  }
});
