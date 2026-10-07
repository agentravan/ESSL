'use client';

import { useActionState, useRef, useState } from 'react';
import { importPunchesAction, punchAction, type PunchImportState } from '@/lib/actions/attendance';
import { SubmitButton } from './client';

/** Punch in / out. When the office has a location set, the browser is asked for the position first. */
export function PunchButtons({ next, needsLocation }: { next: 'in' | 'out'; needsLocation: boolean }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [coords, setCoords] = useState<{ lat: string; lng: string }>({ lat: '', lng: '' });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const locateThenSubmit = () => {
    setProblem('');
    if (!navigator.geolocation) {
      setProblem('This browser cannot share its location.');
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6) });
        setBusy(false);
        setTimeout(() => formRef.current?.requestSubmit(), 0);
      },
      () => {
        setBusy(false);
        setProblem('Location was not shared. Allow location access for this site and try again.');
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };
  return (
    <form ref={formRef} action={punchAction} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="kind" value={next} />
      <input type="hidden" name="lat" value={coords.lat} />
      <input type="hidden" name="lng" value={coords.lng} />
      {needsLocation && !coords.lat ? (
        <button type="button" className="btn-primary px-6 py-3 text-base" onClick={locateThenSubmit} disabled={busy}>
          {busy ? 'Finding your location…' : next === 'in' ? 'Punch in' : 'Punch out'}
        </button>
      ) : (
        <SubmitButton className="btn-primary px-6 py-3 text-base" pendingText="Recording…">{next === 'in' ? 'Punch in' : 'Punch out'}</SubmitButton>
      )}
      {needsLocation && <span className="text-xs text-stone-500">Your location is checked against the office.</span>}
      {problem && <span role="alert" className="text-sm text-red-700">{problem}</span>}
    </form>
  );
}

export function PunchImportForm({ clientId }: { clientId: string }) {
  const [state, action] = useActionState<PunchImportState, FormData>(importPunchesAction, {});
  return (
    <div className="space-y-4">
      <form action={action} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="client_id" value={clientId} />
        <div>
          <label htmlFor="file" className="mb-1 block text-sm font-medium text-stone-700">Excel (.xlsx) or CSV file</label>
          <input id="file" name="file" type="file" required accept=".xlsx,.csv,.txt" className="input max-w-sm file:mr-3 file:rounded file:border-0 file:bg-stone-100 file:px-3 file:py-1 file:text-sm" />
        </div>
        <SubmitButton pendingText="Checking…">Check and upload</SubmitButton>
      </form>
      {state.error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-900">{state.error}</div>}
      {state.imported !== undefined && (
        <div role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">
          {state.imported} punch(es) added from {state.fileName} ({state.layout}).
          {state.skipped ? ` ${state.skipped} were already there and were skipped.` : ''} Open the Daily register to see them.
        </div>
      )}
      {state.problems && state.problems.length > 0 && (
        <div role="alert" className="rounded-md border border-red-200 bg-white">
          <p className="border-b border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-900">
            Nothing was uploaded. {state.problems.length} thing(s) to fix in {state.fileName}, then upload it again.
          </p>
          <div className="max-h-96 overflow-auto">
            <table className="min-w-full text-sm">
              <thead><tr><th className="th">Line</th><th className="th">Column</th><th className="th">Problem</th></tr></thead>
              <tbody className="divide-y divide-stone-100">
                {state.problems.map((p, i) => <tr key={i}><td className="td tabular-nums">{p.line}</td><td className="td">{p.column}</td><td className="td">{p.message}</td></tr>)}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
