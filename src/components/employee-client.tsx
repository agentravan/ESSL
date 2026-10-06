'use client';

import { useActionState } from 'react';
import {
  createEmployeeLoginAction, resetPasswordAction, revealSecretsAction, type LoginState, type RevealState,
} from '@/lib/actions/employees';
import { CopyBox, SubmitButton } from './client';

export function RevealIds({ employeeId }: { employeeId: string }) {
  const [state, action] = useActionState<RevealState, FormData>(revealSecretsAction, {});
  if (state.values) {
    return (
      <dl className="grid gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm sm:grid-cols-3">
        <div><dt className="text-xs text-stone-600">PAN</dt><dd className="font-mono">{state.values.pan || '—'}</dd></div>
        <div><dt className="text-xs text-stone-600">Aadhaar</dt><dd className="font-mono">{state.values.aadhaar || '—'}</dd></div>
        <div><dt className="text-xs text-stone-600">Bank account</dt><dd className="font-mono">{state.values.account || '—'}</dd></div>
      </dl>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="employee_id" value={employeeId} />
      <SubmitButton className="btn-secondary" pendingText="Opening…">Show full numbers</SubmitButton>
      <span className="text-xs text-stone-500">Each viewing is written to the activity log.</span>
      {state.error && <span role="alert" className="text-sm text-red-700">{state.error}</span>}
    </form>
  );
}

function OneTimePassword({ state }: { state: LoginState }) {
  if (!state.created) return null;
  return (
    <div className="space-y-2 rounded-md border border-emerald-300 bg-emerald-50 p-3">
      <p className="text-sm text-emerald-900">
        Login ready for <strong>{state.created.email}</strong>. Give them this temporary password now; it is not shown again, and
        they must change it when they first sign in.
      </p>
      <CopyBox label="Temporary password" value={state.created.password} />
    </div>
  );
}

export function CreateEmployeeLogin({ employeeId }: { employeeId: string }) {
  const [state, action] = useActionState<LoginState, FormData>(createEmployeeLoginAction, {});
  if (state.created) return <OneTimePassword state={state} />;
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="employee_id" value={employeeId} />
      <SubmitButton className="btn-secondary" pendingText="Creating…">Create login</SubmitButton>
      {state.error && <span role="alert" className="text-sm text-red-700">{state.error}</span>}
    </form>
  );
}

export function ResetPassword({ userId }: { userId: string }) {
  const [state, action] = useActionState<LoginState, FormData>(resetPasswordAction, {});
  if (state.created) return <OneTimePassword state={state} />;
  return (
    <form action={action} className="inline-flex flex-wrap items-center gap-3">
      <input type="hidden" name="user_id" value={userId} />
      <SubmitButton className="btn-secondary" pendingText="Resetting…">Reset password</SubmitButton>
      {state.error && <span role="alert" className="text-sm text-red-700">{state.error}</span>}
    </form>
  );
}
