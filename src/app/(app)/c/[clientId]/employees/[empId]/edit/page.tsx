import { notFound } from 'next/navigation';
import { as, requireFirm } from '@/lib/auth';
import { getClient } from '@/lib/clients';
import { EMPLOYEE_COLUMNS, type Employee } from '@/lib/employees';
import { updateEmployeeAction } from '@/lib/actions/employees';
import { isUuid } from '@/lib/actions/util';
import { EmployeeForm } from '@/components/employee-form';
import { Flash, PageHeader } from '@/components/ui';

export const metadata = { title: 'Edit employee' };

export default async function EditEmployeePage({ params, searchParams }: {
  params: Promise<{ clientId: string; empId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { clientId, empId } = await params;
  const user = await requireFirm();
  const client = await getClient(user, clientId);
  if (!isUuid(empId)) notFound();
  const employee = await as(user, (sql) =>
    sql.one<Employee>(`select ${EMPLOYEE_COLUMNS} from employees where id = $1 and client_id = $2`, [empId, client.id]),
  );
  if (!employee) notFound();
  const managers = await as(user, (sql) => sql<{ id: string; emp_code: string; full_name: string }>("select id, emp_code, full_name from employees where client_id = $1 and status <> 'exited' order by emp_code", [client.id]));
  return (
    <div className="max-w-4xl">
      <PageHeader title={`Edit ${employee.full_name}`} back={{ href: `/c/${client.id}/employees/${employee.id}`, label: employee.full_name }} />
      <Flash params={await searchParams} />
      <EmployeeForm clientId={client.id} clientState={client.state} employee={employee} action={updateEmployeeAction} managers={managers} />
    </div>
  );
}
