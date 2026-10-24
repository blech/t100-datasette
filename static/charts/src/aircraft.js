import { slugify } from './rollup.js';

const LB_PER_SHORT_TON = 2000;

// Menus built from the data: every kind and every maker, each with the short form used in the URL (jet-twin-engine, boeing)
const byLabel = (a, b) => a.label.localeCompare(b.label);
const options = (values, all) => [all, ...[...new Set(values)].filter(Boolean).map((v) => ({ value: slugify(v), label: v })).sort(byLabel)];
export const kindOptions = (rows) => options(rows.map((r) => r.aircraft_kind), { value: 'all', label: 'all aircraft' });
// The maker menu lists makers with something to show: of the chosen kind and, given a measure, with some of it in the year
export const makerOptions = (rows, { kind = 'all', measure } = {}) => options(
  rows.filter((r) => kindMatches(r.aircraft_kind, kind) && (!measure || amount(r, measure) > 0)).map((r) => r.maker),
  { value: 'all', label: 'any maker' },
);

// An aircraft's page sits under its family's: /aircraft/boeing-737/boeing-737-800
export const aircraftHref = (familySlug, name) => `/aircraft/${familySlug}/${slugify(name)}`;

export const kindMatches = (aircraftKind, value) => value === 'all' || slugify(aircraftKind || '') === value;

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
    if (maker !== 'all' && slugify(r.maker || '') !== maker) continue;
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

// The limit menu, worded for what the table lists
export const limitOptions = (plural, singular) => [
  { value: 'top15', label: `the top 15 ${plural}` },
  { value: 'top20', label: `the top 20 ${plural}` },
  { value: 'top50', label: `the top 50 ${plural}` },
  { value: 'all', label: `every ${singular}` },
  { value: 'min1', label: `${plural} with at least 1%` },
  { value: 'min0.1', label: `${plural} with at least 0.1%` },
];
export const LIMIT_OPTIONS = limitOptions('families', 'family');
export const DEFAULT_LIMIT = 'top20';

// The families to list: the top N by value, or those whose share is at least a percentage. Applied to the ranking by
// value whatever column the table is sorted by, and not at all while searching. Also returns how many were left out
// and the share of the total that the listed ones make up.
export function limitFamilies(families, limit, { searching = false } = {}) {
  const nameOf = (x) => x.family ?? x.name;  // an aircraft family or an airline group
  const ranked = [...families].sort((a, b) => b.value - a.value || nameOf(a).localeCompare(nameOf(b)));
  let shown = ranked;
  if (!searching) {
    const top = /^top(\d+)$/.exec(limit);
    const min = /^min(\d+(?:\.\d+)?)$/.exec(limit);
    if (top) shown = ranked.slice(0, Number(top[1]));
    else if (min) shown = ranked.filter((f) => f.share * 100 >= Number(min[1]));
  }
  return { shown, hidden: ranked.length - shown.length, shownShare: shown.reduce((s, f) => s + f.share, 0) };
}

const ROW_LABEL_MAX = 34;

// a matrix row's label, where the label column has little room: a maker's "(other models)" is "(other)", and a long
// aircraft name is cut (the full name is the row's hover text)
export function rowLabel(name) {
  const short = String(name).replace(' (other models)', ' (other)').replace(', one or two engines', ', 1–2 engines');
  return short.length > ROW_LABEL_MAX ? `${short.slice(0, ROW_LABEL_MAX - 1).trimEnd()}…` : short;
}
