'use server';

import { as, requireAdmin } from '../auth';
import { friendlyError } from '../db';
import { buildDemoClient, runDemoPayroll, type DemoResult } from '../demo';
import { FormError, isUuid, run, str } from './util';

export interface DemoState {
  error?: string;
  created?: DemoResult;
  warning?: string;
}

export async function createDemoClientAction(_prev: DemoState, form: FormData): Promise<DemoState> {
  try {
    const user = await requireAdmin();
    const name = str(form, 'name');
    const industry = str(form, 'industry').slice(0, 60);
    if (name.length < 2 || name.length > 60) return { error: 'Enter the company name to show in the demo (2 to 60 letters).' };
    const count = await as(user, (sql) => sql.one<{ n: number }>('select count(*) as n from clients where is_demo'));
    if (count && Number(count.n) >= 10) return { error: 'There are already 10 demo clients. Delete one you no longer need first.' };
    const built = await as(user, (sql) => buildDemoClient(sql, user.id, { name, industry }));
    let warning: string | undefined;
    try {
      for (let i = 0; i < built.periods.length; i++) {
        await as(user, (sql) => runDemoPayroll(sql, user.id, built.clientId, built.periods[i], i < built.periods.length - 1));
      }
    } catch (err) {
      warning = `The demo client was made, but its payroll could not be run: ${friendlyError(err)} Open the client and run payroll by hand.`;
    }
    return { created: { clientId: built.clientId, code: built.code, name: built.name, logins: built.logins }, warning };
  } catch (err) {
    return { error: friendlyError(err) };
  }
}

export async function deleteDemoClientAction(form: FormData): Promise<void> {
  const user = await requireAdmin();
  await run('/clients', async () => {
    const id = str(form, 'client_id');
    if (!isUuid(id)) throw new FormError('Client not found.');
    await as(user, (sql) => sql('select delete_demo_client($1)', [id]));
    return { to: '/clients', msg: 'Demo client deleted, with its people, payroll and logins.' };
  });
}
