import { Badge } from './ui';
import { dateTime } from '@/lib/format';
import { priorityLabel, slaState, STATUS_LABEL, type GrievanceEvent, type GrievanceRow } from '@/lib/grievances';

export function StatusBadge({ status }: { status: GrievanceRow['status'] }) {
  const tone = status === 'open' ? 'amber' : status === 'in_progress' ? 'blue' : status === 'resolved' ? 'green' : 'grey';
  return <Badge tone={tone}>{STATUS_LABEL[status]}</Badge>;
}

export function PriorityBadge({ priority }: { priority: GrievanceRow['priority'] }) {
  const tone = priority === 'critical' ? 'red' : priority === 'high' ? 'amber' : 'grey';
  return <Badge tone={tone}>{priorityLabel(priority)}</Badge>;
}

export function SlaBadge({ g }: { g: Pick<GrievanceRow, 'status' | 'sla_due_at' | 'closed_at' | 'created_at'> }) {
  const s = slaState(g);
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

const KIND_LABEL: Record<GrievanceEvent['kind'], string> = {
  created: 'Raised', comment: 'Message', status: 'Update', assigned: 'Assigned', resolution: 'Resolution', ai: 'AI',
};

export function Timeline({ events, who }: { events: GrievanceEvent[]; who: (e: GrievanceEvent) => string }) {
  if (events.length === 0) return <p className="text-sm text-stone-600">Nothing yet.</p>;
  return (
    <ol className="space-y-3">
      {events.map((e) => (
        <li key={e.id} className={`rounded-md border p-3 text-sm ${e.internal ? 'border-amber-200 bg-amber-50' : 'border-stone-200 bg-white'}`}>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone-500">
            <span className="font-semibold uppercase tracking-wide">{KIND_LABEL[e.kind]}</span>
            <span>{who(e)}</span>
            <span>{dateTime(e.at)}</span>
            {e.internal && <Badge tone="amber">Internal note, not shown to the employee</Badge>}
          </div>
          <p className="mt-1 whitespace-pre-wrap text-stone-800">{e.body}</p>
        </li>
      ))}
    </ol>
  );
}
