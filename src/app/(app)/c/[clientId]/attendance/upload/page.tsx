import { requireClientAccess } from '@/lib/auth';
import { getClient } from '@/lib/clients';
import { PunchImportForm } from '@/components/punch-client';
import { Card } from '@/components/ui';

export const metadata = { title: 'Upload punches' };

export default async function UploadPunchesPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const user = await requireClientAccess(clientId);
  const client = await getClient(user, clientId);
  return (
    <div className="max-w-4xl space-y-5">
      <Card title="Upload a punch file">
        <PunchImportForm clientId={client.id} />
      </Card>
      <Card title="Which files work">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-stone-700">
          <li>The report exported from an attendance machine (eSSL, Matrix, Honeywell and similar), saved as Excel or CSV. Machines are not connected directly; export the report from the machine's own software and upload it here.</li>
          <li><strong>One row per punch:</strong> Employee code, Date, Time, and optionally In/Out. Without an In/Out column, the first punch of a day is taken as In and the last as Out.</li>
          <li><strong>One row per day:</strong> Employee code, Date, In Time, Out Time.</li>
          <li>The employee code in the file must match the employee code here. If the machine uses its own numbers, change the employee codes to match, or add a code column to the file.</li>
          <li>Uploading the same file twice is safe: punches already present are skipped.</li>
          <li>If any line has a problem, nothing is uploaded and each problem is listed with its line number.</li>
        </ul>
      </Card>
    </div>
  );
}
