import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { toCsv } from '@/lib/csv';
import { FIELD_LABELS, TEMPLATE_HEADER } from '@/lib/import/employees';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await getUser())) return new NextResponse('Sign in first.', { status: 401 });
  const header = TEMPLATE_HEADER.map((f) => FIELD_LABELS[f]);
  const example = ['E001', 'Example Name', 'Example Father', 'M', '15-06-1992', '01-04-2026', 'Executive', 'Sales', 'Gurugram', 'Haryana',
    'name@example.com', '', '', '', 'Y', 'N', 'New', 20000, 0, 10000, 0, 0, 10000, 0, 0];
  return new NextResponse('﻿' + toCsv([header, example]), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="employee-import-template.csv"',
      'Cache-Control': 'private, no-store',
    },
  });
}
