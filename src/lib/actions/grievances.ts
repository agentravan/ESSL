'use server';

import { randomBytes, randomUUID } from 'node:crypto';
import { as, isFirm, requireEmployee, requireUser, type SessionUser } from '../auth';
import { sha256 } from '../crypto';
import { friendlyError, UserError } from '../db';
import { aiConfigured, suggestForGrievance } from '../grievance-ai';
import { codeFromBytes, effectivePriority, isCategory, isPriority, normaliseCode, slaDue, STATUS_LABEL, priorityLabel, type GrievanceStatus } from '../grievances';
import { FormError, isUuid, run, str, bool } from './util';

export interface RaiseState {
  error?: string;
  raised?: { refNo: string; code?: string };
}

/** An employee raises a concern. An anonymous one is stored with no link to the person at all. */
export async function raiseGrievanceAction(_prev: RaiseState, form: FormData): Promise<RaiseState> {
  try {
    const user = await requireEmployee();
    const category = str(form, 'category');
    const asked = str(form, 'priority') || 'medium';
    const subject = str(form, 'subject');
    const description = str(form, 'description');
    const anonymous = bool(form, 'anonymous');
    if (!isCategory(category)) return { error: 'Choose what the concern is about.' };
    if (!isPriority(asked)) return { error: 'Choose how urgent it is.' };
    if (subject.length < 3 || subject.length > 150) return { error: 'Write a short subject (3 to 150 letters).' };
    if (description.length < 10 || description.length > 5000) return { error: 'Describe what happened in at least a sentence (up to 5,000 letters).' };
    const priority = effectivePriority(category, asked);
    const now = new Date();
    const id = randomUUID();
    const refNo = `GRV-${codeFromBytes(randomBytes(6), 6)}`;
    const code = anonymous ? codeFromBytes(randomBytes(12), 12) : undefined;
    await as(user, async (sql) => {
      await sql(
        `insert into grievances (id, client_id, ref_no, raised_by, employee_id, anonymous, tracking_hash, category, priority, subject, description, sla_due_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [id, user.clientId, refNo, anonymous ? null : user.id, anonymous ? null : user.employeeId, anonymous, code ? sha256(code) : null,
         category, priority, subject, description, slaDue(priority, now).toISOString()],
      );
      if (!anonymous) {
        await sql(
          "insert into grievance_events (grievance_id, client_id, actor, kind, body) values ($1,$2,$3,'created','Concern raised.')",
          [id, user.clientId, user.id],
        );
      }
    });
    return { raised: { refNo, code: code ? `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8)}` : undefined } };
  } catch (err) {
    return { error: friendlyError(err) };
  }
}

export interface TrackState {
  error?: string;
  found?: { ref_no: string; subject: string; status: string; created_at: string; resolution: string; replies: { at: string; body: string }[] };
}

export async function trackGrievanceAction(_prev: TrackState, form: FormData): Promise<TrackState> {
  try {
    const user = await requireEmployee();
    const code = normaliseCode(str(form, 'code'));
    if (code.length !== 12) return { error: 'The tracking code has 12 letters and numbers.' };
    const row = await as(user, (sql) => sql.one<NonNullable<TrackState['found']>>(
      'select ref_no, subject, status, created_at, resolution, replies from grievance_by_code($1)', [sha256(code)],
    ));
    if (!row) return { error: 'No concern matches this code.' };
    return { found: { ...row, created_at: new Date(row.created_at).toISOString() } };
  } catch (err) {
    return { error: friendlyError(err) };
  }
}

function isHr(user: SessionUser): boolean {
  return isFirm(user) || user.role === 'client_hr';
}

function backFor(form: FormData): string {
  const back = str(form, 'back');
  return back.startsWith('/c/') || back.startsWith('/me/grievances') ? back : '/';
}

/** A reply. HR may mark it as an internal note; the employee can only reply on their own case. */
export async function grievanceCommentAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const back = backFor(form);
  await run(back, async () => {
    const id = str(form, 'id');
    const body = str(form, 'body');
    if (!isUuid(id)) throw new FormError('Concern not found.');
    if (body.length < 2 || body.length > 3000) throw new FormError('Write your message (up to 3,000 letters).');
    const internal = isHr(user) && bool(form, 'internal');
    await as(user, async (sql) => {
      const g = await sql.one<{ client_id: string }>('select client_id from grievances where id = $1', [id]);
      if (!g) throw new UserError('Concern not found.');
      await sql(
        "insert into grievance_events (grievance_id, client_id, actor, kind, body, internal) values ($1,$2,$3,'comment',$4,$5)",
        [id, g.client_id, user.id, body, internal],
      );
    });
    return { to: back, msg: internal ? 'Internal note saved.' : 'Message sent.' };
  });
}

/** HR changes status, priority or takes the case. Resolving needs a written resolution. */
export async function grievanceUpdateAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const back = backFor(form);
  await run(back, async () => {
    if (!isHr(user)) throw new UserError('Only HR can update a concern.');
    const id = str(form, 'id');
    const status = str(form, 'status') as GrievanceStatus;
    const priority = str(form, 'priority');
    const resolution = str(form, 'resolution');
    const take = bool(form, 'take');
    if (!isUuid(id)) throw new FormError('Concern not found.');
    if (!(status in STATUS_LABEL)) throw new FormError('Choose a status.');
    if (!isPriority(priority)) throw new FormError('Choose a priority.');
    if (resolution.length > 4000) throw new FormError('The resolution is too long (4,000 letters at most).');
    await as(user, async (sql) => {
      const g = await sql.one<{ client_id: string; status: string; priority: string; resolution: string; category: string; created_at: string; assigned_to: string | null }>(
        'select client_id, status, priority, resolution, category, created_at, assigned_to from grievances where id = $1 for update', [id],
      );
      if (!g) throw new UserError('Concern not found.');
      const done = status === 'resolved' || status === 'closed';
      const finalResolution = resolution || g.resolution;
      if (done && !finalResolution) throw new FormError('Write what was decided or done before marking this resolved.');
      const newPriority = effectivePriority(g.category, priority);
      const event = (kind: string, body: string, internal = false) =>
        sql('insert into grievance_events (grievance_id, client_id, actor, kind, body, internal) values ($1,$2,$3,$4,$5,$6)', [id, g.client_id, user.id, kind, body, internal]);
      await sql(
        `update grievances set status = $2, priority = $3, resolution = $4,
                sla_due_at = case when $3::text <> priority then $5::timestamptz else sla_due_at end,
                assigned_to = case when $6::boolean then $7::uuid else assigned_to end,
                closed_at = case when $8::boolean then coalesce(closed_at, now()) else null end
          where id = $1`,
        [id, status, newPriority, finalResolution, slaDue(newPriority, new Date(g.created_at)).toISOString(), take, user.id, done],
      );
      if (take && g.assigned_to !== user.id) await event('assigned', 'Case taken up.', true);
      if (newPriority !== g.priority) await event('status', `Priority changed to ${priorityLabel(newPriority)}.`, true);
      if (resolution && resolution !== g.resolution) await event('resolution', resolution);
      if (status !== g.status) await event('status', `Status changed to ${STATUS_LABEL[status]}.`);
      await sql('select audit($1, $2, $3, $4, $5)', ['grievance.update', 'grievance', id, g.client_id, JSON.stringify({ status, priority: newPriority })]);
    });
    return { to: back, msg: 'Saved.' };
  });
}

/** Asks the AI service for a reading of the complaint. Only on request, never for harassment. */
export async function grievanceAiAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const back = backFor(form);
  await run(back, async () => {
    if (!isHr(user)) throw new UserError('Only HR can do this.');
    if (!aiConfigured()) throw new UserError('AI help is not switched on for this office.');
    const id = str(form, 'id');
    if (!isUuid(id)) throw new FormError('Concern not found.');
    const g = await as(user, (sql) => sql.one<{ client_id: string; category: string; subject: string; description: string }>(
      'select client_id, category, subject, description from grievances where id = $1', [id],
    ));
    if (!g) throw new UserError('Concern not found.');
    if (g.category === 'harassment') throw new UserError('AI help is not used for harassment complaints. These go to the Internal Committee.');
    let ai;
    try {
      ai = await suggestForGrievance(g);
    } catch (err) {
      throw new UserError(err instanceof Error ? err.message : 'The AI service did not answer.');
    }
    await as(user, async (sql) => {
      await sql('update grievances set ai = $2 where id = $1', [id, JSON.stringify(ai)]);
      await sql("insert into grievance_events (grievance_id, client_id, actor, kind, body, internal) values ($1,$2,$3,'ai','AI suggestion requested.',true)", [id, g.client_id, user.id]);
    });
    return { to: back, msg: 'AI suggestion added. Read it as advice only.' };
  });
}
