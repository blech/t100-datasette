import { exactCount } from '../../common/numbers.js';
import { yearDomain } from './span.js';
import { pairLabel } from '../../common/direction.js';

// Rows from the family_by_year / carrier_group_by_year queries -> the shape the matrix reads
// (one row per "dest" and year), so the /aircraft and /airlines pages reuse buildMatrix as it is.
export function rollupRows(rows, { key, kind = 'all' }) {
  return rows
    .filter((r) => kind === 'all' || !r.kind || r.kind === kind) // rows with no kind (an airline's routes) can't be split by it
    .map((r) => ({ dest: r[key], year: r.year, service: r.service, deps: r.deps, seats: r.seats, passengers: r.passengers, freight: r.freight }));
}

// Rows from carrier_route_by_year -> rows named by their airport pair: "ATL ↔ LGA" with both directions together, or with
// each direction its own row, "ATL → LGA" as flown
export function routeRows(rows, { each = false } = {}) {
  return rows.map((r) => ({
    route: pairLabel(r.origin, r.dest, each), origin: r.origin, dest: r.dest, year: r.year, service: r.service,
    deps: r.deps, seats: r.seats, passengers: r.passengers, freight: r.freight,
  }));
}

// the distance bands' lower bounds in miles, as build_database.py cuts them; a range runs from one to a later one, or to any
const BAND_EDGES = ['0', '500', '1500', '3000', '5000'];
const miles = exactCount;
export const BAND_FROM = BAND_EDGES.map((v) => ({ value: v, label: miles(v) }));
export const BAND_TO = [...BAND_EDGES.slice(1).map((v) => ({ value: v, label: miles(v) })), { value: 'any', label: 'any distance' }];
const LONG_HAUL = { from: '3000', to: 'any' };

// a range from the URL or the menus: an unknown lower bound opens the long haul, and an upper bound at or below the
// lower one moves to the next cut point up
export function bandRange(from, to) {
  if (!BAND_EDGES.includes(from)) return { ...LONG_HAUL };
  const above = BAND_TO.map((b) => b.value).filter((v) => v === 'any' || Number(v) > Number(from));
  return { from, to: above.includes(to) ? to : above[0] };
}

// the page's single band menu before it had a range (?eband=), as the same range
export function legacyBand(band) {
  if (band === null || band === undefined) return null;
  if (band === 'all') return { from: '0', to: 'any' };
  if (band === '3000') return { from: '3000', to: 'any' };
  const i = BAND_EDGES.indexOf(band);
  return i < 0 ? null : { from: band, to: BAND_EDGES[i + 1] };
}

// BTS aircraft groups, in the order they are stacked
export const ENGINE_SERIES = ['Two jet engines', 'Three jet engines', 'Four or more jet engines', 'Turboprop', 'Piston and helicopter'];

const SERIES_OF = { 6: 'Two jet engines', 7: 'Three jet engines', 8: 'Four or more jet engines', 4: 'Turboprop', 5: 'Turboprop' };
const seriesOf = (group) => SERIES_OF[Number(group)] || 'Piston and helicopter';

const LB_PER_SHORT_TON = 2000;

// Rows from engines_by_year -> each aircraft group's share of one measure in each year, for the distance bands from
// `from` up to, not including, `to` ('any' for no upper bound).
export function buildEngineShares(rows, { measure = 'deps', kind = 'passenger', from = '0', to = 'any', service = 'all' } = {}) {
  const amounts = new Map(); // year -> series -> amount
  for (const r of rows) {
    if (kind !== 'all' && r.kind !== kind) continue;
    if (service !== 'all' && r.service !== service) continue;
    if (Number(r.distance_band) < Number(from) || (to !== 'any' && Number(r.distance_band) >= Number(to))) continue;
    const v = (Number(r[measure]) || 0) / (measure === 'freight' ? LB_PER_SHORT_TON : 1);
    const byYear = amounts.get(Number(r.year)) || new Map();
    amounts.set(Number(r.year), byYear);
    const s = seriesOf(r.aircraft_group);
    byYear.set(s, (byYear.get(s) || 0) + v);
  }
  const points = [];
  const years = [];
  for (const year of [...amounts.keys()].sort((a, b) => a - b)) {
    const byYear = amounts.get(year);
    const total = [...byYear.values()].reduce((a, b) => a + b, 0);
    if (total <= 0) continue;
    years.push(year);
    for (const series of ENGINE_SERIES) {
      const amount = byYear.get(series) || 0;
      if (amount > 0) points.push({ year, series, amount, share: amount / total });
    }
  }
  const used = ENGINE_SERIES.filter((s) => points.some((p) => p.series === s));
  return { points, years, series: used };
}

// "DC-9 / MD-80 / MD-90" -> "dc-9-md-80-md-90": the family's address on /aircraft/<slug>. Plugin and page share this rule.
export const slugify = (name) => String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');


const SERVICE_LABELS = { domestic: 'Domestic', international: 'International' };
export const SPLIT_LABEL = {
  subfamily: (r) => r.subfamily || 'All variants',
  airline: (r) => r.group_name || 'Unknown carrier',
  maker: (r) => r.maker || 'Unknown maker',
  service: (r) => SERVICE_LABELS[r.service] || r.service,
  aircraft: (r) => r.aircraft_name || 'Unknown aircraft',
  all: () => 'All flights',
};

// A family has versions to split by only when its types fall into more than one named subfamily
export const hasVersions = (rows) => new Set(rows.map((r) => r.subfamily).filter(Boolean)).size > 1;

// Rows from family_detail -> one aircraft family's value per year, split by subfamily, airline group or route type.
// Subfamilies run in the order they first flew; airlines and the rest by total, the smaller ones folded into "Other".
export function buildFamilySeries(rows, { measure = 'passengers', kind = 'all', service = 'all', split = 'subfamily', top = 8, aircraftKind = 'all', keep = new Set() } = {}) {
  const label = SPLIT_LABEL[split];
  const cells = new Map(); // `${year}\u0000${series}` -> value
  const totals = new Map();
  const first = new Map();
  for (const r of rows) {
    if (aircraftKind !== 'all' && slugify(r.aircraft_kind || '') !== aircraftKind) continue;
    if (kind !== 'all' && r.kind !== kind) continue;
    if (service !== 'all' && r.service !== service) continue;
    const v = (Number(r[measure]) || 0) / (measure === 'freight' ? LB_PER_SHORT_TON : 1);
    if (v <= 0) continue;
    const year = Number(r.year);
    const series = label(r);
    const key = `${year}\u0000${series}`;
    cells.set(key, (cells.get(key) || 0) + v);
    totals.set(series, (totals.get(series) || 0) + v);
    first.set(series, Math.min(first.get(series) ?? Infinity, year));
  }
  let order = [...totals.keys()];
  if (split === 'subfamily') order.sort((a, b) => first.get(a) - first.get(b) || totals.get(b) - totals.get(a));
  else if (split === 'service') order.sort();
  else order.sort((a, b) => totals.get(b) - totals.get(a) || a.localeCompare(b));
  const folded = (split === 'airline' || split === 'maker' || split === 'aircraft') && order.length > top;
  // the top series; one asked for by name from further down (a highlighted airline) takes the last places instead,
  // so there are never more than `top` named series and each keeps a colour of its own
  const extra = order.slice(top).filter((s) => keep.has(s));
  const kept = folded ? [...order.slice(0, Math.max(0, top - extra.length)), ...extra] : order;
  const shown = new Set(kept);
  const merged = new Map();
  for (const [key, value] of cells) {
    const [year, series] = key.split('\u0000');
    const name = shown.has(series) ? series : 'Other';
    const k = `${year}\u0000${name}`;
    merged.set(k, (merged.get(k) || 0) + value);
  }
  const points = [...merged].map(([k, value]) => {
    const [year, series] = k.split('\u0000');
    return { year: Number(year), series, value };
  }).sort((a, b) => a.year - b.year);
  const series = folded ? [...kept, 'Other'] : kept;
  return { points, series, years: yearDomain(points.map((p) => p.year)) };
}
