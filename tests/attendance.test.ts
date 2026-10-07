import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distanceMetres, istParts, istToIso, parseClock, parsePunchSheet, summariseDay, summariseMonth } from '../src/lib/attendance';

const SHIFT = { start: 9 * 60 + 30, end: 18 * 60 + 30, grace: 15 };

test('India time conversion', () => {
  assert.deepEqual(istParts('2026-10-06T19:00:00Z'), { date: '2026-10-07', minutes: 30 });
  assert.equal(new Date(istToIso('2026-10-07', '09:30')).toISOString(), '2026-10-07T04:00:00.000Z');
});

test('clock formats', () => {
  assert.equal(parseClock('9:05'), '09:05');
  assert.equal(parseClock('09:05:33'), '09:05');
  assert.equal(parseClock('6.30 PM'), '18:30');
  assert.equal(parseClock('12:10 am'), '00:10');
  assert.equal(parseClock('0.375'), '09:00');
  assert.equal(parseClock('25:00'), null);
  assert.equal(parseClock('late'), null);
});

test('one day: on time, late, early, overtime, missing out', () => {
  const day = (inn: string | null, out: string | null) =>
    summariseDay(
      [inn && { minutes: Number(inn.slice(0, 2)) * 60 + Number(inn.slice(3)), kind: 'in' as const }, out && { minutes: Number(out.slice(0, 2)) * 60 + Number(out.slice(3)), kind: 'out' as const }].filter(Boolean) as { minutes: number; kind: 'in' | 'out' }[],
      SHIFT,
    );
  let s = day('09:40', '18:30');
  assert.equal(s.lateMinutes, 0); // inside the 15-minute grace
  assert.equal(s.workedMinutes, 530);
  s = day('10:00', '17:30');
  assert.equal(s.lateMinutes, 30); // counted from shift start once past the grace
  assert.equal(s.earlyMinutes, 60);
  s = day('09:30', '20:00');
  assert.equal(s.overtimeMinutes, 90);
  s = day('09:30', null);
  assert.equal(s.missingOut, true);
  assert.equal(s.workedMinutes, 0);
});

test('month marks and suggested unpaid days', () => {
  // October 2026 from the 1st to the 10th; Sundays off; holiday on Fri 2nd.
  const p = (inn: number, out: number | null) => [{ minutes: inn, kind: 'in' as const }, ...(out === null ? [] : [{ minutes: out, kind: 'out' as const }])];
  const m = summariseMonth({
    period: '2026-10', today: '2026-10-10', doj: '2026-10-01', exitDate: null,
    punchesByDate: new Map([
      ['2026-10-01', p(570, 1110)],   // Thu, full day
      ['2026-10-03', p(600, 780)],    // Sat, 3 hours -> half day, late
      ['2026-10-05', p(570, 1200)],   // Mon, 90 min overtime
      ['2026-10-09', p(570, null)],   // Fri, no punch out
    ]),
    leaveDates: new Map([['2026-10-06', { paid: true, half: false }], ['2026-10-07', { paid: false, half: false }]]),
    weeklyOff: [0], holidays: new Set(['2026-10-02']), shift: SHIFT,
  });
  const marks = Object.fromEntries(m.marks.map((x) => [x.date.slice(8), x.mark]));
  assert.deepEqual(
    [marks['01'], marks['02'], marks['03'], marks['04'], marks['05'], marks['06'], marks['07'], marks['08'], marks['09'], marks['10'], marks['11']],
    ['P', 'H', 'HD', 'WO', 'P', 'L', 'L', 'A', 'P', 'A', ''],
  );
  assert.equal(m.present, 3);
  assert.equal(m.halfDays, 1);
  assert.equal(m.absent, 2);
  assert.equal(m.leave, 2);
  assert.equal(m.lateCount, 1);
  assert.equal(m.overtimeMinutes, 90);
  assert.equal(m.suggestedUnpaidDays, 0.5 + 1 + 2); // half day + unpaid leave + two absences
});

test('distance', () => {
  // Two points about 1.11 km apart along a meridian (0.01 degree of latitude).
  const d = distanceMetres(12.9000, 77.6000, 12.9100, 77.6000);
  assert.ok(d > 1100 && d < 1120, String(d));
  assert.equal(distanceMetres(12.9, 77.6, 12.9, 77.6), 0);
});

test('punch file: one row per punch, without an In/Out column', () => {
  const r = parsePunchSheet([
    ['Emp Code', 'Date', 'Time'],
    ['e1', '01-10-2026', '09:31'], ['E1', '01-10-2026', '13:00'], ['E1', '01-10-2026', '18:40'],
    ['E2', '01-10-2026', '10:05'],
  ]);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.punches.map((p) => `${p.empCode} ${p.date} ${p.time} ${p.kind}`).sort(), [
    'E1 2026-10-01 09:31 in', 'E1 2026-10-01 18:40 out', 'E2 2026-10-01 10:05 in',
  ]);
});

test('punch file: one row per day (biometric daily report)', () => {
  const r = parsePunchSheet([
    ['Employee Code', 'Attendance Date', 'InTime', 'OutTime'],
    ['E1', '01/10/2026', '09:30', '18:30'],
    ['E2', '01/10/2026', '09:45', '-'],
  ]);
  assert.deepEqual(r.problems, []);
  assert.equal(r.layout, 'one row per day');
  assert.equal(r.punches.length, 3);
});

test('punch file: date-time column and explicit In/Out', () => {
  const r = parsePunchSheet([
    ['EnrollNo', 'DateTime', 'InOut'],
    ['7', '2026-10-01 09:30:12', 'In'], ['7', '2026-10-01 18:31:00', 'Out'],
  ]);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.punches.map((p) => `${p.time} ${p.kind}`), ['09:30 in', '18:31 out']);
});

test('punch file: problems are listed and nothing is returned', () => {
  const r = parsePunchSheet([['Emp Code', 'Date', 'Time', 'Type'], ['E1', '32-10-2026', '09:30', 'In'], ['', '01-10-2026', '09:30', 'In'], ['E2', '01-10-2026', 'nine', 'sideways']]);
  assert.equal(r.punches.length, 0);
  assert.deepEqual(r.problems.map((p) => `${p.line} ${p.column}`), ['2 Date', '3 Employee code', '4 Time']);
  assert.equal(parsePunchSheet([['Name', 'Day'], ['x', 'y']]).problems.length, 2);
});
