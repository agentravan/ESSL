import { requireFirm } from '@/lib/auth';
import { getClient } from '@/lib/clients';
import { ImportEmployeesForm } from '@/components/import-client';
import { Card, PageHeader } from '@/components/ui';

export const metadata = { title: 'Import employees' };

export default async function ImportEmployeesPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const user = await requireFirm();
  const client = await getClient(user, clientId);
  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader title="Import employees from Excel" back={{ href: `/c/${client.id}/employees`, label: 'Employees' }} />
      <Card title="Upload">
        <ImportEmployeesForm clientId={client.id} />
      </Card>
      <Card title="How the file should look">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-stone-700">
          <li>The first row is the headings. One employee per row after that. Only the first sheet is read.</li>
          <li>Must have: <strong>Employee code</strong>, <strong>Name</strong>, <strong>Date of joining</strong>, and at least <strong>Basic</strong>.</li>
          <li>Salary columns are full-month amounts: Basic, DA, HRA, Conveyance, Medical, Special Allowance, LTA, Other Allowance. If there is a Gross column, it is checked against their total.</li>
          <li>Optional: Father's name, Gender, Date of birth, Designation, Department, Location, State, Email, Mobile, UAN, ESI number, PF (Y/N), ESI (Y/N), Tax regime, PAN, Bank name, IFSC, Account number.</li>
          <li>Common heading spellings are understood (for example "Emp Code", "DOJ", "Employee Name"). Dates as DD-MM-YYYY or as Excel dates.</li>
          <li>If any line has a problem, nothing is imported and every problem is listed with its line number.</li>
        </ul>
        <a href="/api/employee-template" className="btn-secondary mt-4">Download a blank template</a>
      </Card>
    </div>
  );
}
