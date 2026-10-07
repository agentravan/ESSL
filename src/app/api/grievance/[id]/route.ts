// Case summary PDF for one concern. HR and the firm only.

import { as, getUser, isFirm } from '@/lib/auth';
import { isUuid } from '@/lib/actions/util';
import { dateTime } from '@/lib/format';
import { categoryLabel, GRIEVANCE_COLUMNS, priorityLabel, slaState, STATUS_LABEL, type GrievanceEvent, type GrievanceRow } from '@/lib/grievances';
import { renderLetterPdf } from '@/lib/pdf/letter';

export const dynamic = 'force-dynamic';

/** Keeps what people typed from being read as letter marks. */
function plain(text: string): string {
  return text.replace(/\*\*/g, '').replace(/\{\{/g, '{ {').split(/\r?\n/).map((l) => l.replace(/^(\s*)(#+\s|-\s|===)/, '$1 $2')).join('\n');
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser();
  if (!user) return new Response('Please sign in.', { status: 401 });
  if (!isFirm(user) && user.role !== 'client_hr') return new Response('Not found.', { status: 404 });
  if (!isUuid(id)) return new Response('Not found.', { status: 404 });
  const data = await as(user, async (sql) => {
    const g = await sql.one<GrievanceRow & { full_name: string | null; emp_code: string | null; client_name: string; client_address: string }>(
      `select ${GRIEVANCE_COLUMNS}, e.full_name, e.emp_code, c.name as client_name, c.address as client_address
         from grievances g join clients c on c.id = g.client_id left join employees e on e.id = g.employee_id where g.id = $1`,
      [id],
    );
    if (!g) return null;
    const events = await sql<GrievanceEvent>(
      'select id::text, at, actor, kind, body, internal from grievance_events where grievance_id = $1 order by at, id', [id],
    );
    await sql('select audit($1, $2, $3, $4, $5)', ['grievance.pdf', 'grievance', id, g.client_id, '{}']);
    return { g, events };
  });
  if (!data) return new Response('Not found.', { status: 404 });
  const { g, events } = data;
  const lines: string[] = [
    '# Grievance case summary',
    '',
    `**Reference:** ${g.ref_no}`,
    `**Subject:** ${plain(g.subject)}`,
    `**From:** ${g.anonymous ? 'No name given' : g.full_name ? `${g.full_name} (${g.emp_code})` : 'Former employee'}`,
    `**About:** ${categoryLabel(g.category)}`,
    `**Priority:** ${priorityLabel(g.priority)}`,
    `**Status:** ${STATUS_LABEL[g.status]}`,
    `**Raised:** ${dateTime(g.created_at)}`,
    `**To be resolved by:** ${dateTime(g.sla_due_at)} (${slaState(g).label})`,
    '',
    '## What the employee wrote',
    plain(g.description),
    '',
    '## Resolution',
    g.resolution ? plain(g.resolution) : 'Not resolved yet.',
  ];
  if (g.ai && g.category !== 'harassment') {
    lines.push('', '## AI reading (advice only, may be wrong)', `Seriousness ${g.ai.severity} of 5. ${plain(g.ai.summary)}`, plain(g.ai.suggestion));
  }
  lines.push('', '## Timeline');
  if (events.length === 0) lines.push('No entries.');
  for (const e of events) {
    const by = e.actor && e.actor === g.raised_by ? 'Employee' : 'HR';
    lines.push(`- **${dateTime(e.at)}** · ${by}${e.internal ? ' · internal note' : ''}: ${plain(e.body).replace(/\n+/g, ' ')}`);
  }
  const pdf = await renderLetterPdf({
    header: { name: g.client_name, address: g.client_address },
    body: lines.join('\n'),
    footerNote: `Confidential. ${g.ref_no}. Printed ${dateTime(new Date())}.`,
  });
  return new Response(Buffer.from(pdf), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${g.ref_no}.pdf"`,
      'cache-control': 'private, no-store',
    },
  });
}
