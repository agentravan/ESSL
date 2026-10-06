import Link from 'next/link';
import { as, requireFirm } from '@/lib/auth';
import { getClient } from '@/lib/clients';
import { createDocumentAction } from '@/lib/actions/letters';
import { isUuid } from '@/lib/actions/util';
import { SubmitButton } from '@/components/client';
import { Card, CheckField, Flash, Notice, PageHeader, TextField } from '@/components/ui';
import { BLOCK_PLACEHOLDERS, KNOWN_PLACEHOLDERS, placeholderLabel, placeholdersIn } from '@/lib/letters/template';
import { standardValues } from '@/lib/letters/values';
import { todayIso } from '@/lib/payroll/period';
import type { Components } from '@/lib/payroll/types';

export const metadata = { title: 'New letter' };

export default async function NewLetterPage({ params, searchParams }: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { clientId } = await params;
  const sp = await searchParams;
  const user = await requireFirm();
  const client = await getClient(user, clientId);
  const employeeId = sp.employee && isUuid(sp.employee) ? sp.employee : '';
  const templateId = sp.template && isUuid(sp.template) ? sp.template : '';
  const today = todayIso();

  const data = await as(user, async (sql) => {
    const employees = await sql<{ id: string; emp_code: string; full_name: string }>(
      "select id, emp_code, full_name from employees where client_id = $1 order by (status = 'exited'), emp_code",
      [client.id],
    );
    const templates = await sql<{ id: string; name: string; client_id: string | null }>(
      'select id, name, client_id from letter_templates where active and (client_id is null or client_id = $1) order by (client_id is null), name',
      [client.id],
    );
    if (!employeeId || !templateId) return { employees, templates, step2: null };
    const template = await sql.one<{ id: string; name: string; body: string }>(
      'select id, name, body from letter_templates where id = $1 and (client_id is null or client_id = $2)',
      [templateId, client.id],
    );
    const employee = await sql.one<{
      id: string; full_name: string; emp_code: string; father_name: string; gender: 'M' | 'F' | 'O'; designation: string; department: string;
      location: string; doj: string; exit_date: string | null; address: string; email: string;
    }>(
      `select id, full_name, emp_code, father_name, gender, designation, department, location, doj, exit_date, address, email
         from employees where id = $1 and client_id = $2`,
      [employeeId, client.id],
    );
    if (!template || !employee) return { employees, templates, step2: null };
    const structure = await sql.one<Components>(
      'select basic, da, hra, conveyance, medical, special, lta, other from salary_structures where employee_id = $1 order by effective_from desc limit 1',
      [employeeId],
    );
    const count = await sql.one<{ n: number }>('select count(*) as n from documents where client_id = $1', [client.id]);
    return { employees, templates, step2: { template, employee, structure, seq: (count?.n ?? 0) + 1 } };
  });

  const base = `/c/${client.id}/letters`;
  if (!data.step2) {
    return (
      <div className="max-w-2xl">
        <PageHeader title="New letter" back={{ href: base, label: 'Letters' }} />
        <Flash params={sp} />
        <Card title="Step 1 of 2: choose the employee and the template">
          {data.employees.length === 0 ? (
            <p className="text-sm text-stone-600">Add an employee first.</p>
          ) : (
            <form className="space-y-4">
              <div>
                <label htmlFor="employee" className="mb-1 block text-sm font-medium text-stone-700">Employee</label>
                <select id="employee" name="employee" required defaultValue={employeeId} className="input">
                  <option value="">Choose…</option>
                  {data.employees.map((e) => <option key={e.id} value={e.id}>{e.emp_code} · {e.full_name}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="template" className="mb-1 block text-sm font-medium text-stone-700">Template</label>
                <select id="template" name="template" required defaultValue={templateId} className="input">
                  <option value="">Choose…</option>
                  {data.templates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.client_id ? ' (this client only)' : ''}</option>)}
                </select>
                <p className="mt-1 text-xs text-stone-500">Templates are managed under <Link href="/templates" className="link">Letter templates</Link>.</p>
              </div>
              <button type="submit" className="btn-primary">Continue</button>
            </form>
          )}
        </Card>
      </div>
    );
  }

  const { template, employee, structure, seq } = data.step2;
  const refNo = `${client.code}/HR/${today.slice(0, 4)}/${String(seq).padStart(3, '0')}`;
  const values = standardValues({ letterDate: today, refNo, employee, client, structure });
  const keys = placeholdersIn(template.body).filter((k) => !BLOCK_PLACEHOLDERS.has(k) && k !== 'letter_date');
  const usesSalaryTable = placeholdersIn(template.body).includes('salary_table');
  const known = new Set(KNOWN_PLACEHOLDERS.map((p) => p.key));
  return (
    <div className="max-w-3xl">
      <PageHeader title={`${template.name} for ${employee.full_name}`} back={{ href: `${base}/new`, label: 'Choose again' }} />
      <Flash params={sp} />
      {usesSalaryTable && !structure && (
        <div className="mb-4"><Notice tone="warn">This template includes the salary table, but this employee has no salary structure yet.</Notice></div>
      )}
      <form action={createDocumentAction} className="space-y-4">
        <input type="hidden" name="client_id" value={client.id} />
        <input type="hidden" name="employee_id" value={employee.id} />
        <input type="hidden" name="template_id" value={template.id} />
        <Card title="Step 2 of 2: check the details that will be printed">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Title of this letter" name="doc_title" defaultValue={template.name} required maxLength={120} />
            <TextField label="Date on the letter" name="letter_date" type="date" defaultValue={today} required />
            {keys.map((k) => (
              <TextField
                key={k}
                label={placeholderLabel(k)}
                name={`ph_${k}`}
                defaultValue={values[k] ?? ''}
                required
                maxLength={300}
                hint={!known.has(k) ? 'Extra field used by this template.' : values[k] ? undefined : 'Not on file: type it here.'}
              />
            ))}
          </div>
          <div className="mt-4">
            <CheckField label="Let the employee see this letter when they sign in" name="visible_to_employee" />
          </div>
        </Card>
        <SubmitButton pendingText="Creating…">Create letter</SubmitButton>
      </form>
    </div>
  );
}
