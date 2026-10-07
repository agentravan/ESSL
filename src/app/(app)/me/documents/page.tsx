import { as, requireEmployee } from '@/lib/auth';
import { DocumentItem, UploadDocumentForm } from '@/components/documents';
import { Badge, Card, Flash, PageHeader } from '@/components/ui';
import { DOCUMENT_COLUMNS, DOCUMENT_KINDS, type DocumentRow } from '@/lib/documents';

export const metadata = { title: 'My documents' };

export default async function MyDocumentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireEmployee();
  const docs = await as(user, (sql) =>
    sql<DocumentRow>(`select ${DOCUMENT_COLUMNS} from employee_documents d where d.employee_id = $1 order by d.uploaded_at desc`, [user.employeeId]),
  );
  const state = (kind: string) => {
    const mine = docs.filter((d) => d.kind === kind);
    if (mine.some((d) => d.status === 'verified')) return <Badge tone="green">Verified</Badge>;
    if (mine.some((d) => d.status === 'uploaded')) return <Badge tone="amber">Waiting for HR</Badge>;
    if (mine.some((d) => d.status === 'rejected')) return <Badge tone="red">Rejected: upload again</Badge>;
    return <Badge>Not uploaded</Badge>;
  };
  return (
    <div className="space-y-5">
      <PageHeader title="My documents" subtitle="Upload the documents HR needs for your joining. Only you, your HR and the payroll office can open them." />
      <Flash params={await searchParams} />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Checklist">
          <ul className="space-y-2 text-sm">
            {DOCUMENT_KINDS.filter((k) => k.key !== 'other').map((k) => (
              <li key={k.key} className="flex items-start justify-between gap-2">
                <span>
                  {k.label}{k.required ? '' : <span className="text-stone-500"> (if you have it)</span>}
                  {k.hint && <span className="block text-xs text-stone-500">{k.hint}</span>}
                </span>
                {state(k.key)}
              </li>
            ))}
          </ul>
        </Card>
        <div className="space-y-5 lg:col-span-2">
          <Card title="Upload a document">
            <UploadDocumentForm back="/me/documents" />
          </Card>
          <Card title="What I have uploaded">
            {docs.length === 0 ? (
              <p className="text-sm text-stone-600">Nothing uploaded yet.</p>
            ) : (
              <ul className="divide-y divide-stone-100">
                {docs.map((d) => <DocumentItem key={d.id} doc={d} back="/me/documents" canVerify={false} canDelete={d.status !== 'verified'} />)}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
