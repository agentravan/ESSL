'use server';

import { as, isFirm, requireUser } from '../auth';
import { encryptBytes } from '../crypto';
import { UserError } from '../db';
import { DOCUMENT_KINDS, MAX_DOCUMENT_BYTES, sniffFileType } from '../documents';
import { FormError, isUuid, run, str } from './util';

function safeBack(form: FormData, fallback: string): string {
  const back = str(form, 'back');
  return back.startsWith('/c/') || back.startsWith('/me') ? back : fallback;
}

/** Upload by the employee for themselves, or by HR on the employee's behalf. Files are encrypted before they are stored. */
export async function uploadDocumentAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const back = safeBack(form, '/me/documents');
  await run(back, async () => {
    const kind = str(form, 'kind');
    if (!DOCUMENT_KINDS.some((k) => k.key === kind)) throw new FormError('Choose what this document is.');
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) throw new FormError('Choose a file.');
    if (file.size > MAX_DOCUMENT_BYTES) throw new FormError('The file is larger than 3 MB. Scan at a lower quality or upload a smaller photo.');
    const bytes = Buffer.from(await file.arrayBuffer());
    const mime = sniffFileType(bytes);
    if (!mime) throw new FormError('Only PDF, JPG and PNG files are accepted.');
    const onBehalf = isFirm(user) || user.role === 'client_hr';
    const employeeId = onBehalf ? str(form, 'employee_id') : user.employeeId ?? '';
    if (!isUuid(employeeId)) throw new FormError('Choose the employee.');
    const name = file.name.replace(/[^\w.\- ()]+/g, '_').slice(-120) || 'document';
    await as(user, async (sql) => {
      const emp = await sql.one<{ client_id: string }>('select client_id from employees where id = $1', [employeeId]);
      if (!emp) throw new UserError('Employee not found.');
      const count = await sql.one<{ n: number }>('select count(*) as n from employee_documents where employee_id = $1', [employeeId]);
      if (count && count.n >= 30) throw new UserError('There are already 30 documents for this employee. Remove old ones first.');
      await sql(
        `insert into employee_documents (client_id, employee_id, kind, file_name, mime, size_bytes, content, uploaded_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [emp.client_id, employeeId, kind, name, mime, bytes.length, encryptBytes(bytes), user.id],
      );
      await sql('select audit($1, $2, $3, $4, $5)', ['document.upload', 'employee', employeeId, emp.client_id, JSON.stringify({ kind })]);
    });
    return { to: back, msg: 'Document uploaded.' };
  });
}

export async function verifyDocumentAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const back = safeBack(form, '/');
  await run(back, async () => {
    if (!isFirm(user) && user.role !== 'client_hr') throw new UserError('Only HR can verify documents.');
    const id = str(form, 'id');
    const decision = str(form, 'decision');
    if (!isUuid(id) || !['verified', 'rejected', 'uploaded'].includes(decision)) throw new FormError('Document not found.');
    const note = str(form, 'note').slice(0, 200);
    if (decision === 'rejected' && !note) throw new FormError('Say why the document is rejected, so the employee knows what to upload instead.');
    await as(user, async (sql) => {
      const row = await sql.one<{ client_id: string; employee_id: string }>(
        `update employee_documents set status = $2, note = $3, verified_by = $4, verified_at = now() where id = $1 returning client_id, employee_id`,
        [id, decision, note, user.id],
      );
      if (!row) throw new UserError('Document not found.');
      await sql('select audit($1, $2, $3, $4, $5)', [`document.${decision}`, 'employee', row.employee_id, row.client_id, '{}']);
    });
    return { to: back, msg: decision === 'verified' ? 'Marked as verified.' : decision === 'rejected' ? 'Marked as rejected.' : 'Moved back to waiting.' };
  });
}

export async function deleteDocumentFileAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const back = safeBack(form, '/me/documents');
  await run(back, async () => {
    const id = str(form, 'id');
    if (!isUuid(id)) throw new FormError('Document not found.');
    await as(user, async (sql) => {
      const rows = await sql('delete from employee_documents where id = $1 returning id', [id]);
      if (rows.length === 0) throw new UserError('This document cannot be removed (verified documents stay on file).');
    });
    return { to: back, msg: 'Document removed.' };
  });
}
