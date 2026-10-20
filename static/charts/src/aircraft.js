import { slugify } from './rollup.js';

const LB_PER_SHORT_TON = 2000;

// The aircraft kinds the pages offer; BTS's kind text starts with one of these words ("Jet, four-engine")
export const KIND_OPTIONS = [
  { value: 'all', label: 'all aircraft' },
  { value: 'Jet', label: 'jets' },
  { value: 'Turboprop', label: 'turboprops' },
  { value: 'Piston', label: 'piston aircraft' },
  { value: 'Helicopter', label: 'helicopters' },
];

export const kindMatches = (aircraftKind, value) => value === 'all' || String(aircraftKind || '').startsWith(value);

const amount = (row, measure) => (Number(row[measure]) || 0) / (measure === 'freight' ? LB_PER_SHORT_TON : 1);
const byValue = (a, b) => b.value - a.value || a.name.localeCompare(b.name);

// Rows from type_table (one per aircraft type, with the chosen year's totals) -> families, each with its types.
// Types are filtered by kind and maker; a family's maker and kind are those of its busiest type. Families with
// nothing in the year are left out unless the search `q` names them (or one of their types). Shares are of
// everything the kind and maker filters leave, not of what the search shows.
export function groupFamilies(rows, { measure = 'passengers', kind = 'all', maker = 'all', q = '' } = {}) {
  const needle = String(q).trim().toLowerCase();
  const byFamily = new Map();
  for (const r of rows) {
    if (!kindMatches(r.aircraft_kind, kind)) continue;
    if (maker !== 'all' && r.maker !== maker) continue;
    const fam = byFamily.get(r.family) || { family: r.family, slug: slugify(r.family), types: [] };
    byFamily.set(r.family, fam);
    fam.types.push({
      typeId: r.type_id, name: r.name, maker: r.maker, aircraftKind: r.aircraft_kind,
      firstYear: Number(r.first_year) || null, lastYear: Number(r.last_year) || null, value: amount(r, measure), share: 0,
    });
  }
  const sum = (types) => types.reduce((s, x) => s + x.value, 0);
  const total = [...byFamily.values()].reduce((s, f) => s + sum(f.types), 0);
  const families = [];
  for (const fam of byFamily.values()) {
    const value = sum(fam.types);
    const nameHit = fam.family.toLowerCase().includes(needle);
    const typeHits = needle ? fam.types.filter((x) => x.name.toLowerCase().includes(needle)) : fam.types;
    if (needle && !nameHit && !typeHits.length) continue;
    if (value <= 0 && !needle) continue;
    const busiest = [...fam.types].sort(byValue)[0];
    const firsts = fam.types.map((x) => x.firstYear).filter(Boolean);
    // an open family lists the types that have something in the chosen measure; a search naming a type lists it even at zero
    const seen = fam.types.filter((x) => x.value > 0);
    const types = (nameHit ? seen : typeHits).sort(byValue);
    for (const x of types) x.share = total > 0 ? x.value / total : 0;
    families.push({
      family: fam.family, slug: fam.slug, maker: busiest.maker, aircraftKind: busiest.aircraftKind,
      firstYear: firsts.length ? Math.min(...firsts) : null, lastYear: Math.max(0, ...fam.types.map((x) => x.lastYear || 0)) || null,
      value, share: total > 0 ? value / total : 0, matched: Boolean(needle) && !nameHit, types,
    });
  }
  families.sort((a, b) => b.value - a.value || a.family.localeCompare(b.family));
  return { families, total };
}

const TEXT_KEYS = new Set(['family', 'maker', 'aircraftKind']);

export function sortFamilies(families, key, dir = 'desc') {
  const sign = dir === 'asc' ? 1 : -1;
  return [...families].sort((a, b) => {
    const x = a[key], y = b[key];
    const c = TEXT_KEYS.has(key) ? String(x).localeCompare(String(y)) : (x ?? -Infinity) - (y ?? -Infinity);
    return sign * c || a.family.localeCompare(b.family);
  });
}
