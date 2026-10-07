import type { Client } from '@/lib/clients';
import { STATES } from '@/lib/states';
import { WEEKDAY_NAMES } from '@/lib/leave';
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
          <TextField label="Industry" name="industry" defaultValue={c?.industry} maxLength={80} />
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
      {c && (
        <Card title="Working days, shift and office location">
          <p className="mb-2 text-sm font-medium text-stone-700">Weekly off</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {WEEKDAY_NAMES.map((name, d) => <CheckField key={d} label={name} name={`off_${d}`} defaultChecked={c.weekly_off.includes(d)} />)}
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <TextField label="Shift starts" name="shift_start" type="time" defaultValue={c.shift_start.slice(0, 5)} required />
            <TextField label="Shift ends" name="shift_end" type="time" defaultValue={c.shift_end.slice(0, 5)} required />
            <TextField label="Grace for late arrival (minutes)" name="grace_minutes" type="number" min={0} max={120} defaultValue={c.grace_minutes} />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <TextField label="Office latitude" name="office_lat" defaultValue={c.office_lat ?? ''} placeholder="12.8610" inputMode="decimal" />
            <TextField label="Office longitude" name="office_lng" defaultValue={c.office_lng ?? ''} placeholder="77.5880" inputMode="decimal" />
            <TextField label="Allowed distance (metres)" name="office_radius_m" type="number" min={20} max={50000} defaultValue={c.office_radius_m ?? ''} placeholder="200" />
          </div>
          <p className="mt-2 text-xs text-stone-500">Leave the three location boxes empty to let employees punch from anywhere. When they are filled in, a punch is accepted only from inside that distance of the office.</p>
        </Card>
      )}
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
