import type { DayMark } from '@/lib/attendance';

const MARK_STYLE: Record<DayMark, string> = {
  P: 'bg-emerald-100 text-emerald-800',
  HD: 'bg-amber-100 text-amber-900',
  A: 'bg-red-100 text-red-800',
  L: 'bg-sky-100 text-sky-800',
  H: 'bg-stone-200 text-stone-600',
  WO: 'bg-stone-100 text-stone-400',
  '': 'text-stone-300',
};

export function Mark({ mark }: { mark: DayMark }) {
  return (
    <span className={`inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded px-0.5 text-[10px] font-semibold ${MARK_STYLE[mark]}`}>
      {mark || '·'}
    </span>
  );
}

export function MarkLegend() {
  const items: [DayMark, string][] = [['P', 'Present'], ['HD', 'Half day'], ['A', 'Absent'], ['L', 'Leave'], ['H', 'Holiday'], ['WO', 'Weekly off']];
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-600">
      {items.map(([m, label]) => <span key={m} className="inline-flex items-center gap-1.5"><Mark mark={m} /> {label}</span>)}
    </div>
  );
}
