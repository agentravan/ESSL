import Link from 'next/link';
import { as, isFirm, requireClientAccess } from '@/lib/auth';
import { getClient } from '@/lib/clients';
import { deleteDocumentAction, toggleDocumentSharingAction } from '@/lib/actions/letters';
import { ConfirmSubmit, SubmitButton } from '@/components/client';
import { Badge, Empty, Flash, Notice, TableWrap } from '@/components/ui';
import { dmy } from '@/lib/format';
import { isUuid } from '@/lib/actions/util';

export const metadata = { title: 'Letters' };

export default async function LettersPage({ params, searchParams }: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { clientId } = await params;
  const sp = await searchParams;
  const user = await requireClientAccess(clientId);
  const client = await getClient(user, clientId);
  const firm = isFirm(user);
  const docs = await as(user, (sql) =>
    sql<{ id: string; title: string; ref_no: string; letter_date: string; visible_to_employee: boolean; employee_id: string; full_name: string; emp_code: string }>(
      `select d.id, d.title, d.ref_no, d.letter_date, d.visible_to_employee, d.employee_id, e.full_name, e.emp_code
         from documents d join employees e on e.id = d.employee_id
        where d.client_id = $1 order by d.created_at desc limit 300`,
      [client.id],
    ),
  );
  const base = `/c/${client.id}`;
  return (
    <div className="space-y-4">
      <Flash params={sp} />
      {sp.made && isUuid(sp.made) && (
        <Notice>
          Your letter is ready: <a href={`/api/document/${sp.made}`} target="_blank" rel="noopener" className="link">open the PDF</a>.
        </Notice>
      )}
      {firm && (
        <div className="flex justify-end">
          <Link href={`${base}/letters/new`} className="btn-primary">New letter</Link>
        </div>
      )}
      {docs.length === 0 ? (
        <Empty>No letters have been made for this client yet.</Empty>
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <th className="th">Letter</th>
              <th className="th">Employee</th>
              <th className="th">Date</th>
              <th className="th">Reference</th>
              <th className="th"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {docs.map((d) => (
              <tr key={d.id} className="hover:bg-stone-50">
                <td className="td">
                  <a href={`/api/document/${d.id}`} target="_blank" rel="noopener" className="link">{d.title}</a>{' '}
                  {d.visible_to_employee && <Badge tone="blue">Shared with employee</Badge>}
                </td>
                <td className="td"><Link href={`${base}/employees/${d.employee_id}`} className="link">{d.full_name}</Link> <span className="font-mono text-xs text-stone-500">{d.emp_code}</span></td>
                <td className="td whitespace-nowrap">{dmy(d.letter_date)}</td>
                <td className="td font-mono text-xs">{d.ref_no}</td>
                <td className="td">
                  {firm && (
                    <div className="flex flex-wrap justify-end gap-2">
                      <form action={toggleDocumentSharingAction}>
                        <input type="hidden" name="client_id" value={client.id} />
                        <input type="hidden" name="id" value={d.id} />
                        <SubmitButton className="btn-secondary" pendingText="Saving…">{d.visible_to_employee ? 'Stop sharing' : 'Share with employee'}</SubmitButton>
                      </form>
                      <form action={deleteDocumentAction}>
                        <input type="hidden" name="client_id" value={client.id} />
                        <input type="hidden" name="id" value={d.id} />
                        <ConfirmSubmit label="Delete" question="Delete this letter?" confirmLabel="Yes, delete" />
                      </form>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </div>
  );
}
