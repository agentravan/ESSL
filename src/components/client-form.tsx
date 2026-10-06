import type { Client } from '@/lib/clients';
import { STATES } from '@/lib/states';
import { Card, CheckField, SelectField, TextField } from './ui';
import { SubmitButton } from './client';

export function ClientForm({ client, action }: { client?: Client; action: (form: FormData) => Promise<void> }) {
  const c = client;
  return (
    <form action={action} className="space-y-4">
      {c && <input type="hidden" name="id" value={c.id} />}
      <Card title="Company">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Client name" name="name" defaultValue={c?.name} required maxLength={120} />
          <TextField label="Short code" name="code" defaultValue={c?.code} required pattern="[A-Za-z0-9_\-]{2,12}" hint="2 to 12 letters or digits, e.g. ALPHA. Used on reference numbers." />
          <TextField label="Legal name" name="legal_name" defaultValue={c?.legal_name} hint="As it should appear on letters, if different." />
          <SelectField label="State" name="state" defaultValue={c?.state ?? 'HR'} options={STATES.map((s) => ({ value: s.code, label: s.name }))} required />
          <Field2 label="Address" name="address" defaultValue={c?.address} />
        </div>
      </Card>
      <Card title="Contact person">
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField label="Name" name="contact_name" defaultValue={c?.contact_name} />
          <TextField label="Email" name="contact_email" type="email" defaultValue={c?.contact_email} />
          <TextField label="Phone" name="contact_phone" defaultValue={c?.contact_phone} />
        </div>
      </Card>
      <Card title="Registrations">
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField label="PF establishment code" name="pf_code" defaultValue={c?.pf_code} />
          <TextField label="ESI employer code" name="esi_code" defaultValue={c?.esi_code} />
          <TextField label="PAN" name="pan" defaultValue={c?.pan} />
          <TextField label="TAN" name="tan" defaultValue={c?.tan} />
          <TextField label="GSTIN" name="gstin" defaultValue={c?.gstin} />
        </div>
      </Card>
      <Card title="Payroll settings">
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="PF wage rule"
            name="pf_wage_rule"
            defaultValue={c?.pf_wage_rule ?? ''}
            options={[
              { value: '', label: 'Not decided yet (payroll cannot run)' },
              { value: 'basic_da', label: 'Basic + DA only' },
              { value: 'fifty_percent', label: '50% wage rule (labour codes)' },
            ]}
            hint="Under the 50% rule, PF wage is at least half of gross pay. This is the employer's decision; payroll shows the PF figure both ways."
          />
          <SelectField
            label="Days counted for pay"
            name="day_basis"
            defaultValue={c?.day_basis ?? 'calendar'}
            options={[
              { value: 'calendar', label: 'Calendar days of the month' },
              { value: 'fixed30', label: 'Fixed 30 days' },
              { value: 'fixed26', label: 'Fixed 26 days' },
            ]}
          />
        </div>
        {c && (
          <div className="mt-4">
            <CheckField label="Active client" name="active" defaultChecked={c.active} hint="Untick to hide this client from the main list." />
          </div>
        )}
      </Card>
      <SubmitButton>{c ? 'Save changes' : 'Add client'}</SubmitButton>
    </form>
  );
}

function Field2({ label, name, defaultValue }: { label: string; name: string; defaultValue?: string }) {
  return (
    <div className="sm:col-span-2">
      <label htmlFor={name} className="mb-1 block text-sm font-medium text-stone-700">{label}</label>
      <textarea id={name} name={name} rows={3} defaultValue={defaultValue} className="input" />
    </div>
  );
}
