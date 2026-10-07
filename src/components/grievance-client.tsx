'use client';

import { useActionState } from 'react';
import { raiseGrievanceAction, trackGrievanceAction, type RaiseState, type TrackState } from '@/lib/actions/grievances';
import { GRIEVANCE_CATEGORIES, PRIORITIES, STATUS_LABEL, type GrievanceStatus } from '@/lib/grievances';
import { CopyBox, SubmitButton } from './client';

export function RaiseGrievanceForm() {
  const [state, action] = useActionState<RaiseState, FormData>(raiseGrievanceAction, {});
  if (state.raised) {
    return (
      <div className="space-y-3 rounded-md border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
        <p>Your concern has been sent to HR. Reference <strong>{state.raised.refNo}</strong>.</p>
        {state.raised.code ? (
          <>
            <p>
              You sent this without your name. Write down this tracking code now. It is the only way to see the reply, and it is not shown
              again. Nobody, including HR, can look it up for you.
            </p>
            <CopyBox label="Tracking code" value={state.raised.code} />
          </>
        ) : (
          <p>You can follow it under “My concerns” below after you reload this page.</p>
        )}
        <a href="/me/grievances" className="btn-secondary">Done</a>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      {state.error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-900">{state.error}</div>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="g_category" className="mb-1 block text-sm font-medium text-stone-700">What is it about?</label>
          <select id="g_category" name="category" className="input" defaultValue="" required>
            <option value="" disabled>Choose…</option>
            {GRIEVANCE_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="g_priority" className="mb-1 block text-sm font-medium text-stone-700">How urgent is it?</label>
          <select id="g_priority" name="priority" className="input" defaultValue="medium">
            {PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="g_subject" className="mb-1 block text-sm font-medium text-stone-700">Subject</label>
        <input id="g_subject" name="subject" className="input" required minLength={3} maxLength={150} />
      </div>
      <div>
        <label htmlFor="g_description" className="mb-1 block text-sm font-medium text-stone-700">What happened?</label>
        <textarea id="g_description" name="description" className="input" rows={6} required minLength={10} maxLength={5000} />
        <p className="mt-1 text-xs text-stone-500">Say what happened, when, and what you would like done. Do not put passwords or bank details here.</p>
      </div>
      <label className="flex items-start gap-2 text-sm text-stone-800">
        <input type="checkbox" name="anonymous" className="mt-0.5 h-4 w-4 rounded border-stone-300" />
        <span>
          Send without my name.
          <span className="block text-xs text-stone-500">
            Your name is not stored with the concern. You get a tracking code to read the reply. In a small company, the details you write may still show who you are.
          </span>
        </span>
      </label>
      <SubmitButton pendingText="Sending…">Send to HR</SubmitButton>
    </form>
  );
}

export function TrackGrievanceForm() {
  const [state, action] = useActionState<TrackState, FormData>(trackGrievanceAction, {});
  return (
    <div className="space-y-3">
      <form action={action} className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="g_code" className="mb-1 block text-sm font-medium text-stone-700">Tracking code</label>
          <input id="g_code" name="code" className="input font-mono" required autoComplete="off" placeholder="XXXX-XXXX-XXXX" />
        </div>
        <SubmitButton pendingText="Looking…" className="btn-secondary">See status</SubmitButton>
      </form>
      {state.error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-900">{state.error}</div>}
      {state.found && (
        <div className="rounded-md border border-stone-200 p-3 text-sm">
          <p className="font-medium text-stone-900">{state.found.subject}</p>
          <p className="text-stone-600">{state.found.ref_no} · {STATUS_LABEL[state.found.status as GrievanceStatus] ?? state.found.status}</p>
          {state.found.resolution && <p className="mt-2 whitespace-pre-wrap text-stone-800"><strong>Resolution:</strong> {state.found.resolution}</p>}
          {state.found.replies.length === 0 ? (
            <p className="mt-2 text-stone-600">No reply from HR yet.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {state.found.replies.map((r, i) => (
                <li key={i} className="rounded bg-stone-50 p-2">
                  <span className="block text-xs text-stone-500">{new Date(r.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}</span>
                  <span className="whitespace-pre-wrap text-stone-800">{r.body}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
