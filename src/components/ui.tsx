// Small set of building blocks shared by every screen. Server components unless noted.

import Link from 'next/link';
import type { ReactNode } from 'react';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

export function PageHeader({ title, subtitle, actions, back }: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="mb-5">
      {back && (
        <Link href={back.href} className="mb-1 inline-block text-sm text-stone-500 hover:text-stone-800">
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-stone-900 sm:text-2xl">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-stone-600">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Card({ title, children, className, actions }: {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
}) {
  return (
    <section className={cx('card', className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-stone-900">{title}</h2>
          {actions}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

/** Success and error messages passed in the address bar (?msg= / ?err=). */
export function Flash({ params }: { params: Record<string, string | string[] | undefined> }) {
  const msg = typeof params.msg === 'string' ? params.msg : null;
  const err = typeof params.err === 'string' ? params.err : null;
  if (!msg && !err) return null;
  return (
    <div className="mb-4 space-y-2">
      {msg && (
        <div role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">
          {msg}
        </div>
      )}
      {err && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-900">
          {err}
        </div>
      )}
    </div>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'error'; children: ReactNode }) {
  const tones = {
    info: 'border-sky-200 bg-sky-50 text-sky-900',
    warn: 'border-amber-300 bg-amber-50 text-amber-900',
    error: 'border-red-200 bg-red-50 text-red-900',
  };
  return <div className={cx('rounded-md border px-4 py-2.5 text-sm', tones[tone])}>{children}</div>;
}

export function Badge({ tone = 'grey', children }: { tone?: 'grey' | 'green' | 'amber' | 'red' | 'blue'; children: ReactNode }) {
  const tones = {
    grey: 'bg-stone-100 text-stone-700',
    green: 'bg-emerald-100 text-emerald-800',
    amber: 'bg-amber-100 text-amber-900',
    red: 'bg-red-100 text-red-800',
    blue: 'bg-sky-100 text-sky-800',
  };
  return <span className={cx('inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium', tones[tone])}>{children}</span>;
}

export function Field({ label, name, hint, children, className }: {
  label: string;
  name: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={name} className="mb-1 block text-sm font-medium text-stone-700">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-stone-500">{hint}</p>}
    </div>
  );
}

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'name' | 'className'> & {
  label: string;
  name: string;
  hint?: ReactNode;
  className?: string;
};

export function TextField({ label, name, hint, className, ...rest }: InputProps) {
  return (
    <Field label={label} name={name} hint={hint} className={className}>
      <input id={name} name={name} className="input" {...rest} />
    </Field>
  );
}

export function SelectField({ label, name, hint, className, options, defaultValue, required }: {
  label: string;
  name: string;
  hint?: ReactNode;
  className?: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <Field label={label} name={name} hint={hint} className={className}>
      <select id={name} name={name} className="input" defaultValue={defaultValue ?? ''} required={required}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function CheckField({ label, name, defaultChecked, hint }: {
  label: string;
  name: string;
  defaultChecked?: boolean;
  hint?: ReactNode;
}) {
  return (
    <label className="flex items-start gap-2.5 text-sm text-stone-800">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 h-4 w-4 rounded border-stone-300 text-brand-600" />
      <span>
        {label}
        {hint && <span className="block text-xs text-stone-500">{hint}</span>}
      </span>
    </label>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-stone-300 bg-white px-4 py-8 text-center text-sm text-stone-600">{children}</div>;
}

export function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="card overflow-x-auto">
      <table className="min-w-full divide-y divide-stone-200">{children}</table>
    </div>
  );
}

export function DefList({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">{k}</dt>
          <dd className="mt-0.5 break-words text-sm text-stone-900">{v || <span className="text-stone-400">Not set</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="card px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-stone-900">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-stone-500">{sub}</div>}
    </div>
  );
}
