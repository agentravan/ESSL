import { as, requireAdmin } from '@/lib/auth';
import { Empty, PageHeader, TableWrap } from '@/components/ui';
import { dateTime } from '@/lib/format';

export const metadata = { title: 'Activity log' };

const LABEL: Record<string, string> = {
  'login.ok': 'Signed in',
  'login.failed': 'Wrong password',
  'password.set': 'Password changed or reset',
  'client.create': 'Added client',
  'client.update': 'Changed client settings',
  'employee.create': 'Added employee',
  'employee.update': 'Changed employee details',
  'employee.import': 'Imported employees',
  'employee.reveal_ids': 'Viewed full PAN / Aadhaar / bank number',
  'salary.save': 'Saved salary structure',
  'attendance.save': 'Saved attendance',
  'attendance.import': 'Imported attendance',
  'adjustment.add': 'Added one-off pay item',
  'adjustment.delete': 'Removed one-off pay item',
  'payroll.compute': 'Calculated payroll',
  'payroll.lock': 'Locked payroll',
  'payroll.unlock': 'Unlocked payroll',
  'payroll.delete_draft': 'Deleted draft payroll',
  'letter.create': 'Made a letter',
  'letter.delete': 'Deleted a letter',
  'letter.share': 'Changed letter sharing',
  'template.create': 'Added letter template',
  'template.update': 'Changed letter template',
  'rule.create': 'Added statutory rule',
  'rule.update': 'Changed statutory rule',
  'user.create': 'Created login',
  'user.enable': 'Enabled login',
  'user.disable': 'Disabled login',
};

export default async function AuditPage() {
  const user = await requireAdmin();
  const rows = await as(user, (sql) =>
    sql<{ id: number; at: Date; action: string; entity_id: string; detail: Record<string, unknown>; who: string | null; client: string | null }>(
      `select a.id, a.at, a.action, a.entity_id, a.detail, u.full_name as who, c.name as client
         from audit_log a left join users u on u.id = a.user_id left join clients c on c.id = a.client_id
        order by a.id desc limit 300`,
    ),
  );
  return (
    <>
      <PageHeader title="Activity log" subtitle="The last 300 actions. Entries cannot be edited or deleted." />
      {rows.length === 0 ? (
        <Empty>Nothing recorded yet.</Empty>
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <th className="th">When</th>
              <th className="th">Who</th>
              <th className="th">What</th>
              <th className="th">Client</th>
              <th className="th">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((r) => {
              const detail = Object.entries(r.detail ?? {})
                .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
                .join(', ');
              return (
                <tr key={r.id}>
                  <td className="td whitespace-nowrap text-stone-500">{dateTime(r.at)}</td>
                  <td className="td">{r.who ?? '–'}</td>
                  <td className="td">{LABEL[r.action] ?? r.action}</td>
                  <td className="td">{r.client ?? '–'}</td>
                  <td className="td max-w-xs truncate text-xs text-stone-500" title={detail}>{detail}</td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      )}
    </>
  );
}
