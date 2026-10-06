import { NextResponse } from 'next/server';
import { as, getUser } from '@/lib/auth';
import { isUuid } from '@/lib/actions/util';
import { renderLetterPdf } from '@/lib/pdf/letter';

export const dynamic = 'force-dynamic';

// Row-level security decides who may read the document: firm users, the
// client's HR, and the employee only when the letter is shared with them.
export async function GET(_req: Request, { params }: { params: Promise<{ docId: string }> }) {
  const { docId } = await params;
  const user = await getUser();
  if (!user) return new NextResponse('Sign in first.', { status: 401 });
  if (!isUuid(docId)) return new NextResponse('Not found.', { status: 404 });
  const row = await as(user, (sql) =>
    sql.one<{ title: string; body: string; data: { salaryRows?: { label: string; monthly: number }[] }; name: string; legal_name: string; address: string; emp_code: string }>(
      `select d.title, d.body, d.data, c.name, c.legal_name, c.address, e.emp_code
         from documents d join clients c on c.id = d.client_id join employees e on e.id = d.employee_id
        where d.id = $1`,
      [docId],
    ),
  );
  if (!row) return new NextResponse('Not found.', { status: 404 });
  const pdf = await renderLetterPdf({
    header: { name: row.legal_name || row.name, address: row.address },
    body: row.body,
    salaryRows: row.data?.salaryRows ?? [],
    footerNote: process.env.DEMO_BANNER === '1' ? 'SAMPLE DATA: not a real letter.' : undefined,
  });
  const filename = `${row.title}-${row.emp_code}.pdf`.replace(/[^A-Za-z0-9._-]+/g, '_');
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
