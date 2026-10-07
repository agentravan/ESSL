import { NextResponse } from 'next/server';
import { as, getUser, isFirm } from '@/lib/auth';
import { isUuid } from '@/lib/actions/util';
import { decryptField } from '@/lib/crypto';
import { bankSheet, esiSheet, pfEcr, ptStatement, type ExportLine } from '@/lib/exports';
import { periodLabel } from '@/lib/payroll/period';

export const dynamic = 'force-dynamic';

const KINDS = ['pf-ecr', 'esi', 'pt', 'bank'] as const;
type Kind = (typeof KINDS)[number];

/** Statutory and bank files for a locked month. Office users only. */
export async function GET(_req: Request, { params }: { params: Promise<{ runId: string; kind: string }> }) {
  const { runId, kind } = await params;
  const user = await getUser();
  if (!user) return new NextResponse('Sign in first.', { status: 401 });
  if (!isFirm(user)) return new NextResponse('Not found.', { status: 404 });
  if (!isUuid(runId) || !KINDS.includes(kind as Kind)) return new NextResponse('Not found.', { status: 404 });

  const data = await as(user, async (sql) => {
    const run = await sql.one<{ client_id: string; period: string; status: string; code: string }>(
      'select r.client_id, r.period::text, r.status, c.code from payroll_runs r join clients c on c.id = r.client_id where r.id = $1',
      [runId],
    );
    if (!run) return null;
    const lines = await sql<ExportLine & { employee_id: string }>(
      "select employee_id, emp, calc from payroll_lines where run_id = $1 order by emp->>'code'",
      [runId],
    );
    let accounts = new Map<string, { account: string; ifsc: string; bank: string }>();
    if (kind === 'bank') {
      const rows = await sql<{ emp_code: string; bank_acct_enc: string | null; bank_ifsc: string; bank_name: string }>(
        'select emp_code, bank_acct_enc, bank_ifsc, bank_name from employees where id = any($1::uuid[])',
        [lines.map((l) => l.employee_id)],
      );
      accounts = new Map(
        rows.map((r) => [r.emp_code, { account: r.bank_acct_enc ? decryptField(r.bank_acct_enc) : '', ifsc: r.bank_ifsc, bank: r.bank_name }]),
      );
    }
    await sql('select audit($1, $2, $3, $4, $5)', [`export.${kind}`, 'payroll_run', runId, run.client_id, JSON.stringify({ period: run.period })]);
    return { run, lines, accounts };
  });
  if (!data) return new NextResponse('Not found.', { status: 404 });
  if (data.run.status !== 'locked') {
    return new NextResponse('Lock the month first. Files are made only from final figures.', { status: 409 });
  }
  const period = data.run.period.slice(0, 7);
  const base = `${data.run.code}-${period}`;
  let body: string;
  let filename: string;
  let type = 'text/csv; charset=utf-8';
  if (kind === 'pf-ecr') {
    body = pfEcr(data.lines).text;
    filename = `PF-ECR-${base}.txt`;
    type = 'text/plain; charset=utf-8';
  } else if (kind === 'esi') {
    body = '﻿' + esiSheet(data.lines).csv;
    filename = `ESI-${base}.csv`;
  } else if (kind === 'pt') {
    body = '﻿' + ptStatement(data.lines).csv;
    filename = `PT-${base}.csv`;
  } else {
    body = '﻿' + bankSheet(data.lines, data.accounts, `Salary ${periodLabel(period)}`).csv;
    filename = `Bank-${base}.csv`;
  }
  return new NextResponse(body, {
    headers: { 'Content-Type': type, 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'private, no-store' },
  });
}
