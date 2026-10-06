'use client';

// The few pieces that need to run in the browser.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useFormStatus } from 'react-dom';
import { useState, type ReactNode } from 'react';

export function Tabs({ tabs }: { tabs: { href: string; label: string; exact?: boolean }[] }) {
  const pathname = usePathname();
  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Sections">
      {tabs.map((t) => {
        const active = t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(t.href + '/');
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? 'page' : undefined}
            className={
              'whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ' +
              (active ? 'border-brand-600 text-brand-700' : 'border-transparent text-stone-600 hover:border-stone-300 hover:text-stone-900')
            }
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function SubmitButton({ children, pendingText = 'Saving…', className = 'btn-primary', name, value }: {
  children: ReactNode;
  pendingText?: string;
  className?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} name={name} value={value}>
      {pending ? pendingText : children}
    </button>
  );
}

/** A button that asks "are you sure?" in the page itself before submitting its form. */
export function ConfirmSubmit({ label, question, confirmLabel, className = 'btn-danger', pendingText = 'Working…' }: {
  label: string;
  question: string;
  confirmLabel: string;
  className?: string;
  pendingText?: string;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button type="button" className={className} onClick={() => setAsking(true)}>
        {label}
      </button>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <span>{question}</span>
      <SubmitButton className={className} pendingText={pendingText}>
        {confirmLabel}
      </SubmitButton>
      <button type="button" className="btn-secondary" onClick={() => setAsking(false)}>
        Cancel
      </button>
    </span>
  );
}

/** Shows a value once on request (used for one-time passwords). */
export function CopyBox({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-stone-600">{label}</span>
      <code className="rounded bg-stone-900 px-2.5 py-1.5 font-mono text-sm text-white">{value}</code>
      <button
        type="button"
        className="btn-secondary"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}
