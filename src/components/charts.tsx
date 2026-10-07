// Small charts drawn as plain SVG on the server: no chart library, nothing to load in the browser.
// Every chart also carries its numbers as text, so it reads the same without colour.

import { inr } from '@/lib/format';

const BRAND = '#1f7a6b';
const BRAND_LIGHT = '#8cc9bd';

function short(n: number): string {
  if (n >= 1e7) return `${(n / 1e7).toFixed(n >= 1e8 ? 0 : 1)} Cr`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(n >= 1e6 ? 0 : 1)} L`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`;
  return String(Math.round(n));
}

/** Vertical bars, one or two series per label. */
export function BarChart({ data, labels, money = false, height = 170 }: {
  data: { label: string; a: number; b?: number }[];
  labels: { a: string; b?: string };
  money?: boolean;
  height?: number;
}) {
  if (data.length === 0) return <p className="text-sm text-stone-600">Nothing to show yet.</p>;
  const max = Math.max(1, ...data.flatMap((d) => [d.a, d.b ?? 0]));
  const w = 520;
  const pad = { top: 16, bottom: 22, left: 6, right: 6 };
  const slot = (w - pad.left - pad.right) / data.length;
  const two = labels.b !== undefined;
  const bw = Math.min(two ? 22 : 36, (slot - 10) / (two ? 2 : 1));
  const plot = height - pad.top - pad.bottom;
  const fmt = (n: number) => (money ? short(n) : String(n));
  return (
    <figure>
      <svg viewBox={`0 0 ${w} ${height}`} role="img" aria-label={`${labels.a}${two ? ` and ${labels.b}` : ''} by ${data.map((d) => d.label).join(', ')}`} className="h-auto w-full text-stone-500">
        <line x1={pad.left} x2={w - pad.right} y1={height - pad.bottom} y2={height - pad.bottom} stroke="currentColor" strokeOpacity=".35" />
        {data.map((d, i) => {
          const cx = pad.left + slot * i + slot / 2;
          const ha = (d.a / max) * plot;
          const hb = ((d.b ?? 0) / max) * plot;
          const xa = two ? cx - bw - 1 : cx - bw / 2;
          return (
            <g key={d.label}>
              <rect className="bar-grow" style={{ transformBox: 'fill-box' }} x={xa} y={height - pad.bottom - ha} width={bw} height={ha} rx="2" fill={BRAND}>
                <title>{`${d.label}: ${labels.a} ${money ? `Rs ${inr(d.a)}` : d.a}`}</title>
              </rect>
              <text x={xa + bw / 2} y={height - pad.bottom - ha - 4} textAnchor="middle" fontSize="10" fill="currentColor">{fmt(d.a)}</text>
              {two && (
                <>
                  <rect className="bar-grow" style={{ transformBox: 'fill-box' }} x={cx + 1} y={height - pad.bottom - hb} width={bw} height={hb} rx="2" fill={BRAND_LIGHT}>
                    <title>{`${d.label}: ${labels.b} ${money ? `Rs ${inr(d.b ?? 0)}` : d.b}`}</title>
                  </rect>
                  <text x={cx + 1 + bw / 2} y={height - pad.bottom - hb - 4} textAnchor="middle" fontSize="10" fill="currentColor">{fmt(d.b ?? 0)}</text>
                </>
              )}
              <text x={cx} y={height - 6} textAnchor="middle" fontSize="10.5" fill="currentColor">{d.label}</text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-600">
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: BRAND }} />{labels.a}</span>
        {two && <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: BRAND_LIGHT }} />{labels.b}</span>}
        {money && <span>Rs; k = thousand, L = lakh, Cr = crore</span>}
      </figcaption>
    </figure>
  );
}

/** Horizontal bars with the value written beside each. */
export function BarList({ rows, empty = 'Nothing to show yet.' }: { rows: { label: string; value: number; href?: string }[]; empty?: string }) {
  if (rows.length === 0) return <p className="text-sm text-stone-600">{empty}</p>;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="text-sm">
          <div className="flex items-baseline justify-between gap-3">
            {r.href ? <a href={r.href} className="link truncate">{r.label}</a> : <span className="truncate text-stone-800">{r.label}</span>}
            <span className="tabular-nums text-stone-600">{r.value}</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-stone-100">
            <div className="bar-grow-x h-2 rounded-full" style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: BRAND }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** One bar split into parts, with a written legend. */
export function SplitBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-stone-100" role="img" aria-label={parts.map((p) => `${p.label} ${p.value}`).join(', ')}>
        {total > 0 && parts.filter((p) => p.value > 0).map((p) => (
          <div key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone-700">
        {parts.map((p) => (
          <li key={p.label}><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: p.color }} />{p.label} <strong className="tabular-nums text-stone-900">{p.value}</strong></li>
        ))}
      </ul>
    </div>
  );
}
