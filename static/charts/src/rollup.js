import { exactCount } from '../../common/numbers.js';
import { yearDomain } from './span.js';
import { pairLabel } from '../../common/direction.js';

// Rows from the family_by_year / carrier_group_by_year queries -> the shape the matrix reads
// (one row per "dest" and year), so the /aircraft and /airlines pages reuse buildMatrix as it is.
export function rollupRows(rows, { key, kind = 'all' }) {
  return rows
    .filter((r) => kind === 'all' || !r.kind || r.kind === kind) // rows with no kind (an airline's routes) can't be split by it
    .map((r) => ({ dest: r[key], year: r.year, service: r.service, deps: r.deps, seats: r.seats, passengers: r.passengers, freight: r.freight,
      ...(r.rest ? { rest: true } : {}) }));
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

// Rows from top_routes_by_year -> the routes matrix's rows for one range of distance bands (from bandRange): each pair named as
// routeRows names it, with its distance, and the year's totals for the range's bands (rest), which the matrix's shares count
export function topRouteRows(rows, { from = '0', to = 'any' } = {}) {
  const inRange = (band) => Number(band) >= Number(from) && (to === 'any' || Number(band) < Number(to));
  return rows.filter((r) => inRange(r.band)).map((r) => ({
    ...(r.rest ? {} : { route: pairLabel(r.origin, r.dest, false), origin: r.origin, dest: r.dest }),
    year: r.year, service: r.service, distance: r.distance, rest: Boolean(r.rest),
    deps: r.deps, seats: r.seats, passengers: r.passengers, freight: r.freight,
  }));
}

// a city market pair's key, from top_markets_by_year's ma and mb (market ids, or "solo:" and an airport code)
export const marketKey = (r) => `${r.ma}~${r.mb}`;
// "San Francisco, CA" -> "San Francisco"
const town = (name) => String(name || '').split(', ')[0];
// a market pair's name, its two towns in alphabetical order, and whether that puts mb's first
export function marketLabel(r) {
  const a = town(r.name_a) || r.ma;
  const b = town(r.name_b) || r.mb;
  const flip = b.localeCompare(a) < 0;
  return { label: flip ? `${b} ↔ ${a}` : `${a} ↔ ${b}`, flip };
}

// a city market pair's page, its markets in the order its name has them
export function marketPath(r) {
  const { flip } = marketLabel(r);
  return `/airports/cities/${flip ? r.mb : r.ma}/${flip ? r.ma : r.mb}`;
}

// Rows from top_markets_by_year -> the routes matrix's rows by city for one range of distance bands (from bandRange), as
// topRouteRows gives airport pairs: each market pair is a row keyed by marketKey (its name is marketLabel's), and the year's
// totals for the range's bands (rest)
export function topMarketRows(rows, { from = '0', to = 'any' } = {}) {
  const inRange = (band) => Number(band) >= Number(from) && (to === 'any' || Number(band) < Number(to));
  return rows.filter((r) => inRange(r.band)).map((r) => ({
    ...(r.rest ? {} : { route: marketKey(r) }),
    year: r.year, service: r.service, distance: r.distance, rest: Boolean(r.rest),
    deps: r.deps, seats: r.seats, passengers: r.passengers, freight: r.freight,
  }));
}

// Rows from market_pairs_by_year -> a city pair page's rows: each airport pair named in the order of the page's markets
// ("LAX ↔ SFO" on Los Angeles ↔ San Francisco), not alphabetically as routeRows names them. Narrowed to one airport on a side
// (`a` in the first market, `b` in the second: ?b=VNY), only its pairs are rows, and every pair comes again as a rest row, so a
// year's shares are still of all the flying between the two cities
export function marketPairRows(rows, { a = '', b = '' } = {}) {
  const named = rows.map((r) => ({ ...r, route: `${r.origin} ↔ ${r.dest}` }));
  if (!a && !b) return named;
  const kept = named.filter((r) => (!a || r.origin === a) && (!b || r.dest === b));
  return [...kept, ...rows.map((r) => ({ ...r, rest: true }))];
}

// A city pair page's choice of rows, for the `count` airport pairs its settings can show: more than ten, a menu of the top Ns shorter
// than that, then all of them (as n=50, which no city pair has more pairs than); ten or fewer, just the words. `n` is the one asked for.
export function rowsChoice(count, n = 50) {
  const route = count === 1 ? 'route' : 'routes';
  if (count <= 10) return { text: `${count === 1 ? 'its one' : count === 2 ? 'both' : `all ${count}`} ${route}` };
  const options = [10, 25].filter((k) => k < count).map((k) => ({ value: String(k), label: `top ${k}` }));
  options.push({ value: '50', label: count <= 50 ? `all ${count}` : 'top 50' });
  return { options, value: options.some((o) => o.value === String(n)) ? String(n) : '50', text: route };
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
