import { NextResponse } from 'next/server';
import { as, getUser } from '@/lib/auth';
import { isUuid } from '@/lib/actions/util';
import { payslipInput, type LineEmp } from '@/lib/payroll/payslip-data';
import type { StoredCalc } from '@/lib/payroll/run';
import { renderPayslipPdf } from '@/lib/pdf/payslip';

export const dynamic = 'force-dynamic';

// Row-level security decides whether this user may see the line at all:
// firm users always, the client's HR and the employee only once the month is locked.
export async function GET(_req: Request, { params }: { params: Promise<{ lineId: string }> }) {
  const { lineId } = await params;
  const user = await getUser();
  if (!user) return new NextResponse('Sign in first.', { status: 401 });
  if (!isUuid(lineId)) return new NextResponse('Not found.', { status: 404 });
  const row = await as(user, (sql) =>
    sql.one<{ emp: LineEmp; calc: StoredCalc; period: string; status: string; name: string; legal_name: string; address: string }>(
      `select l.emp, l.calc, r.period::text, r.status, c.name, c.legal_name, c.address
         from payroll_lines l
         join payroll_runs r on r.id = l.run_id
         join clients c on c.id = l.client_id
        where l.id = $1`,
      [lineId],
    ),
  );
  if (!row) return new NextResponse('Not found.', { status: 404 });
  const period = row.period.slice(0, 7);
  const notes: string[] = [];
  if (row.status !== 'locked') notes.push('DRAFT: payroll for this month is not final.');
  if (process.env.DEMO_BANNER === '1') notes.push('SAMPLE DATA: not a real payslip.');
  const pdf = await renderPayslipPdf(
    payslipInput({ client: row, period, emp: row.emp, calc: row.calc, note: notes.join('  ') || undefined }),
  );
  const filename = `payslip-${row.emp.code}-${period}.pdf`.replace(/[^A-Za-z0-9._-]/g, '_');
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
