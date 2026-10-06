'use server';

import { as, requireFirm } from '../auth';
import { UserError } from '../db';
import { fillTemplate, lintTemplate, placeholderLabel, placeholdersIn, BLOCK_PLACEHOLDERS } from '../letters/template';
import { salaryRows, standardValues } from '../letters/values';
import type { Components } from '../payroll/types';
import { isIsoDate } from '../validate';
import { bool, FormError, isUuid, run, str } from './util';

export async function createDocumentAction(form: FormData): Promise<void> {
  const user = await requireFirm();
  const clientId = str(form, 'client_id');
  const employeeId = str(form, 'employee_id');
  const templateId = str(form, 'template_id');
  if (!isUuid(clientId) || !isUuid(employeeId) || !isUuid(templateId)) return;
  const back = `/c/${clientId}/letters/new?employee=${employeeId}&template=${templateId}`;
  await run(back, async () => {
    const letterDate = str(form, 'letter_date');
    if (!isIsoDate(letterDate)) throw new FormError('Enter the date for the letter.');
    const title = str(form, 'doc_title');
    if (!title) throw new FormError('Give the letter a title.');
    const id = await as(user, async (sql) => {
      const template = await sql.one<{ name: string; body: string }>(
        'select name, body from letter_templates where id = $1 and (client_id is null or client_id = $2)',
        [templateId, clientId],
      );
      if (!template) throw new UserError('Template not found.');
      const employee = await sql.one<{
        full_name: string; emp_code: string; father_name: string; gender: 'M' | 'F' | 'O'; designation: string; department: string;
        location: string; doj: string; exit_date: string | null; address: string; email: string;
      }>(
        `select full_name, emp_code, father_name, gender, designation, department, location, doj, exit_date, address, email
           from employees where id = $1 and client_id = $2`,
        [employeeId, clientId],
      );
      if (!employee) throw new UserError('Employee not found.');
      const client = await sql.one<{ name: string; legal_name: string; address: string }>('select name, legal_name, address from clients where id = $1', [clientId]);
      const structure = await sql.one<Components>(
        `select basic, da, hra, conveyance, medical, special, lta, other from salary_structures
          where employee_id = $1 order by effective_from desc limit 1`,
        [employeeId],
      );
      const values = standardValues({ letterDate, refNo: str(form, 'ph_ref_no'), employee, client: client!, structure });
      // Whatever was typed on the form wins over the value from the records.
      for (const key of placeholdersIn(template.body)) {
        if (BLOCK_PLACEHOLDERS.has(key)) continue;
        const typed = str(form, `ph_${key}`);
        if (typed) values[key] = typed;
        else if (form.has(`ph_${key}`)) delete values[key];
      }
      const filled = fillTemplate(template.body, values);
      if (filled.missing.length > 0) {
        throw new UserError(`Fill in: ${filled.missing.map(placeholderLabel).join(', ')}.`);
      }
      const row = await sql.one<{ id: string }>(
        `insert into documents (client_id, employee_id, title, ref_no, template_id, body, data, letter_date, visible_to_employee, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
        [clientId, employeeId, title, values.ref_no ?? '', templateId, filled.text,
         JSON.stringify({ salaryRows: salaryRows(structure) }), letterDate, bool(form, 'visible_to_employee'), user.id],
      );
      await sql('select audit($1, $2, $3, $4, $5)', ['letter.create', 'document', row!.id, clientId, JSON.stringify({ template: template.name, employee: employee.emp_code })]);
      return row!.id;
    });
    return { to: `/c/${clientId}/letters?made=${id}`, msg: `${title} created.` };
  });
}

export async function deleteDocumentAction(form: FormData): Promise<void> {
  const user = await requireFirm();
  const clientId = str(form, 'client_id');
  const id = str(form, 'id');
  if (!isUuid(clientId) || !isUuid(id)) return;
  await run(`/c/${clientId}/letters`, async () => {
    await as(user, async (sql) => {
      const rows = await sql('delete from documents where id = $1 and client_id = $2 returning id', [id, clientId]);
      if (rows.length === 0) throw new UserError('Letter not found.');
      await sql('select audit($1, $2, $3, $4, $5)', ['letter.delete', 'document', id, clientId, '{}']);
    });
    return { to: `/c/${clientId}/letters`, msg: 'Letter deleted.' };
  });
}

export async function toggleDocumentSharingAction(form: FormData): Promise<void> {
  const user = await requireFirm();
  const clientId = str(form, 'client_id');
  const id = str(form, 'id');
  if (!isUuid(clientId) || !isUuid(id)) return;
  await run(`/c/${clientId}/letters`, async () => {
    const row = await as(user, async (sql) => {
      const r = await sql.one<{ visible_to_employee: boolean }>(
        'update documents set visible_to_employee = not visible_to_employee where id = $1 and client_id = $2 returning visible_to_employee',
        [id, clientId],
      );
      if (!r) throw new UserError('Letter not found.');
      await sql('select audit($1, $2, $3, $4, $5)', ['letter.share', 'document', id, clientId, JSON.stringify({ shared: r.visible_to_employee })]);
      return r;
    });
    return { to: `/c/${clientId}/letters`, msg: row.visible_to_employee ? 'The employee can now see this letter.' : 'The employee can no longer see this letter.' };
  });
}

export async function saveTemplateAction(form: FormData): Promise<void> {
  const user = await requireFirm();
  const id = str(form, 'id');
  const back = id && isUuid(id) ? `/templates/${id}` : '/templates/new';
  await run(back, async () => {
    const name = str(form, 'name');
    const kind = str(form, 'kind') || 'other';
    const clientId = str(form, 'client_id');
    const raw = form.get('body');
    const body = typeof raw === 'string' ? raw.replace(/\r\n/g, '\n').trimEnd() : '';
    if (!name || name.length > 80) throw new FormError('Give the template a name of up to 80 characters.');
    if (!body.trim()) throw new FormError('The template is empty.');
    if (body.length > 60000) throw new FormError('The template is too long.');
    if (clientId && !isUuid(clientId)) throw new FormError('Choose a client from the list.');
    const blocking = lintTemplate(body).filter((p) => p.message.includes('Unfinished') || p.message.includes('line by itself'));
    if (blocking.length > 0) throw new FormError(`Line ${blocking[0].line}: ${blocking[0].message}`);
    const savedId = await as(user, async (sql) => {
      if (id && isUuid(id)) {
        const rows = await sql(
          'update letter_templates set name=$2, kind=$3, client_id=$4, body=$5, active=$6 where id=$1 returning id',
          [id, name, kind, clientId || null, body, bool(form, 'active')],
        );
        if (rows.length === 0) throw new UserError('Template not found.');
        await sql('select audit($1, $2, $3, $4, $5)', ['template.update', 'template', id, clientId || null, JSON.stringify({ name })]);
        return id;
      }
      const row = await sql.one<{ id: string }>(
        'insert into letter_templates (name, kind, client_id, body, created_by) values ($1,$2,$3,$4,$5) returning id',
        [name, kind, clientId || null, body, user.id],
      );
      await sql('select audit($1, $2, $3, $4, $5)', ['template.create', 'template', row!.id, clientId || null, JSON.stringify({ name })]);
      return row!.id;
    });
    return { to: `/templates/${savedId}`, msg: 'Template saved.' };
  });
}
