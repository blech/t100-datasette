import { airlineOptions } from './airline.js';
import { aircraftHref } from './aircraft.js';
import { slugify } from './rollup.js';

// The options a section's find box offers, each { value, hint, href }: the value is what is typed or picked, the href the page it opens.
// `suffix` opens another view of the subject, such as '/globe' from a map.

// Rows from airport_list: one per airport, busiest first
export const airportOptions = (rows, suffix = '') => rows.map((r) => ({
  value: r.code,
  hint: `${[r.place, r.name].filter(Boolean).join(' – ')} · ${r.first_year}–${r.last_year}`,
  href: `/airports/${r.code}${suffix}`,
}));

// Rows from aircraft_list: one per aircraft with its family, busiest first. Families come first, so typing "Boeing 737" offers the family
// before its aircraft; an aircraft named as its family (the Boeing 717) is offered once, as the family.
export function aircraftOptions(rows, suffix = '') {
  const families = new Map();
  for (const r of rows) {
    const f = families.get(r.family) || { first: r.first_year, last: r.last_year };
    families.set(r.family, { first: Math.min(f.first, r.first_year), last: Math.max(f.last, r.last_year) });
  }
  const all = [
    ...[...families].map(([family, f]) => ({ value: family, hint: `Family · ${f.first}–${f.last}`, href: `/aircraft/${slugify(family)}${suffix}` })),
    ...rows.map((r) => ({ value: r.name, hint: `${r.family} · ${r.first_year}–${r.last_year}`, href: `${aircraftHref(slugify(r.family), r.name)}${suffix}` })),
  ];
  const seen = new Set();
  return all.filter((o) => !seen.has(o.value.toLowerCase()) && seen.add(o.value.toLowerCase()));
}

export const FINDERS = {
  airline: { query: 'airline_list', options: (rows, suffix = '') => airlineOptions(rows).map((o) => ({ ...o, href: `/airlines/${o.id}${suffix}` })) },
  airport: { query: 'airport_list', options: airportOptions },
  aircraft: { query: 'aircraft_list', options: aircraftOptions },
};
