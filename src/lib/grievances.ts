// Grievance tickets: categories, priorities and the time allowed for a first resolution.
// Pure helpers only; nothing here touches the database.

export const GRIEVANCE_CATEGORIES = [
  { key: 'workplace', label: 'Workplace and facilities' },
  { key: 'payroll', label: 'Salary and payroll' },
  { key: 'hr_policy', label: 'HR policy' },
  { key: 'interpersonal', label: 'Problem with a colleague or manager' },
  { key: 'harassment', label: 'Harassment' },
  { key: 'other', label: 'Something else' },
] as const;

export type GrievanceCategory = (typeof GRIEVANCE_CATEGORIES)[number]['key'];
export type GrievancePriority = 'low' | 'medium' | 'high' | 'critical';
export type GrievanceStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export const PRIORITIES: { key: GrievancePriority; label: string; hours: number }[] = [
  { key: 'low', label: 'Low', hours: 240 },
  { key: 'medium', label: 'Medium', hours: 120 },
  { key: 'high', label: 'High', hours: 48 },
  { key: 'critical', label: 'Critical', hours: 24 },
];

export const STATUS_LABEL: Record<GrievanceStatus, string> = {
  open: 'Open',
  in_progress: 'Being looked into',
  resolved: 'Resolved',
  closed: 'Closed',
};

export function categoryLabel(key: string): string {
  return GRIEVANCE_CATEGORIES.find((c) => c.key === key)?.label ?? key;
}

export function priorityLabel(key: string): string {
  return PRIORITIES.find((p) => p.key === key)?.label ?? key;
}

export function isCategory(v: string): v is GrievanceCategory {
  return GRIEVANCE_CATEGORIES.some((c) => c.key === v);
}

export function isPriority(v: string): v is GrievancePriority {
  return PRIORITIES.some((p) => p.key === v);
}

/** A harassment complaint is never less than high priority. */
export function effectivePriority(category: string, asked: GrievancePriority): GrievancePriority {
  if (category === 'harassment' && (asked === 'low' || asked === 'medium')) return 'high';
  return asked;
}

/** When the case should be resolved by: a fixed number of clock hours from when it was raised. */
export function slaDue(priority: GrievancePriority, from: Date): Date {
  const hours = PRIORITIES.find((p) => p.key === priority)!.hours;
  return new Date(from.getTime() + hours * 3_600_000);
}

export interface SlaState {
  tone: 'green' | 'amber' | 'red' | 'grey';
  label: string;
}

function span(ms: number): string {
  const hours = Math.max(1, Math.round(Math.abs(ms) / 3_600_000));
  if (hours < 48) return `${hours} h`;
  return `${Math.round(hours / 24)} days`;
}

export function slaState(g: { status: string; sla_due_at: string | Date; closed_at: string | Date | null; created_at: string | Date }, now: Date = new Date()): SlaState {
  const due = new Date(g.sla_due_at).getTime();
  if (g.status === 'resolved' || g.status === 'closed') {
    const end = g.closed_at ? new Date(g.closed_at).getTime() : now.getTime();
    return end <= due ? { tone: 'green', label: 'Resolved in time' } : { tone: 'red', label: `Resolved ${span(end - due)} late` };
  }
  const left = due - now.getTime();
  if (left < 0) return { tone: 'red', label: `Overdue by ${span(left)}` };
  const total = due - new Date(g.created_at).getTime();
  return { tone: left < total / 4 ? 'amber' : 'grey', label: `${span(left)} left` };
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function codeFromBytes(bytes: Uint8Array, length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

/** What a person types back in; spaces, dashes and case do not matter. */
export function normaliseCode(v: string): string {
  return v.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export interface GrievanceRow {
  id: string;
  client_id: string;
  ref_no: string;
  raised_by: string | null;
  employee_id: string | null;
  anonymous: boolean;
  category: string;
  priority: GrievancePriority;
  subject: string;
  description: string;
  status: GrievanceStatus;
  sla_due_at: string;
  assigned_to: string | null;
  resolution: string;
  ai: GrievanceAi | null;
  created_at: string;
  closed_at: string | null;
}

export interface GrievanceAi {
  category: string;
  severity: number;
  tone: string;
  summary: string;
  suggestion: string;
  at: string;
}

export const GRIEVANCE_COLUMNS =
  'g.id, g.client_id, g.ref_no, g.raised_by, g.employee_id, g.anonymous, g.category, g.priority, g.subject, g.description, g.status, g.sla_due_at, g.assigned_to, g.resolution, g.ai, g.created_at, g.closed_at';

export interface GrievanceEvent {
  id: string;
  at: string;
  actor: string | null;
  kind: 'created' | 'comment' | 'status' | 'assigned' | 'resolution' | 'ai';
  body: string;
  internal: boolean;
}
