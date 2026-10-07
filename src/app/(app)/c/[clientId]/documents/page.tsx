import Link from 'next/link';
import { as, isFirm, requireClientAccess } from '@/lib/auth';
import { getClient } from '@/lib/clients';
import { DocumentItem, UploadDocumentForm } from '@/components/documents';
import { Badge, Card, Flash } from '@/components/ui';
import { DOCUMENT_COLUMNS, DOCUMENT_KINDS, type DocumentRow } from '@/lib/documents';

export const metadata = { title: 'Documents' };

export default async function ClientDocumentsPage({ params, searchParams }: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { clientId } = await params;
  const user = await requireClientAccess(clientId);
  const client = await getClient(user, clientId);
  const data = await as(user, async (sql) => {
    const docs = await sql<DocumentRow & { full_name: string; emp_code: string }>(
      `select ${DOCUMENT_COLUMNS}, e.full_name, e.emp_code from employee_documents d join employees e on e.id = d.employee_id
        where d.client_id = $1 order by (d.status = 'uploaded') desc, d.uploaded_at desc limit 400`,
      [client.id],
    );
    const employees = await sql<{ id: string; emp_code: string; full_name: string; status: string }>(
      "select id, emp_code, full_name, status from employees where client_id = $1 and status <> 'exited' order by emp_code",
      [client.id],
    );
    return { docs, employees };
  });
  const back = `/c/${client.id}/documents`;
  const waiting = data.docs.filter((d) => d.status === 'uploaded');
  const required = DOCUMENT_KINDS.filter((k) => k.required);
  return (
    <div className="space-y-5">
      <Flash params={await searchParams} />
      <Card title={`Waiting for verification (${waiting.length})`}>
        {waiting.length === 0 ? (
          <p className="text-sm text-stone-600">Nothing is waiting. Employees upload documents from “My documents” in their own login.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {waiting.map((d) => <DocumentItem key={d.id} doc={d} back={back} name={`${d.full_name} (${d.emp_code})`} canVerify canDelete={isFirm(user)} />)}
          </ul>
        )}
      </Card>
      <Card title="Joining checklist">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                <th className="th">Employee</th>
                {required.map((k) => <th key={k.key} className="th">{k.label}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {data.employees.map((e) => (
                <tr key={e.id}>
                  <td className="td whitespace-nowrap"><Link href={`/c/${client.id}/employees/${e.id}`} className="link">{e.full_name}</Link> <span className="font-mono text-xs text-stone-500">{e.emp_code}</span></td>
                  {required.map((k) => {
                    const mine = data.docs.filter((d) => d.employee_id === e.id && d.kind === k.key);
                    const tone = mine.some((d) => d.status === 'verified') ? 'green' : mine.some((d) => d.status === 'uploaded') ? 'amber' : mine.length ? 'red' : 'grey';
                    const label = tone === 'green' ? 'Verified' : tone === 'amber' ? 'Waiting' : tone === 'red' ? 'Rejected' : 'Missing';
                    return <td key={k.key} className="td"><Badge tone={tone}>{label}</Badge></td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Upload on behalf of an employee">
        <UploadDocumentForm back={back} employees={data.employees} />
      </Card>
      <Card title="All documents">
        {data.docs.length === 0 ? (
          <p className="text-sm text-stone-600">No documents yet.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {data.docs.filter((d) => d.status !== 'uploaded').map((d) => (
              <DocumentItem key={d.id} doc={d} back={back} name={`${d.full_name} (${d.emp_code})`} canVerify canDelete={isFirm(user)} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
