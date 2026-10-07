// Small pure helpers for the dashboard screens.

export interface UpcomingDate {
  id: string;
  name: string;
  kind: 'birthday' | 'anniversary';
  date: string; // the coming occurrence, yyyy-mm-dd
  years: number;
}

function nextOccurrence(iso: string, today: string): { date: string; years: number } {
  const year = Number(today.slice(0, 4));
  let md = iso.slice(5);
  const leap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const on = (y: number) => `${y}-${md === '02-29' && !leap(y) ? '02-28' : md}`;
  let y = year;
  if (on(y) < today) y += 1;
  md = iso.slice(5);
  return { date: on(y), years: y - Number(iso.slice(0, 4)) };
}

function addDaysIso(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Birthdays and work anniversaries falling in the next `days` days, soonest first. */
export function upcomingDates(people: { id: string; full_name: string; dob: string | null; doj: string | null }[], today: string, days: number): UpcomingDate[] {
  const until = addDaysIso(today, days);
  const out: UpcomingDate[] = [];
  for (const p of people) {
    if (p.dob) {
      const n = nextOccurrence(p.dob, today);
      if (n.date <= until) out.push({ id: p.id, name: p.full_name, kind: 'birthday', date: n.date, years: n.years });
    }
    if (p.doj) {
      const n = nextOccurrence(p.doj, today);
      if (n.date <= until && n.years >= 1) out.push({ id: p.id, name: p.full_name, kind: 'anniversary', date: n.date, years: n.years });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}
