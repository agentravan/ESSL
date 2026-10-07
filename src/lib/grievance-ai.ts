// Optional AI help for HR on a grievance. Used only when ANTHROPIC_API_KEY is set,
// only when someone in HR presses the button, and never for a harassment complaint.
// The suggestion is advice for HR to read; nothing is sent to the employee automatically.

import type { GrievanceAi } from './grievances';

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function suggestForGrievance(input: { category: string; subject: string; description: string }): Promise<GrievanceAi> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('AI help is not set up.');
  if (input.category === 'harassment') throw new Error('AI help is not used for harassment complaints.');
  const prompt = [
    'You help an HR officer in India read an employee grievance. Reply with JSON only, no other text, in this shape:',
    '{"category":"workplace|payroll|hr_policy|interpersonal|other","severity":1-5,"tone":"calm|worried|upset|angry","summary":"two sentences","suggestion":"up to six short steps HR could take, as plain text"}',
    'Do not invent facts or company policies. If this may be harassment or a safety matter, say it must go to the Internal Committee or a senior person and suggest nothing else.',
    '',
    `Category chosen by the employee: ${input.category}`,
    `Subject: ${input.subject}`,
    `Details: ${input.description}`,
  ].join('\n');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: 700,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`The AI service did not answer (${res.status}).`);
  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = (data.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
  return parseAiReply(text);
}

export function parseAiReply(text: string): GrievanceAi {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('The AI reply could not be read.');
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    throw new Error('The AI reply could not be read.');
  }
  const s = (v: unknown, max: number) => (typeof v === 'string' ? v : '').slice(0, max);
  const severity = Math.min(5, Math.max(1, Math.round(Number(raw.severity) || 3)));
  return { category: s(raw.category, 30), severity, tone: s(raw.tone, 20), summary: s(raw.summary, 600), suggestion: s(raw.suggestion, 2000), at: new Date().toISOString() };
}
