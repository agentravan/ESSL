import { as, requireAdmin } from '@/lib/auth';
import { saveFirmAction, toggleUserActiveAction } from '@/lib/actions/admin';
import { SubmitButton } from '@/components/client';
import { ResetPassword } from '@/components/employee-client';
import { CreateUserForm } from '@/components/user-client';
import { Badge, Card, Flash, PageHeader, TextField } from '@/components/ui';
import { dateTime } from '@/lib/format';

export const metadata = { title: 'Logins' };

const ROLE = { firm_admin: 'Administrator', firm_staff: 'Office staff', client_hr: 'Client HR', employee: 'Employee' } as const;

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireAdmin();
  const data = await as(user, async (sql) => {
    const users = await sql<{ id: string; email: string; full_name: string; role: keyof typeof ROLE; active: boolean; last_login_at: Date | null; client_name: string | null; must_change_password: boolean }>(
      `select u.id, u.email, u.full_name, u.role, u.active, u.last_login_at, u.must_change_password, c.name as client_name
         from users u left join clients c on c.id = u.client_id
        order by case u.role when 'firm_admin' then 1 when 'firm_staff' then 2 when 'client_hr' then 3 else 4 end, c.name nulls first, u.full_name`,
    );
    const clients = await sql<{ id: string; name: string }>('select id, name from clients where active order by name');
    const firm = await sql.one<{ firm_name: string; address: string; phone: string; email: string }>('select firm_name, address, phone, email from firm_settings where id = 1');
    return { users, clients, firm };
  });
  return (
    <div className="space-y-5">
      <PageHeader title="Logins" subtitle="Who can sign in, and what each person can see." />
      <Flash params={await searchParams} />
      <Card title="Add a login">
        <CreateUserForm clients={data.clients} />
        <p className="mt-3 text-xs text-stone-500">Employee logins are created from the employee's own page, so each one is tied to the right record.</p>
      </Card>
      <div className="card overflow-x-auto">
        <table className="min-w-full divide-y divide-stone-200">
          <thead>
            <tr>
              <th className="th">Person</th>
              <th className="th">Kind</th>
              <th className="th">Client</th>
              <th className="th">Last sign-in</th>
              <th className="th"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {data.users.map((u) => (
              <tr key={u.id}>
                <td className="td">
                  <span className="font-medium">{u.full_name}</span>
                  <span className="block text-xs text-stone-500">{u.email}</span>
                </td>
                <td className="td space-x-1 whitespace-nowrap">
                  {ROLE[u.role]}
                  {!u.active && <Badge tone="red">Disabled</Badge>}
                  {u.active && u.must_change_password && <Badge tone="amber">Temporary password</Badge>}
                </td>
                <td className="td">{u.client_name ?? '–'}</td>
                <td className="td whitespace-nowrap text-stone-500">{u.last_login_at ? dateTime(u.last_login_at) : 'Never'}</td>
                <td className="td">
                  {u.id !== user.id && (
                    <div className="flex flex-wrap justify-end gap-2">
                      <ResetPassword userId={u.id} />
                      <form action={toggleUserActiveAction}>
                        <input type="hidden" name="user_id" value={u.id} />
                        <SubmitButton className={u.active ? 'btn-danger' : 'btn-secondary'} pendingText="Saving…">{u.active ? 'Disable' : 'Enable'}</SubmitButton>
                      </form>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Card title="Your office">
        <form action={saveFirmAction} className="grid gap-4 sm:grid-cols-2">
          <TextField label="Office name" name="firm_name" defaultValue={data.firm?.firm_name} required maxLength={120} />
          <TextField label="Phone" name="phone" defaultValue={data.firm?.phone} maxLength={40} />
          <TextField label="Email" name="email" type="email" defaultValue={data.firm?.email} />
          <TextField label="Address" name="address" defaultValue={data.firm?.address} maxLength={300} />
          <div className="sm:col-span-2"><SubmitButton>Save office details</SubmitButton></div>
        </form>
      </Card>
    </div>
  );
}
