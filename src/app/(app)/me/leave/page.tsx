import { as, requireEmployee } from '@/lib/auth';
import { ApplyLeaveForm, BalanceCards, LeaveItem } from '@/components/leave';
import { Card, Flash, PageHeader } from '@/components/ui';
import { dmy } from '@/lib/format';
import { employeeBalances, LEAVE_ROW_SQL, type LeaveRow } from '@/lib/leave-db';
import { todayIso } from '@/lib/payroll/period';

export const metadata = { title: 'My leave' };

export default async function MyLeavePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireEmployee();
  const today = todayIso();
  const year = Number(today.slice(0, 4));
  const data = await as(user, async (sql) => {
    const balances = await employeeBalances(sql, user.clientId, user.employeeId, year);
    const mine = await sql<LeaveRow>(`${LEAVE_ROW_SQL} where r.employee_id = $1 order by r.from_date desc limit 40`, [user.employeeId]);
    const team = await sql<LeaveRow>(
      `${LEAVE_ROW_SQL} where e.manager_id = $1 and (r.status = 'pending' or (r.status = 'approved' and r.to_date >= $2)) order by r.status desc, r.from_date`,
      [user.employeeId, today],
    );
    const holidays = await sql<{ day: string; name: string }>('select day, name from holidays where client_id = $1 and day >= $2 order by day limit 8', [user.clientId, today]);
    return { balances, mine, team, holidays };
  });
  const teamPending = data.team.filter((r) => r.status === 'pending');
  const teamUpcoming = data.team.filter((r) => r.status === 'approved');
  return (
    <div className="space-y-5">
      <PageHeader title="Leave" subtitle={`Balances for ${year}`} />
      <Flash params={await searchParams} />
      <BalanceCards balances={data.balances} />

      {(teamPending.length > 0 || teamUpcoming.length > 0) && (
        <Card title={`My team: waiting for my approval (${teamPending.length})`}>
          {teamPending.length === 0 ? (
            <p className="text-sm text-stone-600">Nothing is waiting for you.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {teamPending.map((r) => <LeaveItem key={r.id} row={r} back="/me/leave" showName canDecide canCancel={false} />)}
            </ul>
          )}
          {teamUpcoming.length > 0 && (
            <>
              <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-stone-500">Approved and coming up</h3>
              <ul className="divide-y divide-stone-100">
                {teamUpcoming.map((r) => <LeaveItem key={r.id} row={r} back="/me/leave" showName canDecide={false} canCancel={false} />)}
              </ul>
            </>
          )}
        </Card>
      )}

      <Card title="Apply for leave">
        <ApplyLeaveForm clientId={user.clientId} back="/me/leave" types={data.balances.map((b) => ({ id: b.typeId, name: b.name, paid: b.paid }))} />
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="My requests" className="lg:col-span-2">
          {data.mine.length === 0 ? (
            <p className="text-sm text-stone-600">You have not applied for any leave yet.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {data.mine.map((r) => <LeaveItem key={r.id} row={r} back="/me/leave" showName={false} canDecide={false} canCancel={r.status === 'pending'} />)}
            </ul>
          )}
        </Card>
        <Card title="Coming holidays">
          {data.holidays.length === 0 ? (
            <p className="text-sm text-stone-600">No holidays listed yet.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {data.holidays.map((h) => <li key={h.day}><span className="tabular-nums text-stone-600">{dmy(h.day)}</span> · {h.name}</li>)}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
