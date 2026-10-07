'use client';

import { useActionState } from 'react';
import { createDemoClientAction, type DemoState } from '@/lib/actions/demo';
import { CopyBox, SubmitButton } from './client';

export function CreateDemoForm() {
  const [state, action] = useActionState<DemoState, FormData>(createDemoClientAction, {});
  return (
    <div className="space-y-4">
      {state.created && (
        <div className="space-y-3 rounded-md border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p>
            <strong>{state.created.name}</strong> is ready with 12 invented employees, attendance, leave, three months of payroll and a few concerns.{' '}
            <a className="link" href={`/c/${state.created.clientId}`}>Open it</a>
          </p>
          <p>Give the prospect these logins. The passwords are shown only now.</p>
          {state.created.logins.map((l) => (
            <div key={l.email} className="rounded-md border border-emerald-200 bg-white p-3 text-stone-900">
              <p className="mb-2 font-medium">{l.who}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <CopyBox label="Email" value={l.email} />
                <CopyBox label="Password" value={l.password} />
              </div>
            </div>
          ))}
          {state.warning && <p role="alert" className="text-amber-900">{state.warning}</p>}
        </div>
      )}
      {state.error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-900">{state.error}</div>}
      <form action={action} className="grid items-end gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="demo_name" className="mb-1 block text-sm font-medium text-stone-700">Company name to show</label>
          <input id="demo_name" name="name" required minLength={2} maxLength={60} className="input" placeholder="Prospect company" />
        </div>
        <div>
          <label htmlFor="demo_industry" className="mb-1 block text-sm font-medium text-stone-700">Industry (optional)</label>
          <input id="demo_industry" name="industry" maxLength={60} className="input" placeholder="Manufacturing" />
        </div>
        <SubmitButton pendingText="Building, about 20 seconds…">Create demo client</SubmitButton>
      </form>
      <p className="text-xs text-stone-500">
        A demo client holds invented data only. Its logins see that one company and nothing else. Delete it from the list above when the demo is over.
      </p>
    </div>
  );
}
