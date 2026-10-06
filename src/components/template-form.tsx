import { saveTemplateAction } from '@/lib/actions/letters';
import { KNOWN_PLACEHOLDERS, lintTemplate } from '@/lib/letters/template';
import { Card, CheckField, Notice, SelectField, TextField } from './ui';
import { SubmitButton } from './client';

const KINDS = [
  { value: 'offer', label: 'Offer letter' },
  { value: 'appointment', label: 'Appointment letter' },
  { value: 'agreement', label: 'Agreement' },
  { value: 'experience', label: 'Experience or relieving letter' },
  { value: 'other', label: 'Other' },
];

export function TemplateForm({ template, clients }: {
  template?: { id: string; name: string; kind: string; client_id: string | null; body: string; active: boolean };
  clients: { id: string; name: string }[];
}) {
  const problems = template ? lintTemplate(template.body) : [];
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <form action={saveTemplateAction} className="space-y-4 lg:col-span-2">
        {template && <input type="hidden" name="id" value={template.id} />}
        <Card title="Template">
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField label="Name" name="name" defaultValue={template?.name} required maxLength={80} />
            <SelectField label="Kind" name="kind" defaultValue={template?.kind ?? 'other'} options={KINDS} />
            <SelectField
              label="Available to"
              name="client_id"
              defaultValue={template?.client_id ?? ''}
              options={[{ value: '', label: 'Every client' }, ...clients.map((c) => ({ value: c.id, label: `Only ${c.name}` }))]}
            />
          </div>
          <div className="mt-4">
            <label htmlFor="body" className="mb-1 block text-sm font-medium text-stone-700">Text of the letter</label>
            <textarea id="body" name="body" required rows={28} defaultValue={template?.body} className="input font-mono text-[13px] leading-relaxed" spellCheck />
          </div>
          {template && (
            <div className="mt-4"><CheckField label="In use" name="active" defaultChecked={template.active} hint="Untick to hide it from the list when making letters." /></div>
          )}
        </Card>
        <SubmitButton>{template ? 'Save template' : 'Create template'}</SubmitButton>
      </form>
      <div className="space-y-4">
        {problems.length > 0 && (
          <Notice tone="warn">
            <p className="font-medium">Worth checking</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {problems.map((p, i) => <li key={i}>Line {p.line}: {p.message}</li>)}
            </ul>
          </Notice>
        )}
        <Card title="How to write a template">
          <ul className="space-y-1.5 text-sm text-stone-700">
            <li><code className="rounded bg-stone-100 px-1"># Title</code> centred heading</li>
            <li><code className="rounded bg-stone-100 px-1">## Section</code> bold sub-heading</li>
            <li><code className="rounded bg-stone-100 px-1">- point</code> bullet point</li>
            <li><code className="rounded bg-stone-100 px-1">**text**</code> bold text</li>
            <li><code className="rounded bg-stone-100 px-1">===</code> on its own line: new page</li>
            <li>A blank line starts a new paragraph.</li>
          </ul>
          <p className="mt-3 text-xs text-stone-500">Letters print in English characters only. Agreement wording should be reviewed by a lawyer before use.</p>
        </Card>
        <Card title="Fields you can use">
          <p className="mb-2 text-xs text-stone-500">Type a field exactly as shown. It is filled from the records, and you can correct it before each letter is made. Any other name in double braces becomes a box you fill in each time.</p>
          <ul className="space-y-1 text-sm">
            {KNOWN_PLACEHOLDERS.map((p) => (
              <li key={p.key} className="flex flex-wrap items-baseline justify-between gap-x-2">
                <code className="rounded bg-stone-100 px-1 text-[12px]">{`{{${p.key}}}`}</code>
                <span className="text-xs text-stone-600">{p.label}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
