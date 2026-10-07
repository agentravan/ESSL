import { NextResponse } from 'next/server';
import { as, getUser } from '@/lib/auth';
import { isUuid } from '@/lib/actions/util';
import { decryptBytes } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

// Row-level security decides who can read the row: the employee themselves, their client's HR, and the office.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser();
  if (!user) return new NextResponse('Sign in first.', { status: 401 });
  if (!isUuid(id)) return new NextResponse('Not found.', { status: 404 });
  const row = await as(user, async (sql) => {
    const r = await sql.one<{ file_name: string; mime: string; content: Buffer; client_id: string; employee_id: string }>(
      'select file_name, mime, content, client_id, employee_id from employee_documents where id = $1',
      [id],
    );
    if (r && user.role !== 'employee') {
      await sql('select audit($1, $2, $3, $4, $5)', ['document.view', 'employee', r.employee_id, r.client_id, '{}']);
    }
    return r;
  });
  if (!row) return new NextResponse('Not found.', { status: 404 });
  const bytes = decryptBytes(row.content);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': row.mime,
      'Content-Disposition': `inline; filename="${row.file_name.replace(/[^A-Za-z0-9._-]+/g, '_')}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
    },
  });
}
