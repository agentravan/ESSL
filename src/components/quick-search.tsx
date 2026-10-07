'use client';

// The search box in the header. Opens with Ctrl+K (Cmd+K on a Mac) or by pressing the button.

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

interface Hit {
  kind: string;
  label: string;
  sub: string;
  href: string;
}

export function QuickSearch() {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);

  const open = () => {
    const d = dialog.current;
    if (!d || d.open) return;
    setQ('');
    setActive(0);
    d.showModal();
    input.current?.focus();
  };
  const close = () => dialog.current?.close();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        const res = await fetch('/api/search', {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ q }), signal: controller.signal,
        });
        const data = (await res.json()) as { hits: Hit[] };
        setHits(data.hits ?? []);
        setActive(0);
      } catch {
        /* a newer search replaced this one, or the network dropped */
      } finally {
        setBusy(false);
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q]);

  const go = (hit: Hit | undefined) => {
    if (!hit) return;
    close();
    router.push(hit.href);
  };

  return (
    <>
      <button type="button" onClick={open} className="btn-secondary gap-2 px-2.5 py-1.5" aria-label="Search (Ctrl K)">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <span className="hidden sm:inline">Search</span>
        <kbd className="hidden rounded border border-stone-300 px-1 text-[10px] text-stone-500 md:inline">Ctrl K</kbd>
      </button>
      <dialog
        ref={dialog}
        className="w-[min(34rem,calc(100vw-2rem))] rounded-lg border border-stone-200 bg-white p-0 text-stone-900 shadow-xl backdrop:bg-black/40"
        onClick={(e) => { if (e.target === dialog.current) close(); }}
        aria-label="Search"
      >
        <div className="border-b border-stone-200 p-3">
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              else if (e.key === 'Enter') { e.preventDefault(); go(hits[active]); }
            }}
            className="input"
            placeholder="Search a client, an employee or a screen…"
            aria-label="Search"
            autoComplete="off"
          />
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-1.5" role="listbox" aria-label="Results">
          {hits.length === 0 && <li className="px-3 py-4 text-sm text-stone-600">{busy ? 'Searching…' : q.trim().length < 2 ? 'Type at least two letters.' : 'Nothing found.'}</li>}
          {hits.map((h, i) => (
            <li key={h.href + h.label} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(h)}
                className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm ${i === active ? 'bg-stone-100' : ''}`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-stone-900">{h.label}</span>
                  {h.sub && <span className="block truncate text-xs text-stone-500">{h.sub}</span>}
                </span>
                <span className="shrink-0 text-xs uppercase tracking-wide text-stone-500">{h.kind}</span>
              </button>
            </li>
          ))}
        </ul>
      </dialog>
    </>
  );
}
