import { as, requireEmployee } from '@/lib/auth';
import { SubmitButton } from '@/components/client';
import { RaiseGrievanceForm, TrackGrievanceForm } from '@/components/grievance-client';
import { PriorityBadge, StatusBadge, Timeline } from '@/components/grievances';
import { Card, Flash } from '@/components/ui';
import { grievanceCommentAction } from '@/lib/actions/grievances';
import { dmy } from '@/lib/format';
import { categoryLabel, GRIEVANCE_COLUMNS, type GrievanceEvent, type GrievanceRow } from '@/lib/grievances';

export const metadata = { title: 'Raise a concern' };

export default async function MyGrievancesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireEmployee();
  const data = await as(user, async (sql) => {
    const mine = await sql<GrievanceRow>(`select ${GRIEVANCE_COLUMNS} from grievances g where g.raised_by = $1 order by g.created_at desc limit 50`, [user.id]);
    const events = await sql<GrievanceEvent & { grievance_id: string }>(
      `select ev.id::text, ev.grievance_id, ev.at, ev.actor, ev.kind, ev.body, ev.internal
         from grievance_events ev where ev.grievance_id = any($1::uuid[]) order by ev.at, ev.id`,
      [mine.map((g) => g.id)],
    );
    return { mine, events };
  });
  const who = (e: GrievanceEvent) => (e.actor === user.id ? 'You' : 'HR');
  return (
    <div className="space-y-5">
      <Flash params={await searchParams} />
      <Card title="Raise a concern">
        <RaiseGrievanceForm />
      </Card>
      <Card title={`My concerns (${data.mine.length})`}>
        {data.mine.length === 0 ? (
          <p className="text-sm text-stone-600">You have not raised any concern with your name. Concerns sent without a name are not listed here; use the tracking code below.</p>
        ) : (
          <ul className="space-y-3">
            {data.mine.map((g) => (
              <li key={g.id} className="rounded-md border border-stone-200">
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2.5 text-sm">
                    <span className="font-medium text-stone-900">{g.subject}</span>
                    <span className="font-mono text-xs text-stone-500">{g.ref_no}</span>
                    <StatusBadge status={g.status} /> <PriorityBadge priority={g.priority} />
                    <span className="text-xs text-stone-500">{categoryLabel(g.category)} · {dmy(String(g.created_at).slice(0, 10))}</span>
                  </summary>
                  <div className="space-y-3 border-t border-stone-100 p-3">
                    <p className="whitespace-pre-wrap text-sm text-stone-800">{g.description}</p>
                    {g.resolution && <p className="whitespace-pre-wrap rounded bg-emerald-50 p-2 text-sm text-emerald-900"><strong>Resolution:</strong> {g.resolution}</p>}
                    <Timeline events={data.events.filter((e) => e.grievance_id === g.id)} who={who} />
                    {g.status !== 'closed' && (
                      <form action={grievanceCommentAction} className="space-y-2">
                        <input type="hidden" name="id" value={g.id} />
                        <input type="hidden" name="back" value="/me/grievances" />
                        <label htmlFor={`r_${g.id}`} className="block text-sm font-medium text-stone-700">Reply to HR</label>
                        <textarea id={`r_${g.id}`} name="body" className="input" rows={2} required maxLength={3000} />
                        <SubmitButton pendingText="Sending…" className="btn-secondary">Send reply</SubmitButton>
                      </form>
                    )}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Follow a concern sent without a name">
        <TrackGrievanceForm />
      </Card>
    </div>
  );
}
