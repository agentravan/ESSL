import type { Employee, SalaryStructure } from '@/lib/employees';
import { STATUS_LABEL } from '@/lib/employees';
import { COMPONENT_KEYS, COMPONENT_LABELS } from '@/lib/payroll/types';
import { STATES } from '@/lib/states';
import { Card, CheckField, SelectField, TextField } from './ui';
import { SubmitButton } from './client';

export function EmployeeForm({ clientId, clientState, employee, action }: {
  clientId: string;
  clientState: string;
  employee?: Employee;
  action: (form: FormData) => Promise<void>;
}) {
  const e = employee;
  const keep = (masked: string | undefined) => (masked ? `Leave blank to keep ${masked}` : undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="client_id" value={clientId} />
      {e && <input type="hidden" name="id" value={e.id} />}
      <Card title="Person">
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField label="Employee code" name="emp_code" defaultValue={e?.emp_code} required maxLength={20} pattern="[A-Za-z0-9/_\-]{1,20}" />
          <TextField label="Full name" name="full_name" defaultValue={e?.full_name} required maxLength={120} className="sm:col-span-2" />
          <TextField label="Father's name" name="father_name" defaultValue={e?.father_name} maxLength={120} />
          <SelectField label="Gender" name="gender" defaultValue={e?.gender ?? 'M'} options={[{ value: 'M', label: 'Male' }, { value: 'F', label: 'Female' }, { value: 'O', label: 'Other' }]} />
          <TextField label="Date of birth" name="dob" type="date" defaultValue={e?.dob ?? ''} />
          <TextField label="Email" name="email" type="email" defaultValue={e?.email} hint="Needed if the employee will have a login." />
          <TextField label="Phone" name="phone" defaultValue={e?.phone} maxLength={20} />
          <TextField label="Address" name="address" defaultValue={e?.address} maxLength={300} />
        </div>
      </Card>
      <Card title="Job">
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField label="Date of joining" name="doj" type="date" defaultValue={e?.doj ?? ''} required />
          <TextField label="Designation" name="designation" defaultValue={e?.designation} maxLength={80} />
          <TextField label="Department" name="department" defaultValue={e?.department} maxLength={80} />
          <TextField label="Work location" name="location" defaultValue={e?.location} maxLength={80} />
          <SelectField label="Work state" name="work_state" defaultValue={e?.work_state ?? clientState} options={STATES.map((s) => ({ value: s.code, label: s.name }))} hint="Decides professional tax." />
          <SelectField label="Status" name="status" defaultValue={e?.status ?? 'active'} options={Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))} />
          <TextField label="Last working day" name="exit_date" type="date" defaultValue={e?.exit_date ?? ''} hint="Only for people who have left or are leaving." />
        </div>
      </Card>
      {!e && (
        <Card title="Monthly salary">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {COMPONENT_KEYS.map((k) => (
              <TextField key={k} label={COMPONENT_LABELS[k]} name={k} type="number" min={0} step="1" inputMode="numeric" placeholder="0" />
            ))}
          </div>
          <p className="mt-3 text-xs text-stone-500">Full-month amounts in rupees, starting from the date of joining. Leave blank to add the salary later.</p>
        </Card>
      )}
      <Card title="PF, ESI and professional tax">
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField label="UAN" name="uan" defaultValue={e?.uan} inputMode="numeric" pattern="\d{12}" hint="12 digits." />
          <TextField label="PF member number" name="pf_number" defaultValue={e?.pf_number} maxLength={30} />
          <TextField label="ESI number" name="esi_number" defaultValue={e?.esi_number} maxLength={20} />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <CheckField label="PF applies" name="pf_applicable" defaultChecked={e?.pf_applicable ?? true} />
          <CheckField label="Limit PF to the wage ceiling" name="pf_restrict" defaultChecked={e?.pf_restrict ?? true} hint="Untick if PF is paid on full wages." />
          <CheckField label="Pension (EPS) member" name="eps_applicable" defaultChecked={e?.eps_applicable ?? true} />
          <CheckField label="ESI applies" name="esi_applicable" defaultChecked={e?.esi_applicable ?? false} />
          <CheckField label="Person with disability" name="pwd" defaultChecked={e?.pwd ?? false} hint="Higher ESI wage limit." />
          <CheckField label="Professional tax applies" name="pt_applicable" defaultChecked={e?.pt_applicable ?? true} />
        </div>
      </Card>
      <Card title="Income tax">
        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField label="Tax regime" name="tax_regime" defaultValue={e?.tax_regime ?? 'new'} options={[{ value: 'new', label: 'New regime' }, { value: 'old', label: 'Old regime' }]} />
          <TextField label="Declared deductions, per year" name="old_regime_deductions" type="number" min={0} step="1" defaultValue={e?.old_regime_deductions || ''} hint="Old regime only: 80C, HRA exemption and so on, in total." />
          <TextField label="Fixed monthly TDS" name="tds_override_monthly" type="number" min={0} step="1" defaultValue={e?.tds_override_monthly ?? ''} hint="Leave blank to let the system work it out." />
          <TextField label="Opening balances for year" name="opening_fy" defaultValue={e?.opening_fy} placeholder="2026-27" pattern="\d{4}-\d{2}" hint="If salary was paid earlier this year outside this system." />
          <TextField label="Taxable salary already paid" name="opening_taxable_ytd" type="number" min={0} step="1" defaultValue={e?.opening_taxable_ytd || ''} />
          <TextField label="TDS already deducted" name="opening_tds_ytd" type="number" min={0} step="1" defaultValue={e?.opening_tds_ytd || ''} />
        </div>
      </Card>
      <Card title="PAN, Aadhaar and bank">
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField label="PAN" name="pan" autoComplete="off" placeholder={keep(e?.pan_masked) ?? 'ABCDE1234F'} />
          <TextField label="Aadhaar" name="aadhaar" autoComplete="off" inputMode="numeric" placeholder={keep(e?.aadhaar_last4 ? `XXXX XXXX ${e.aadhaar_last4}` : undefined) ?? '12 digits'} />
          <TextField label="Bank name" name="bank_name" defaultValue={e?.bank_name} maxLength={80} />
          <TextField label="IFSC" name="bank_ifsc" defaultValue={e?.bank_ifsc} placeholder="HDFC0001234" />
          <TextField label="Bank account number" name="bank_account" autoComplete="off" inputMode="numeric" placeholder={keep(e?.bank_acct_last4 ? `XXXX${e.bank_acct_last4}` : undefined) ?? ''} />
        </div>
        <p className="mt-3 text-xs text-stone-500">PAN, Aadhaar and account numbers are stored encrypted. Screens show only the last four characters.</p>
      </Card>
      <SubmitButton>{e ? 'Save changes' : 'Add employee'}</SubmitButton>
    </form>
  );
}

export function StructureFields({ structure }: { structure?: SalaryStructure | null }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {COMPONENT_KEYS.map((k) => (
        <TextField key={k} label={COMPONENT_LABELS[k]} name={k} type="number" min={0} step="1" inputMode="numeric" defaultValue={structure?.[k] || ''} placeholder="0" />
      ))}
    </div>
  );
}
