'use server';

import { as, requireFirm } from '../auth';
import { STATE_CODES } from '../states';
import { bool, FormError, isUuid, run, str } from './util';

function workFields(form: FormData) {
  const weeklyOff = [0, 1, 2, 3, 4, 5, 6].filter((d) => bool(form, `off_${d}`));
  if (weeklyOff.length > 5) throw new FormError('At least two days of the week must be working days.');
  const start = str(form, 'shift_start') || '09:30';
  const end = str(form, 'shift_end') || '18:30';
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end) || end <= start) throw new FormError('Shift end must be after shift start (night shifts are not supported).');
  const grace = Number(str(form, 'grace_minutes') || '15');
  if (!Number.isInteger(grace) || grace < 0 || grace > 120) throw new FormError('Grace must be 0 to 120 minutes.');
  const latRaw = str(form, 'office_lat');
  const lngRaw = str(form, 'office_lng');
  const radRaw = str(form, 'office_radius_m');
  let lat: number | null = null;
  let lng: number | null = null;
  let radius: number | null = null;
  if (latRaw || lngRaw || radRaw) {
    lat = Number(latRaw);
    lng = Number(lngRaw);
    radius = Number(radRaw || '200');
    if (!latRaw || !lngRaw || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      throw new FormError('Enter both latitude and longitude of the office, for example 12.8610 and 77.5880, or leave all three location boxes empty.');
    }
    if (!Number.isInteger(radius) || radius < 20 || radius > 50000) throw new FormError('Allowed distance must be 20 to 50,000 metres.');
  }
  return { weeklyOff, start, end, grace, lat, lng, radius };
}

function clientFields(form: FormData) {
  const code = str(form, 'code').toUpperCase();
  const name = str(form, 'name');
  const state = str(form, 'state');
  const pfRule = str(form, 'pf_wage_rule');
  const dayBasis = str(form, 'day_basis') || 'calendar';
  if (!/^[A-Z0-9_-]{2,12}$/.test(code)) throw new FormError('Client code must be 2 to 12 letters or digits, for example ALPHA.');
  if (!name) throw new FormError('Enter the client name.');
  if (!STATE_CODES.has(state)) throw new FormError('Choose the state.');
  if (!['', 'basic_da', 'fifty_percent'].includes(pfRule)) throw new FormError('Choose a PF wage rule.');
  if (!['calendar', 'fixed26', 'fixed30'].includes(dayBasis)) throw new FormError('Choose how days are counted.');
  return {
    code,
    name,
    legal_name: str(form, 'legal_name'),
    address: str(form, 'address'),
    state,
    contact_name: str(form, 'contact_name'),
    contact_email: str(form, 'contact_email'),
    contact_phone: str(form, 'contact_phone'),
    pf_code: str(form, 'pf_code'),
    esi_code: str(form, 'esi_code'),
    pan: str(form, 'pan').toUpperCase(),
    tan: str(form, 'tan').toUpperCase(),
    gstin: str(form, 'gstin').toUpperCase(),
    pf_wage_rule: pfRule === '' ? null : pfRule,
    day_basis: dayBasis,
    industry: str(form, 'industry'),
  };
}

export async function createClientAction(form: FormData): Promise<void> {
  const user = await requireFirm();
  await run('/clients/new', async () => {
    const f = clientFields(form);
    const row = await as(user, async (sql) => {
      const created = await sql.one<{ id: string }>(
        `insert into clients (code, name, legal_name, address, state, contact_name, contact_email, contact_phone,
                              pf_code, esi_code, pan, tan, gstin, pf_wage_rule, day_basis, industry)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) returning id`,
        [f.code, f.name, f.legal_name, f.address, f.state, f.contact_name, f.contact_email, f.contact_phone,
         f.pf_code, f.esi_code, f.pan, f.tan, f.gstin, f.pf_wage_rule, f.day_basis, f.industry],
      );
      await sql('select audit($1, $2, $3, $4, $5)', ['client.create', 'client', created!.id, created!.id, JSON.stringify({ code: f.code })]);
      return created!;
    });
    return { to: `/c/${row.id}`, msg: `${f.name} added.` };
  });
}

export async function updateClientAction(form: FormData): Promise<void> {
  const user = await requireFirm();
  const id = str(form, 'id');
  if (!isUuid(id)) return;
  await run(`/c/${id}/settings`, async () => {
    const f = clientFields(form);
    const w = workFields(form);
    const active = bool(form, 'active');
    await as(user, async (sql) => {
      const before = await sql.one<{ pf_wage_rule: string | null; day_basis: string }>('select pf_wage_rule, day_basis from clients where id = $1', [id]);
      await sql(
        `update clients set code=$2, name=$3, legal_name=$4, address=$5, state=$6, contact_name=$7, contact_email=$8,
                contact_phone=$9, pf_code=$10, esi_code=$11, pan=$12, tan=$13, gstin=$14, pf_wage_rule=$15,
                day_basis=$16, active=$17, industry=$18, weekly_off=$19, shift_start=$20, shift_end=$21, grace_minutes=$22,
                office_lat=$23, office_lng=$24, office_radius_m=$25
          where id=$1`,
        [id, f.code, f.name, f.legal_name, f.address, f.state, f.contact_name, f.contact_email, f.contact_phone,
         f.pf_code, f.esi_code, f.pan, f.tan, f.gstin, f.pf_wage_rule, f.day_basis, active, f.industry,
         w.weeklyOff, w.start, w.end, w.grace, w.lat, w.lng, w.radius],
      );
      await sql('select audit($1, $2, $3, $4, $5)', [
        'client.update', 'client', id, id,
        JSON.stringify({ pf_wage_rule: [before?.pf_wage_rule ?? null, f.pf_wage_rule], day_basis: [before?.day_basis, f.day_basis] }),
      ]);
    });
    return { to: `/c/${id}/settings`, msg: 'Saved.' };
  });
}
