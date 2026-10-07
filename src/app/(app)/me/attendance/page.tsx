import { as, requireEmployee } from '@/lib/auth';
import { Mark, MarkLegend } from '@/components/attendance';
import { PunchButtons } from '@/components/punch-client';
import { Card, Flash, PageHeader, Stat } from '@/components/ui';
import { hhmm, istParts } from '@/lib/attendance';
import { loadMonthAttendance } from '@/lib/attendance-db';
import { dmy } from '@/lib/format';
import { currentPeriod, isPeriod, periodLabel, todayIso } from '@/lib/payroll/period';

export const metadata = { title: 'My attendance' };

export default async function MyAttendancePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await requireEmployee();
  const period = sp.period && isPeriod(sp.period) ? sp.period : currentPeriod();
  const today = todayIso();
  const data = await as(user, async (sql) => {
    const month = await loadMonthAttendance(sql, user.clientId, period, [user.employeeId]);
    const client = await sql.one<{ office_radius_m: number | null; office_lat: number | null }>('select office_radius_m, office_lat from clients where id = $1', [user.clientId]);
    const recent = await sql<{ ts: Date; kind: 'in' | 'out' }>(
      "select ts, kind from attendance_punches where employee_id = $1 and ts > now() - interval '18 hours' order by ts desc limit 6",
      [user.employeeId],
    );
    return { month, fenced: client?.office_radius_m != null && client.office_lat != null, recent };
  });
  const me = data.month.employees[0];
  const last = data.recent[0];
  const next: 'in' | 'out' = last?.kind === 'in' ? 'out' : 'in';
  const todays = data.recent.filter((p) => istParts(p.ts).date === today).reverse();
  return (
    <div className="space-y-5">
      <PageHeader title="Attendance" subtitle={`Today is ${dmy(today)}`} />
      <Flash params={sp} />
      <Card title="Punch">
        <PunchButtons next={next} needsLocation={data.fenced} />
        <p className="mt-3 text-sm text-stone-600">
          {todays.length === 0
            ? 'No punches yet today.'
            : `Today: ${todays.map((p) => `${p.kind === 'in' ? 'in' : 'out'} ${hhmm(istParts(p.ts).minutes)}`).join(', ')}`}
        </p>
      </Card>
      {me && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Present" value={me.summary.present + me.summary.halfDays * 0.5} sub={periodLabel(period)} />
            <Stat label="Absent" value={me.summary.absent} />
            <Stat label="Leave" value={me.summary.leave} />
            <Stat label="Late arrivals" value={me.summary.lateCount} />
          </div>
          <Card title={`Day by day, ${periodLabel(period)}`}>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead><tr><th className="th">Date</th><th className="th">Status</th><th className="th">In</th><th className="th">Out</th><th className="th num">Hours</th><th className="th">Notes</th></tr></thead>
                <tbody className="divide-y divide-stone-100">
                  {me.summary.marks.filter((m) => m.mark !== '').map((m) => (
                    <tr key={m.date}>
                      <td className="td whitespace-nowrap">{dmy(m.date)}</td>
                      <td className="td"><Mark mark={m.mark} /></td>
                      <td className="td tabular-nums">{m.summary?.firstIn != null ? hhmm(m.summary.firstIn) : ''}</td>
                      <td className="td tabular-nums">{m.summary?.lastOut != null ? hhmm(m.summary.lastOut) : ''}</td>
                      <td className="td num">{m.summary?.workedMinutes ? (m.summary.workedMinutes / 60).toFixed(1) : ''}</td>
                      <td className="td text-xs text-stone-500">
                        {[m.summary?.lateMinutes ? `late by ${m.summary.lateMinutes} min` : '', m.summary?.missingOut ? 'no punch out' : '', m.summary?.overtimeMinutes ? `${(m.summary.overtimeMinutes / 60).toFixed(1)} h overtime` : ''].filter(Boolean).join(', ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3"><MarkLegend /></div>
          </Card>
        </>
      )}
    </div>
  );
}
