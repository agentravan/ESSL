import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { parseCsv, toCsv } from '../src/lib/csv';
import { checkEmployeeSheet } from '../src/lib/import/employees';
import { excelSerialToDate, parseXlsx } from '../src/lib/import/table';

const D = { state: 'HR', esiLimit: 21000 };

test('CSV reading handles quotes, commas, blank lines and a byte-order mark', () => {
  assert.deepEqual(parseCsv('﻿a,b\r\n"x, y","he said ""hi"""\n\n1,2'), [['a', 'b'], ['x, y', 'he said "hi"'], ['1', '2']]);
});

test('CSV writing protects against spreadsheet formulas', () => {
  assert.equal(toCsv([['=SUM(A1)', 'ok', 5, null]]), "'=SUM(A1),ok,5,\r\n");
});

test('Excel day numbers become dates', () => {
  assert.equal(excelSerialToDate('45292'), '2024-01-01');
  assert.equal(excelSerialToDate('46302'), '2026-10-07');
  assert.equal(excelSerialToDate('12'), null);
  assert.equal(excelSerialToDate('abc'), null);
});

test('a clean sheet with everyday headings is accepted', () => {
  const r = checkEmployeeSheet(
    [
      ['Emp Code', 'Employee Name', 'Date of Joining', 'Gender', 'State', 'Basic', 'HRA', 'Special Allowance', 'Gross Salary', 'PF', 'ESI', 'Shoe size'],
      ['a001', 'Asha Verma', '01-04-2024', 'Female', 'Haryana', '20,000', '10000', '10000', '40000', 'Y', 'N', '6'],
      ['A002', 'Ravi Kumar', '45292', 'M', 'DL', '12000', '5000', '', '17000', 'yes', 'yes', '9'],
    ],
    D,
  );
  assert.deepEqual(r.problems, []);
  assert.equal(r.employees.length, 2);
  assert.equal(r.employees[0].emp_code, 'A001');
  assert.equal(r.employees[0].doj, '2024-04-01');
  assert.equal(r.employees[0].gender, 'F');
  assert.equal(r.employees[0].structure.basic, 20000);
  assert.equal(r.employees[1].doj, '2024-01-01');
  assert.equal(r.employees[1].work_state, 'DL');
  assert.equal(r.employees[1].esi_applicable, true);
  assert.deepEqual(r.ignoredColumns, ['Shoe size']);
});

test('every problem is reported with its line and column, and nothing is imported', () => {
  const r = checkEmployeeSheet(
    [
      ['Code', 'Name', 'DOJ', 'DOB', 'Basic', 'HRA', 'Gross', 'PAN', 'State', 'PF'],
      ['E1', 'One', '31-02-2024', '', '10000', '5000', '15000', '', '', ''],
      ['E1', '', '01-01-2024', '01-01-2030', 'ten', '5000', '', 'BADPAN', 'Atlantis', 'maybe'],
      ['E3', 'Three', '01-01-2024', '', '10000', '5000', '20000', '', '', ''],
    ],
    D,
  );
  assert.equal(r.employees.length, 0);
  const at = (line: number) => r.problems.filter((p) => p.line === line).map((p) => p.column).sort();
  assert.deepEqual(at(2), ['Date of joining']);
  assert.deepEqual(at(3), ['Basic', 'Date of birth', 'Employee code', 'Name', 'PAN', 'PF (Y/N)', 'State']);
  assert.deepEqual(at(4), ['Gross']);
});

test('missing required columns are reported once', () => {
  const r = checkEmployeeSheet([['Name', 'Phone'], ['A', '1']], D);
  assert.equal(r.employees.length, 0);
  assert.deepEqual(r.problems.map((p) => p.column), ['Employee code', 'Date of joining', 'Basic']);
});

test('an .xlsx file is read: shared strings, numbers, gaps and inline text', async () => {
  const zip = new JSZip();
  zip.file('xl/sharedStrings.xml', '<sst><si><t>Emp Code</t></si><si><r><t>Na</t></r><r><t>me</t></r></si><si><t>R&amp;D</t></si></sst>');
  zip.file(
    'xl/worksheets/sheet1.xml',
    '<worksheet><sheetData>' +
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="D1" t="inlineStr"><is><t>Basic</t></is></c></row>' +
      '<row r="2"><c r="A2" t="str"><v>E1</v></c><c r="B2" t="s"><v>2</v></c><c r="D2"><v>20000</v></c></row>' +
      '<row r="3"><c r="A3"/></row>' +
      '</sheetData></worksheet>',
  );
  const rows = await parseXlsx(await zip.generateAsync({ type: 'uint8array' }));
  assert.deepEqual(rows, [['Emp Code', 'Name', '', 'Basic'], ['E1', 'R&D', '', '20000']]);
});
