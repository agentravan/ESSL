import { NextResponse } from 'next/server';
import { as, getUser } from '@/lib/auth';
import { isUuid } from '@/lib/actions/util';
import { toCsv } from '@/lib/csv';
import type { LineEmp } from '@/lib/payroll/payslip-data';
import type { StoredCalc } from '@/lib/payroll/run';
import { COMPONENT_KEYS, COMPONENT_LABELS } from '@/lib/payroll/types';

export const dynamic = 'force-dynamic';

/** Salary register for one month as a CSV file that opens in Excel. */
export async function GET(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const user = await getUser();
  if (!user) return new NextResponse('Sign in first.', { status: 401 });
  if (!isUuid(runId)) return new NextResponse('Not found.', { status: 404 });
  const data = await as(user, async (sql) => {
    const run = await sql.one<{ period: string; code: string }>(
      'select r.period::text, c.code from payroll_runs r join clients c on c.id = r.client_id where r.id = $1',
      [runId],
    );
    if (!run) return null;
    const lines = await sql<{ emp: LineEmp; calc: StoredCalc }>(
      "select emp, calc from payroll_lines where run_id = $1 order by emp->>'code'",
      [runId],
    );
    return { run, lines };
  });
  if (!data) return new NextResponse('Not found.', { status: 404 });
  const header = [
    'Employee code', 'Name', 'Designation', 'UAN', 'ESI number', 'Paid days', 'LOP days',
    ...COMPONENT_KEYS.map((k) => COMPONENT_LABELS[k]), 'Other earnings', 'Total earnings',
    'PF wage', 'PF employee', 'ESI employee', 'Professional tax', 'TDS', 'Other deductions', 'Total deductions', 'Net pay',
    'Employer EPF', 'Employer EPS', 'EDLI', 'ESI employer',
  ];
  const rows = data.lines.map(({ emp, calc }) => {
    const r = calc.result;
    return [
      emp.code, emp.name, emp.designation, emp.uan, emp.esiNumber, r.paidDays, r.lopDays,
      ...COMPONENT_KEYS.map((k) => r.earned[k]), r.adjustmentEarnings, r.totalEarnings,
      r.pf.pfWage, r.pf.employee, r.esi.employee, r.pt, r.tds, r.adjustmentDeductions, r.totalDeductions, r.netPay,
      r.pf.employerEpf, r.pf.eps, r.pf.edli, r.esi.employer,
    ];
  });
  const period = data.run.period.slice(0, 7);
  return new NextResponse('﻿' + toCsv([header, ...rows]), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="salary-register-${data.run.code}-${period}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
