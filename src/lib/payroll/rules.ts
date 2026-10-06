// Loads the statutory rules in force for a month and checks their shape.

import { UserError, type Sql } from '../db';
import { firstDay } from './period';
import type { EsiRule, PfRule, PtRule, PtSlab, TaxRule, TaxSlab } from './types';

export type RuleKind = 'pf' | 'esi' | 'pt' | 'tax_new' | 'tax_old';

export interface RuleRow {
  id: string;
  kind: RuleKind;
  state: string;
  effective_from: string;
  effective_to: string | null;
  data: unknown;
  source: string;
  verified: boolean;
}

export const RULE_KIND_LABEL: Record<RuleKind, string> = {
  pf: 'Provident fund',
  esi: 'ESI',
  pt: 'Professional tax',
  tax_new: 'Income tax, new regime',
  tax_old: 'Income tax, old regime',
};

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

function need(obj: Record<string, unknown>, keys: string[], what: string): void {
  for (const k of keys) {
    if (!isNum(obj[k])) throw new UserError(`${what}: "${k}" must be a number, zero or more.`);
  }
}

function asObject(data: unknown, what: string): Record<string, unknown> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new UserError(`${what}: the rule must be a JSON object.`);
  return data as Record<string, unknown>;
}

function checkSlabs(list: unknown, valueKey: 'rate' | 'amount', what: string): void {
  if (!Array.isArray(list) || list.length === 0) throw new UserError(`${what}: "slabs" must be a list with at least one entry.`);
  let prev = -1;
  list.forEach((s, i) => {
    const slab = asObject(s, what);
    const last = i === list.length - 1;
    if (last) {
      if (slab.upTo !== null) throw new UserError(`${what}: the last slab must have "upTo": null.`);
    } else {
      if (!isNum(slab.upTo) || slab.upTo <= prev) throw new UserError(`${what}: slab limits must increase.`);
      prev = slab.upTo;
    }
    if (!isNum(slab[valueKey])) throw new UserError(`${what}: each slab needs "${valueKey}".`);
    if (valueKey === 'amount' && slab.feb !== undefined && !isNum(slab.feb)) throw new UserError(`${what}: "feb" must be a number.`);
  });
}

/** Checks a rule's JSON for its kind. Throws a UserError that says what is wrong. */
export function validateRule(kind: RuleKind, data: unknown): void {
  const what = RULE_KIND_LABEL[kind];
  const d = asObject(data, what);
  if (kind === 'pf') {
    need(d, ['wageCeiling', 'employeeRate', 'epsRate', 'edliRate', 'adminRate', 'adminMin'], what);
  } else if (kind === 'esi') {
    need(d, ['wageLimit', 'wageLimitPwd', 'employeeRate', 'employerRate', 'dailyWageExempt'], what);
  } else if (kind === 'pt') {
    if (d.none === true) return;
    checkSlabs(d.slabs, 'amount', what);
    if (d.female !== undefined) checkSlabs(d.female, 'amount', what);
  } else {
    need(d, ['standardDeduction', 'cess'], what);
    checkSlabs(d.slabs, 'rate', what);
    const rebate = asObject(d.rebate, what);
    need(rebate, ['incomeLimit', 'max'], what);
    if (typeof rebate.marginalRelief !== 'boolean') throw new UserError(`${what}: rebate needs "marginalRelief": true or false.`);
    if (!Array.isArray(d.surcharge)) throw new UserError(`${what}: "surcharge" must be a list (it can be empty).`);
    for (const s of d.surcharge) need(asObject(s, what), ['above', 'rate'], what);
    if (typeof d.ptDeductible !== 'boolean') throw new UserError(`${what}: needs "ptDeductible": true or false.`);
  }
}

export interface LoadedRules {
  pf: PfRule;
  esi: EsiRule;
  taxNew: TaxRule;
  taxOld: TaxRule;
  pt: Map<string, PtRule | null>;
  used: RuleRow[];
}

export async function loadRules(sql: Sql, period: string, states: string[]): Promise<LoadedRules> {
  const day = firstDay(period);
  const rows = await sql<RuleRow>(
    `select distinct on (kind, state) id, kind, state, effective_from, effective_to, data, source, verified
       from statutory_rules
      where effective_from <= $1 and (effective_to is null or effective_to >= $1)
      order by kind, state, effective_from desc`,
    [day],
  );
  const used: RuleRow[] = [];
  const pick = (kind: RuleKind, label: string): RuleRow => {
    const row = rows.find((r) => r.kind === kind);
    if (!row) throw new UserError(`No ${label} rule covers this month. Add one under Statutory rules.`);
    validateRule(kind, row.data);
    used.push(row);
    return row;
  };
  const pf = pick('pf', 'provident fund').data as PfRule;
  const esi = pick('esi', 'ESI').data as EsiRule;
  const taxNew = pick('tax_new', 'new-regime income tax').data as TaxRule;
  const taxOld = pick('tax_old', 'old-regime income tax').data as TaxRule;
  const pt = new Map<string, PtRule | null>();
  for (const state of new Set(states)) {
    const row = rows.find((r) => r.kind === 'pt' && r.state === state);
    if (row) {
      validateRule('pt', row.data);
      used.push(row);
      pt.set(state, row.data as PtRule);
    } else {
      pt.set(state, null);
    }
  }
  return { pf, esi, taxNew, taxOld, pt, used };
}

export type { PtSlab, TaxSlab };
