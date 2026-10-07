import Link from 'next/link';
import { notFound } from 'next/navigation';
import { as, requireClientAccess } from '@/lib/auth';
import { getClient } from '@/lib/clients';
import { SubmitButton } from '@/components/client';
import { PriorityBadge, SlaBadge, StatusBadge, Timeline } from '@/components/grievances';
import { Card, DefList, Flash, Notice } from '@/components/ui';
import { grievanceAiAction, grievanceCommentAction, grievanceUpdateAction } from '@/lib/actions/grievances';
import { isUuid } from '@/lib/actions/util';
import { dateTime } from '@/lib/format';
import { aiConfigured } from '@/lib/grievance-ai';
import { categoryLabel, GRIEVANCE_COLUMNS, PRIORITIES, STATUS_LABEL, type GrievanceEvent, type GrievanceRow } from '@/lib/grievances';

export const metadata = { title: 'Concern' };

type Row = GrievanceRow & { full_name: string | null; emp_code: string | null; assignee: string | null };

export default async function GrievancePage({ params, searchParams }: {
  params: Promise<{ clientId: string; id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { clientId, id } = await params;
  const user = await requireClientAccess(clientId);
  const client = await getClient(user, clientId);
  if (!isUuid(id)) notFound();
  const data = await as(user, async (sql) => {
    const g = await sql.one<Row>(
      `select ${GRIEVANCE_COLUMNS}, e.full_name, e.emp_code, u.full_name as assignee
         from grievances g left join employees e on e.id = g.employee_id left join users u on u.id = g.assigned_to
        where g.id = $1 and g.client_id = $2`,
      [id, client.id],
    );
    if (!g) return null;
    const events = await sql<GrievanceEvent & { actor_name: string | null }>(
      `select ev.id::text, ev.at, ev.actor, ev.kind, ev.body, ev.internal, u.full_name as actor_name
         from grievance_events ev left join users u on u.id = ev.actor where ev.grievance_id = $1 order by ev.at, ev.id`,
      [id],
    );
    return { g, events };
  });
  if (!data) notFound();
  const { g, events } = data;
  const back = `/c/${client.id}/grievances/${g.id}`;
  const from = g.anonymous ? 'No name given' : g.full_name ? `${g.full_name} (${g.emp_code})` : 'Former employee';
  const who = (e: GrievanceEvent & { actor_name?: string | null }) =>
    e.actor && e.actor === g.raised_by ? (g.full_name ?? 'Employee') : e.actor === user.id ? 'You' : e.actor_name ?? 'HR / office';
  const assigned = !g.assigned_to ? 'Nobody yet' : g.assigned_to === user.id ? 'You' : g.assignee ?? 'Someone else in HR / office';
  return (
    <div className="space-y-5">
      <Link href={`/c/${client.id}/grievances`} className="text-sm text-stone-500 hover:text-stone-800">← All concerns</Link>
      <Flash params={await searchParams} />
      {g.category === 'harassment' && (
        <Notice tone="warn">
          This is marked as harassment. If it is sexual harassment, the POSH Act requires it to be handled by the company’s Internal
          Committee within fixed time limits. Do not try to settle it informally here. Keep access to this case to the fewest people possible.
        </Notice>
      )}
      <Card
        title={g.subject}
        actions={<a href={`/api/grievance/${g.id}`} target="_blank" rel="noopener" className="btn-secondary">Case summary (PDF)</a>}
      >
        <div className="mb-3 flex flex-wrap gap-2">
          <StatusBadge status={g.status} /> <PriorityBadge priority={g.priority} /> <SlaBadge g={g} />
        </div>
        <DefList
          items={[
            ['Reference', g.ref_no],
            ['From', from],
            ['About', categoryLabel(g.category)],
            ['Raised', dateTime(g.created_at)],
            ['To be resolved by', dateTime(g.sla_due_at)],
            ['Handled by', assigned],
          ]}
        />
        <h3 className="mt-4 text-sm font-semibold text-stone-900">What the employee wrote</h3>
        <p className="mt-1 whitespace-pre-wrap text-sm text-stone-800">{g.description}</p>
        {g.resolution && (
          <>
            <h3 className="mt-4 text-sm font-semibold text-stone-900">Resolution</h3>
            <p className="mt-1 whitespace-pre-wrap text-sm text-stone-800">{g.resolution}</p>
          </>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Update the case">
          <form action={grievanceUpdateAction} className="space-y-4">
            <input type="hidden" name="id" value={g.id} />
            <input type="hidden" name="back" value={back} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="u_status" className="mb-1 block text-sm font-medium text-stone-700">Status</label>
                <select id="u_status" name="status" className="input" defaultValue={g.status}>
                  {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="u_priority" className="mb-1 block text-sm font-medium text-stone-700">Priority</label>
                <select id="u_priority" name="priority" className="input" defaultValue={g.priority}>
                  {PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="u_resolution" className="mb-1 block text-sm font-medium text-stone-700">Resolution (the employee sees this)</label>
              <textarea id="u_resolution" name="resolution" className="input" rows={4} maxLength={4000} defaultValue={g.resolution} />
              <p className="mt-1 text-xs text-stone-500">Needed before the case can be marked resolved or closed.</p>
            </div>
            {g.assigned_to !== user.id && (
              <label className="flex items-center gap-2 text-sm text-stone-800">
                <input type="checkbox" name="take" className="h-4 w-4 rounded border-stone-300" /> I am handling this case
              </label>
            )}
            <SubmitButton>Save</SubmitButton>
          </form>
        </Card>
        <Card title="Write a message or note">
          <form action={grievanceCommentAction} className="space-y-4">
            <input type="hidden" name="id" value={g.id} />
            <input type="hidden" name="back" value={back} />
            <div>
              <label htmlFor="c_body" className="mb-1 block text-sm font-medium text-stone-700">Message</label>
              <textarea id="c_body" name="body" className="input" rows={4} required maxLength={3000} />
            </div>
            <label className="flex items-center gap-2 text-sm text-stone-800">
              <input type="checkbox" name="internal" className="h-4 w-4 rounded border-stone-300" /> Internal note (the employee does not see it)
            </label>
            <SubmitButton pendingText="Sending…">Add</SubmitButton>
          </form>
        </Card>
      </div>

      <Card title="AI reading (advice only)">
        {g.category === 'harassment' ? (
          <p className="text-sm text-stone-600">AI help is not used for harassment complaints.</p>
        ) : g.ai ? (
          <div className="space-y-2 text-sm text-stone-800">
            <p><strong>Seriousness:</strong> {g.ai.severity} of 5 · <strong>Tone:</strong> {g.ai.tone || '—'} · <strong>Looks like:</strong> {categoryLabel(g.ai.category)}</p>
            <p>{g.ai.summary}</p>
            <p className="whitespace-pre-wrap">{g.ai.suggestion}</p>
            <p className="text-xs text-stone-500">Written by an AI on {dateTime(g.ai.at)}. It can be wrong. A person in HR decides.</p>
          </div>
        ) : aiConfigured() ? (
          <form action={grievanceAiAction}>
            <input type="hidden" name="id" value={g.id} />
            <input type="hidden" name="back" value={back} />
            <p className="mb-3 text-sm text-stone-600">Sends the subject and details of this concern (not the employee’s name) to the AI service and shows its suggestion here.</p>
            <SubmitButton pendingText="Asking…" className="btn-secondary">Get AI suggestion</SubmitButton>
          </form>
        ) : (
          <p className="text-sm text-stone-600">AI help is not switched on. It needs an AI service key added by the office administrator.</p>
        )}
      </Card>

      <Card title="Timeline">
        <Timeline events={events} who={who} />
      </Card>
    </div>
  );
}
