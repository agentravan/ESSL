import { notFound } from 'next/navigation';
import { as, requireAdmin } from '@/lib/auth';
import { saveRuleAction } from '@/lib/actions/admin';
import { isUuid } from '@/lib/actions/util';
import { SubmitButton } from '@/components/client';
import { RuleSummary } from '@/components/rule-summary';
import { Card, CheckField, Flash, PageHeader, SelectField, TextField } from '@/components/ui';
import { RULE_KIND_LABEL, type RuleKind, type RuleRow } from '@/lib/payroll/rules';
import { STATES } from '@/lib/states';

export const metadata = { title: 'Statutory rule' };

export default async function RulePage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireAdmin();
  const isNew = id === 'new';
  const sourceId = isNew ? sp.copy : id;
  let rule: RuleRow | null = null;
  if (sourceId) {
    if (!isUuid(sourceId)) notFound();
    rule = await as(user, (sql) =>
      sql.one<RuleRow>('select id, kind, state, effective_from, effective_to, data, source, verified from statutory_rules where id = $1', [sourceId]),
    );
    if (!rule && !isNew) notFound();
  }
  const kinds = (Object.keys(RULE_KIND_LABEL) as RuleKind[]).map((k) => ({ value: k, label: RULE_KIND_LABEL[k] }));
  return (
    <div className="max-w-3xl">
      <PageHeader
        title={isNew ? 'Add rule' : `${RULE_KIND_LABEL[rule!.kind]} rule`}
        subtitle={isNew ? 'When a rate or limit changes, add a new rule with its start date. Do not overwrite the old one: past months still need it.' : undefined}
        back={{ href: '/rules', label: 'Statutory rules' }}
      />
      <Flash params={sp} />
      {rule && !isNew && (
        <div className="mb-4 rounded-md bg-stone-100 px-4 py-3 text-sm text-stone-800"><RuleSummary kind={rule.kind} data={rule.data} /></div>
      )}
      <form action={saveRuleAction} className="space-y-4">
        {!isNew && <input type="hidden" name="id" value={rule!.id} />}
        {isNew && sp.copy && <input type="hidden" name="copy" value={sp.copy} />}
        <Card title="Rule">
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField label="Kind" name="kind" defaultValue={rule?.kind ?? 'pf'} options={kinds} />
            <SelectField label="State (professional tax only)" name="state" defaultValue={rule?.state ?? ''} options={[{ value: '', label: 'Not applicable' }, ...STATES.map((s) => ({ value: s.code, label: s.name }))]} />
            <TextField label="Starts on" name="effective_from" type="date" required defaultValue={isNew ? '' : rule?.effective_from} />
            <TextField label="Ends on" name="effective_to" type="date" defaultValue={isNew ? '' : rule?.effective_to ?? ''} hint="Leave blank if it is still in force." />
          </div>
          <div className="mt-4">
            <label htmlFor="data" className="mb-1 block text-sm font-medium text-stone-700">Values</label>
            <textarea id="data" name="data" required rows={14} spellCheck={false} defaultValue={rule ? JSON.stringify(rule.data, null, 2) : ''} className="input font-mono text-[13px]" />
            <p className="mt-1 text-xs text-stone-500">Change only the numbers. Rates are in percent. Keep the names, quotes, commas and brackets as they are.</p>
          </div>
          <div className="mt-4">
            <TextField label="Source" name="source" defaultValue={isNew ? '' : rule?.source} maxLength={400} hint="Notification number and date, so the next person can check it." />
          </div>
          <div className="mt-4">
            <CheckField label="Checked and correct" name="verified" defaultChecked={!isNew && rule?.verified} hint="Tick only after comparing these figures with the official notification." />
          </div>
        </Card>
        <div className="flex flex-wrap gap-3">
          <SubmitButton>{isNew ? 'Add rule' : 'Save rule'}</SubmitButton>
          {!isNew && <a href={`/rules/new?copy=${rule!.id}`} className="btn-secondary">Copy as a new rule</a>}
        </div>
      </form>
    </div>
  );
}
