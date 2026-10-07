'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { importEmployeesAction, type ImportState } from '@/lib/actions/import';
import { SubmitButton } from './client';

export function ImportEmployeesForm({ clientId }: { clientId: string }) {
  const [state, action] = useActionState<ImportState, FormData>(importEmployeesAction, {});
  return (
    <div className="space-y-4">
      <form action={action} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="client_id" value={clientId} />
        <div>
          <label htmlFor="file" className="mb-1 block text-sm font-medium text-stone-700">Excel (.xlsx) or CSV file</label>
          <input id="file" name="file" type="file" required accept=".xlsx,.csv" className="input max-w-sm file:mr-3 file:rounded file:border-0 file:bg-stone-100 file:px-3 file:py-1 file:text-sm" />
        </div>
        <SubmitButton pendingText="Checking…">Check and import</SubmitButton>
      </form>
      {state.error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-900">{state.error}</div>}
      {state.imported !== undefined && (
        <div role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">
          {state.imported} employee(s) imported from {state.fileName}.{' '}
          <Link href={`/c/${clientId}/employees`} className="font-medium underline">See the employee list</Link>
        </div>
      )}
      {state.problems && state.problems.length > 0 && (
        <div role="alert" className="rounded-md border border-red-200 bg-white">
          <p className="border-b border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-900">
            Nothing was imported. {state.problems.length} thing(s) to fix in {state.fileName}, then upload it again.
          </p>
          <div className="max-h-96 overflow-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr><th className="th">Line</th><th className="th">Column</th><th className="th">Problem</th></tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {state.problems.map((p, i) => (
                  <tr key={i}><td className="td tabular-nums">{p.line}</td><td className="td">{p.column}</td><td className="td">{p.message}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {state.matchedColumns && state.matchedColumns.length > 0 && (
        <p className="text-xs text-stone-600">Columns read: {state.matchedColumns.join(', ')}.</p>
      )}
      {state.ignoredColumns && state.ignoredColumns.length > 0 && (
        <p className="text-xs text-stone-600">Columns not used: {state.ignoredColumns.join(', ')}.</p>
      )}
    </div>
  );
}
