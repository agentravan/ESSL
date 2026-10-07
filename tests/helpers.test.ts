import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aadhaarProblem, accountProblem, ifscProblem, panProblem, parseAmount, parseDateLoose, passwordProblem, verhoeffValid,
} from '../src/lib/validate';
import { dmy, inr, longDate, rupeesInWords } from '../src/lib/format';
import { decryptBytes, decryptField, encryptBytes, encryptField, generatePassword, hashPassword, verifyPassword } from '../src/lib/crypto';
import { sniffFileType } from '../src/lib/documents';

test('Verhoeff check digit', () => {
  // Reference values from the published Verhoeff examples.
  assert.equal(verhoeffValid('2363'), true);
  assert.equal(verhoeffValid('2364'), false);
  assert.equal(verhoeffValid('123456789012'), false);
});

test('identifier formats', () => {
  assert.equal(panProblem('abcde1234f'), null);
  assert.ok(panProblem('ABCD1234F'));
  assert.ok(aadhaarProblem('1234 5678 9012'));
  assert.ok(aadhaarProblem('12345'));
  assert.equal(ifscProblem('hdfc0001234'), null);
  assert.ok(ifscProblem('HDFC1001234'));
  assert.equal(accountProblem('50100123456789'), null);
  assert.ok(accountProblem('12AB'));
});

test('loose dates, day first', () => {
  assert.equal(parseDateLoose('2026-10-07'), '2026-10-07');
  assert.equal(parseDateLoose('07/10/2026'), '2026-10-07');
  assert.equal(parseDateLoose('7-1-2026'), '2026-01-07');
  assert.equal(parseDateLoose('31.02.2026'), null);
  assert.equal(parseDateLoose('October 7'), null);
});

test('amounts', () => {
  assert.equal(parseAmount('25,000'), 25000);
  assert.equal(parseAmount('Rs. 1,25,000.50'), 125000.5);
  assert.equal(parseAmount('-5'), null);
  assert.equal(parseAmount('abc'), null);
  assert.equal(parseAmount(''), null);
});

test('Indian number formatting', () => {
  assert.equal(inr(0), '0');
  assert.equal(inr(999), '999');
  assert.equal(inr(1000), '1,000');
  assert.equal(inr(123456), '1,23,456');
  assert.equal(inr(12345678), '1,23,45,678');
  assert.equal(inr(1234567.5, 2), '12,34,567.50');
  assert.equal(inr(-2500), '-2,500');
});

test('rupees in words', () => {
  assert.equal(rupeesInWords(0), 'Zero');
  assert.equal(rupeesInWords(19), 'Nineteen');
  assert.equal(rupeesInWords(100), 'One Hundred');
  assert.equal(rupeesInWords(37600), 'Thirty Seven Thousand Six Hundred');
  assert.equal(rupeesInWords(123456), 'One Lakh Twenty Three Thousand Four Hundred Fifty Six');
  assert.equal(rupeesInWords(10000000), 'One Crore');
  assert.equal(rupeesInWords(12050007), 'One Crore Twenty Lakh Fifty Thousand Seven');
});

test('dates for display', () => {
  assert.equal(dmy('2026-10-07'), '07 Oct 2026');
  assert.equal(longDate('2026-10-07'), '7 October 2026');
});

test('passwords', async () => {
  assert.ok(passwordProblem('short'));
  assert.equal(passwordProblem('a-long-enough-one'), null);
  const hash = await hashPassword('correct horse battery');
  assert.ok(hash.startsWith('scrypt$'));
  assert.equal(await verifyPassword('correct horse battery', hash), true);
  assert.equal(await verifyPassword('wrong', hash), false);
  assert.equal(await verifyPassword('x', 'not-a-hash'), false);
  assert.match(generatePassword(), /^[a-z2-9]{4}(-[a-z2-9]{4}){3}$/);
});

test('field encryption round trip and tamper detection', () => {
  process.env.DATA_KEY = Buffer.alloc(32, 7).toString('base64');
  const enc = encryptField('ABCDE1234F');
  assert.notEqual(enc, 'ABCDE1234F');
  assert.equal(decryptField(enc), 'ABCDE1234F');
  assert.notEqual(encryptField('ABCDE1234F'), enc); // fresh IV every time
  const parts = enc.split('.');
  parts[3] = Buffer.from('tampered').toString('base64');
  assert.throws(() => decryptField(parts.join('.')));
});

test('file encryption round trip and file-type sniffing', () => {
  process.env.DATA_KEY = Buffer.alloc(32, 7).toString('base64');
  const pdf = Buffer.from('%PDF-1.7 pretend file');
  const enc = encryptBytes(pdf);
  assert.ok(!enc.includes(Buffer.from('%PDF')));
  assert.deepEqual(decryptBytes(enc), pdf);
  enc[enc.length - 1] ^= 1;
  assert.throws(() => decryptBytes(enc));
  assert.equal(sniffFileType(pdf), 'application/pdf');
  assert.equal(sniffFileType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])), 'image/jpeg');
  assert.equal(sniffFileType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'image/png');
  assert.equal(sniffFileType(Buffer.from('MZ this is a program')), null);
});

import { effectivePriority, normaliseCode, slaDue, slaState, codeFromBytes } from '../src/lib/grievances';
import { parseAiReply } from '../src/lib/grievance-ai';

test('grievance time limits follow the priority', () => {
  const from = new Date('2026-10-01T04:00:00Z');
  assert.equal(slaDue('critical', from).toISOString(), '2026-10-02T04:00:00.000Z');
  assert.equal(slaDue('high', from).toISOString(), '2026-10-03T04:00:00.000Z');
  assert.equal(slaDue('medium', from).toISOString(), '2026-10-06T04:00:00.000Z');
  assert.equal(slaDue('low', from).toISOString(), '2026-10-11T04:00:00.000Z');
});

test('a harassment complaint is never below high priority', () => {
  assert.equal(effectivePriority('harassment', 'low'), 'high');
  assert.equal(effectivePriority('harassment', 'critical'), 'critical');
  assert.equal(effectivePriority('payroll', 'low'), 'low');
});

test('grievance time-limit badge', () => {
  const g = { status: 'open', created_at: '2026-10-01T00:00:00Z', sla_due_at: '2026-10-03T00:00:00Z', closed_at: null };
  assert.deepEqual(slaState(g, new Date('2026-10-01T12:00:00Z')), { tone: 'grey', label: '36 h left' });
  assert.equal(slaState(g, new Date('2026-10-02T20:00:00Z')).tone, 'amber');
  assert.deepEqual(slaState(g, new Date('2026-10-03T05:00:00Z')), { tone: 'red', label: 'Overdue by 5 h' });
  assert.equal(slaState({ ...g, status: 'resolved', closed_at: '2026-10-02T00:00:00Z' }).label, 'Resolved in time');
  assert.equal(slaState({ ...g, status: 'closed', closed_at: '2026-10-06T00:00:00Z' }).label, 'Resolved 3 days late');
});

test('tracking codes ignore case, spaces and dashes', () => {
  assert.equal(normaliseCode(' abcd-efgh 2345 '), 'ABCDEFGH2345');
  assert.equal(codeFromBytes(new Uint8Array([0, 1, 2, 31, 32]), 5).length, 5);
});

test('AI reply is read defensively', () => {
  const ai = parseAiReply('Here: {"category":"payroll","severity":9,"tone":"upset","summary":"s","suggestion":"do x"} thanks');
  assert.equal(ai.severity, 5);
  assert.equal(ai.category, 'payroll');
  assert.throws(() => parseAiReply('no json here'));
});
