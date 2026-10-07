import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, computeBalances, countLeaveDays, weekday } from '../src/lib/leave';

test('dates', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-03-01', -1), '2028-02-29');
  assert.equal(weekday('2026-10-07'), 3); // Wednesday
  assert.equal(weekday('2026-10-11'), 0); // Sunday
});

test('leave days skip weekly offs and holidays', () => {
  const holidays = new Set(['2026-10-20']);
  // Fri 16 Oct to Wed 21 Oct 2026: 16, 17(Sat), 18(Sun), 19, 20(holiday), 21
  assert.equal(countLeaveDays('2026-10-16', '2026-10-21', false, [0], holidays), 4);
  assert.equal(countLeaveDays('2026-10-16', '2026-10-21', false, [0, 6], holidays), 3);
  assert.equal(countLeaveDays('2026-10-16', '2026-10-21', false, [], new Set()), 6);
  assert.equal(countLeaveDays('2026-10-19', '2026-10-19', true, [0], holidays), 0.5);
  assert.equal(countLeaveDays('2026-10-18', '2026-10-18', false, [0], holidays), 0); // a Sunday
  assert.equal(countLeaveDays('2026-10-21', '2026-10-16', false, [0], holidays), 0);
});

test('leave days can be limited to one month', () => {
  // Thu 29 Oct to Tue 3 Nov 2026, Sundays off: Oct has 29, 30, 31; Nov has 2, 3
  const oct = { from: '2026-10-01', to: '2026-10-31' };
  const nov = { from: '2026-11-01', to: '2026-11-30' };
  assert.equal(countLeaveDays('2026-10-29', '2026-11-03', false, [0], new Set(), oct), 3);
  assert.equal(countLeaveDays('2026-10-29', '2026-11-03', false, [0], new Set(), nov), 2);
  assert.equal(countLeaveDays('2026-09-01', '2026-09-05', false, [0], new Set(), oct), 0);
});

test('balances', () => {
  const types = [
    { id: 'cl', code: 'CL', name: 'Casual', annual_quota: 12, paid: true },
    { id: 'lwp', code: 'LWP', name: 'Unpaid', annual_quota: 0, paid: false },
  ];
  const b = computeBalances(
    types,
    [
      { leave_type_id: 'cl', days: 2, status: 'approved' },
      { leave_type_id: 'cl', days: 1.5, status: 'pending' },
      { leave_type_id: 'cl', days: 3, status: 'rejected' },
      { leave_type_id: 'lwp', days: 4, status: 'approved' },
    ],
    [{ leave_type_id: 'cl', days: 3 }, { leave_type_id: 'cl', days: -1 }],
  );
  assert.equal(b[0].available, 12 + 2 - 2 - 1.5);
  assert.equal(b[0].taken, 2);
  assert.equal(b[0].pending, 1.5);
  assert.equal(b[1].available, null);
  assert.equal(b[1].taken, 4);
});
