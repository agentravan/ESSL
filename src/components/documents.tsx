import { deleteDocumentFileAction, uploadDocumentAction, verifyDocumentAction } from '@/lib/actions/documents';
import { DOCUMENT_KINDS, DOCUMENT_STATUS_LABEL, DOCUMENT_STATUS_TONE, documentKindLabel, type DocumentRow } from '@/lib/documents';
import { dateTime } from '@/lib/format';
import { Badge } from './ui';
import { SubmitButton } from './client';

export function UploadDocumentForm({ back, employees }: { back: string; employees?: { id: string; emp_code: string; full_name: string }[] }) {
  return (
    <form action={uploadDocumentAction} className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <input type="hidden" name="back" value={back} />
      {employees && (
        <div>
          <label htmlFor="doc_employee" className="mb-1 block text-sm font-medium text-stone-700">Employee</label>
          <select id="doc_employee" name="employee_id" required className="input" defaultValue="">
            <option value="">Choose…</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.emp_code} · {e.full_name}</option>)}
          </select>
        </div>
      )}
      <div>
        <label htmlFor="doc_kind" className="mb-1 block text-sm font-medium text-stone-700">What is it?</label>
        <select id="doc_kind" name="kind" required className="input">
          {DOCUMENT_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="doc_file" className="mb-1 block text-sm font-medium text-stone-700">File (PDF, JPG or PNG, up to 3 MB)</label>
        <input id="doc_file" name="file" type="file" required accept=".pdf,.jpg,.jpeg,.png" className="input file:mr-3 file:rounded file:border-0 file:bg-stone-100 file:px-3 file:py-1 file:text-sm" />
      </div>
      <SubmitButton pendingText="Uploading…">Upload</SubmitButton>
    </form>
  );
}

export function DocumentItem({ doc, back, name, canVerify, canDelete }: {
  doc: DocumentRow;
  back: string;
  name?: string;
  canVerify: boolean;
  canDelete: boolean;
}) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
      <div className="min-w-0">
        <div className="font-medium text-stone-900">
          {name && <>{name} · </>}
          {documentKindLabel(doc.kind)} <Badge tone={DOCUMENT_STATUS_TONE[doc.status]}>{DOCUMENT_STATUS_LABEL[doc.status]}</Badge>
        </div>
        <div className="text-stone-600">
          <a href={`/api/file/${doc.id}`} target="_blank" rel="noopener" className="link">{doc.file_name}</a>
          <span className="text-stone-500"> · {Math.max(1, Math.round(doc.size_bytes / 1024))} KB · {dateTime(doc.uploaded_at)}</span>
        </div>
        {doc.note && <div className="text-stone-500">HR note: {doc.note}</div>}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        {canVerify && (
          <form action={verifyDocumentAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="id" value={doc.id} />
            <input type="hidden" name="back" value={back} />
            <input name="note" aria-label="Note" placeholder="Note (needed to reject)" maxLength={200} defaultValue={doc.note} className="input w-48" />
            {doc.status !== 'verified' && <SubmitButton name="decision" value="verified" className="btn-primary" pendingText="Saving…">Verify</SubmitButton>}
            {doc.status !== 'rejected' && <SubmitButton name="decision" value="rejected" className="btn-danger" pendingText="Saving…">Reject</SubmitButton>}
          </form>
        )}
        {canDelete && (
          <form action={deleteDocumentFileAction}>
            <input type="hidden" name="id" value={doc.id} />
            <input type="hidden" name="back" value={back} />
            <SubmitButton className="btn-secondary" pendingText="Removing…">Remove</SubmitButton>
          </form>
        )}
      </div>
    </li>
  );
}
