import { cache } from 'react';
import { notFound } from 'next/navigation';
import { as, type SessionUser } from './auth';
import { isUuid } from './actions/util';

export interface Client {
  id: string;
  code: string;
  name: string;
  legal_name: string;
  address: string;
  state: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  pf_code: string;
  esi_code: string;
  pan: string;
  tan: string;
  gstin: string;
  pf_wage_rule: 'basic_da' | 'fifty_percent' | null;
  day_basis: 'calendar' | 'fixed26' | 'fixed30';
  active: boolean;
}

const load = cache(async (user: SessionUser, clientId: string): Promise<Client | null> => {
  if (!isUuid(clientId)) return null;
  return as(user, (sql) => sql.one<Client>('select * from clients where id = $1', [clientId]));
});

/** The client, if this user is allowed to see it; otherwise a "not found" page. */
export async function getClient(user: SessionUser, clientId: string): Promise<Client> {
  const client = await load(user, clientId);
  if (!client) notFound();
  return client;
}

export const PF_RULE_LABEL = {
  basic_da: 'Basic + DA',
  fifty_percent: '50% wage rule',
} as const;

export const DAY_BASIS_LABEL = {
  calendar: 'Calendar days of the month',
  fixed30: 'Fixed 30 days',
  fixed26: 'Fixed 26 days',
} as const;
