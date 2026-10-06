import Link from 'next/link';
import { as, requireFirm } from '@/lib/auth';
import { RuleSummary } from '@/components/rule-summary';
import { Badge, Flash, Notice, PageHeader } from '@/components/ui';
import { dmy } from '@/lib/format';
import { RULE_KIND_LABEL, type RuleKind, type RuleRow } from '@/lib/payroll/rules';
import { todayIso } from '@/lib/payroll/period';
import { stateName } from '@/lib/states';

export const metadata = { title: 'Statutory rules' };

const ORDER: RuleKind[] = ['pf', 'esi', 'tax_new', 'tax_old', 'pt'];

export default async function RulesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireFirm();
  const admin = user.role === 'firm_admin';
  const rows = await as(user, (sql) =>
    sql<RuleRow>('select id, kind, state, effective_from, effective_to, data, source, verified from statutory_rules order by kind, state, effective_from desc'),
  );
  const today = todayIso();
  const unverified = rows.filter((r) => !r.verified).length;
  return (
    <>
      <PageHeader
        title="Statutory rules"
        subtitle="The rates and limits payroll uses. Each rule applies from its start date; payroll for a month uses the rule in force on the 1st of that month."
        actions={admin ? <Link href="/rules/new" className="btn-primary">Add rule</Link> : undefined}
      />
      <Flash params={await searchParams} />
      {unverified > 0 && (
        <div className="mb-4">
          <Notice tone="warn">
            {unverified} rule(s) have not been checked against the official notification. {admin ? 'Open each one, compare the figures, and tick "Checked and correct".' : 'An administrator needs to check them.'}
          </Notice>
        </div>
      )}
      <div className="space-y-6">
        {ORDER.map((kind) => {
          const list = rows.filter((r) => r.kind === kind);
          return (
            <section key={kind}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-600">{RULE_KIND_LABEL[kind]}</h2>
              {list.length === 0 ? (
                <p className="text-sm text-stone-500">No rule on file. Payroll cannot run without one.</p>
              ) : (
                <div className="card divide-y divide-stone-100">
                  {list.map((r) => {
                    const current = r.effective_from <= today && (!r.effective_to || r.effective_to >= today);
                    return (
                      <div key={r.id} className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          {kind === 'pt' && <span className="font-semibold text-stone-900">{stateName(r.state)}</span>}
                          <span className="text-stone-700">From {dmy(r.effective_from)}{r.effective_to ? ` to ${dmy(r.effective_to)}` : ''}</span>
                          {current && <Badge tone="blue">In force today</Badge>}
                          {r.verified ? <Badge tone="green">Checked</Badge> : <Badge tone="amber">Not checked</Badge>}
                          {admin && <Link href={`/rules/${r.id}`} className="link ml-auto">Open</Link>}
                        </div>
                        <p className="mt-1 text-sm text-stone-800"><RuleSummary kind={kind} data={r.data} /></p>
                        {r.source && <p className="mt-1 text-xs text-stone-500">Source: {r.source}</p>}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
      <p className="mt-6 text-xs text-stone-500">
        Not handled by the system: labour welfare fund, gratuity, statutory bonus, senior-citizen tax slabs, and professional tax in states that
        collect it half-yearly or yearly (for example Tamil Nadu, Kerala and Madhya Pradesh). Enter those as one-off deductions on the payroll screen.
      </p>
    </>
  );
}
