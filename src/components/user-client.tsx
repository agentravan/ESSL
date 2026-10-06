'use client';

import { useActionState } from 'react';
import { createUserAction } from '@/lib/actions/admin';
import type { LoginState } from '@/lib/actions/employees';
import { CopyBox, SubmitButton } from './client';

export function CreateUserForm({ clients }: { clients: { id: string; name: string }[] }) {
  const [state, action] = useActionState<LoginState, FormData>(createUserAction, {});
  return (
    <div className="space-y-4">
      {state.created && (
        <div className="space-y-2 rounded-md border border-emerald-300 bg-emerald-50 p-3">
          <p className="text-sm text-emerald-900">
            Login ready for <strong>{state.created.email}</strong>. Give them this temporary password now; it is not shown again, and they
            must change it when they first sign in.
          </p>
          <CopyBox label="Temporary password" value={state.created.password} />
        </div>
      )}
      {state.error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-900">{state.error}</div>}
      <form action={action} className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <label htmlFor="full_name" className="mb-1 block text-sm font-medium text-stone-700">Name</label>
          <input id="full_name" name="full_name" required maxLength={120} className="input" />
        </div>
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium text-stone-700">Email</label>
          <input id="email" name="email" type="email" required className="input" />
        </div>
        <div>
          <label htmlFor="role" className="mb-1 block text-sm font-medium text-stone-700">Kind of login</label>
          <select id="role" name="role" className="input" defaultValue="firm_staff">
            <option value="firm_staff">Office staff: all clients</option>
            <option value="firm_admin">Administrator: everything</option>
            <option value="client_hr">Client HR: one client only</option>
          </select>
        </div>
        <div>
          <label htmlFor="client_id" className="mb-1 block text-sm font-medium text-stone-700">Client (for client HR)</label>
          <select id="client_id" name="client_id" className="input" defaultValue="">
            <option value="">Not applicable</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <SubmitButton pendingText="Creating…">Create login</SubmitButton>
      </form>
    </div>
  );
}
