'use server';

import { as, requireAdmin } from '../auth';
import { generatePassword, hashPassword } from '../crypto';
import { UserError, friendlyError } from '../db';
import { validateRule, type RuleKind } from '../payroll/rules';
import { STATE_CODES } from '../states';
import { emailProblem, isIsoDate } from '../validate';
import { bool, FormError, isUuid, run, str } from './util';
import type { LoginState } from './employees';

const KINDS: RuleKind[] = ['pf', 'esi', 'pt', 'tax_new', 'tax_old'];

export async function saveRuleAction(form: FormData): Promise<void> {
  const user = await requireAdmin();
  const id = str(form, 'id');
  const back = id && isUuid(id) ? `/rules/${id}` : `/rules/new${str(form, 'copy') ? `?copy=${str(form, 'copy')}` : ''}`;
  await run(back, async () => {
    const kind = str(form, 'kind') as RuleKind;
    const state = str(form, 'state');
    const from = str(form, 'effective_from');
    const to = str(form, 'effective_to');
    if (!KINDS.includes(kind)) throw new FormError('Choose the kind of rule.');
    if (kind === 'pt' && !STATE_CODES.has(state)) throw new FormError('Choose the state for a professional tax rule.');
    if (!isIsoDate(from)) throw new FormError('Enter the date the rule starts.');
    if (to && (!isIsoDate(to) || to < from)) throw new FormError('The end date must be on or after the start date.');
    let data: unknown;
    try {
      data = JSON.parse(str(form, 'data'));
    } catch {
      throw new FormError('The rule values are not valid JSON. Check for a missing comma, quote or bracket.');
    }
    validateRule(kind, data);
    const verified = bool(form, 'verified');
    const savedId = await as(user, async (sql) => {
      const params = [kind, kind === 'pt' ? state : '', from, to || null, JSON.stringify(data), str(form, 'source'), verified, verified ? user.id : null];
      if (id && isUuid(id)) {
        const rows = await sql(
          `update statutory_rules set kind=$2, state=$3, effective_from=$4, effective_to=$5, data=$6, source=$7,
                  verified=$8, verified_by=$9, verified_at=case when $8 then now() else null end
            where id=$1 returning id`,
          [id, ...params],
        );
        if (rows.length === 0) throw new UserError('Rule not found.');
        await sql('select audit($1, $2, $3, $4, $5)', ['rule.update', 'rule', id, null, JSON.stringify({ kind, state, from, verified })]);
        return id;
      }
      const row = await sql.one<{ id: string }>(
        `insert into statutory_rules (kind, state, effective_from, effective_to, data, source, verified, verified_by, verified_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8, case when $7 then now() else null end) returning id`,
        params,
      );
      await sql('select audit($1, $2, $3, $4, $5)', ['rule.create', 'rule', row!.id, null, JSON.stringify({ kind, state, from, verified })]);
      return row!.id;
    });
    return { to: '/rules', msg: `Rule saved${verified ? ' and marked as verified' : ''}. Recalculate any draft payroll to apply it. (${savedId.slice(0, 8)})` };
  });
}

export async function createUserAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  try {
    const user = await requireAdmin();
    const email = str(form, 'email').toLowerCase();
    const name = str(form, 'full_name');
    const role = str(form, 'role');
    const clientId = str(form, 'client_id');
    if (emailProblem(email)) return { error: emailProblem(email)! };
    if (!name) return { error: 'Enter the person\'s name.' };
    if (!['firm_admin', 'firm_staff', 'client_hr'].includes(role)) return { error: 'Choose what kind of login this is.' };
    if (role === 'client_hr' && !isUuid(clientId)) return { error: 'Choose the client this HR login belongs to.' };
    const password = generatePassword();
    const hash = await hashPassword(password);
    await as(user, async (sql) => {
      const row = await sql.one<{ id: string }>(
        `insert into users (email, password_hash, full_name, role, client_id, must_change_password)
         values ($1, $2, $3, $4, $5, true) returning id`,
        [email, hash, name, role, role === 'client_hr' ? clientId : null],
      );
      await sql('select audit($1, $2, $3, $4, $5)', ['user.create', 'user', row!.id, role === 'client_hr' ? clientId : null, JSON.stringify({ role })]);
    });
    return { created: { email, password } };
  } catch (err) {
    return { error: friendlyError(err) };
  }
}

export async function toggleUserActiveAction(form: FormData): Promise<void> {
  const user = await requireAdmin();
  const id = str(form, 'user_id');
  if (!isUuid(id)) return;
  await run('/users', async () => {
    if (id === user.id) throw new FormError('You cannot disable your own login.');
    const row = await as(user, async (sql) => {
      const r = await sql.one<{ active: boolean; email: string }>('update users set active = not active where id = $1 returning active, email', [id]);
      if (!r) throw new UserError('Login not found.');
      await sql('select audit($1, $2, $3, $4, $5)', [r.active ? 'user.enable' : 'user.disable', 'user', id, null, '{}']);
      return r;
    });
    return { to: '/users', msg: `${row.email} ${row.active ? 'can sign in again' : 'can no longer sign in'}.` };
  });
}

export async function saveFirmAction(form: FormData): Promise<void> {
  const user = await requireAdmin();
  await run('/users', async () => {
    const name = str(form, 'firm_name');
    if (!name) throw new FormError('Enter your office name.');
    await as(user, (sql) =>
      sql('update firm_settings set firm_name = $1, address = $2, phone = $3, email = $4 where id = 1', [
        name, str(form, 'address'), str(form, 'phone'), str(form, 'email'),
      ]),
    );
    return { to: '/users', msg: 'Office details saved.' };
  });
}
