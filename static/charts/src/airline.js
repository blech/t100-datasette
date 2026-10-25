import { shortName, shortNames } from './names.js';
import { compareYears } from '../../globe/src/compare.js';

// Rows from carrier_route_changes (one per airport pair and member airline, with departures in years A and B) ->
// one row per pair, the members' flying added up. `airlines` names the members who flew it in either year.
export function mergeMembers(rows) {
  const byPair = new Map();
  for (const r of rows) {
    const key = `${r.origin}\u0000${r.dest}`;
    const t = byPair.get(key) || { ...r, deps_a: 0, deps_b: 0, pax_a: 0, deps_all: 0, first_ym: r.first_ym, last_ym: r.last_ym, airlines: [] };
    t.deps_a += Number(r.deps_a) || 0;
    t.deps_b += Number(r.deps_b) || 0;
    t.pax_a += Number(r.pax_a) || 0;
    t.deps_all += Number(r.deps_all) || 0;
    t.first_ym = Math.min(t.first_ym, r.first_ym);
    t.last_ym = Math.max(t.last_ym, r.last_ym);
    if (r.airline && !t.airlines.includes(r.airline)) t.airlines.push(r.airline);
    byPair.set(key, t);
  }
  return [...byPair.values()];
}

// Each pair's fate between the two years, for an airline's own page. A merged group's members are added up first, so a route
// one member stopped and another took over counts as kept.
export function classifyRoutes(rows, { min = 12 } = {}) {
  const out = [];
  for (const r of mergeMembers(rows)) {
    const a = Number(r.deps_a) >= min;
    const b = Number(r.deps_b) >= min;
    if (!a && !b) continue;
    out.push({ ...r, status: a && b ? 'kept' : a ? 'dropped' : 'added' });
  }
  return out;
}

export function summariseRoutes(routes) {
  const counts = { kept: 0, dropped: 0, added: 0 };
  for (const r of routes) counts[r.status] += 1;
  return counts;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// 201902 -> "Feb 2019"
export function formatYearMonth(ym) {
  const n = Number(ym);
  if (!n) return '';
  return `${MONTHS[(n % 100) - 1] || ''} ${Math.floor(n / 100)}`.trim();
}

// Domestic when more than half the departures on the pair that year were filed in the domestic data, as the airport map decides it;
// rows without that count (an older table) fall back on both ends being US airports
function serviceOf(t, from, to) {
  if (t.domesticDeps === null) return from.isUs && to.isUs ? 'domestic' : 'international';
  return t.domesticDeps * 2 > t.deps ? 'domestic' : 'international';
}

// The routes to draw for year B, optionally compared with year A: every airport pair either year has coordinates for.
// Rows are carrier_routes_year rows (one per pair and member airline, which are added up); `airports` maps a code to { lon, lat, isUs }.
// A pair counts in a year when it is flown `min` times. Returns the routes and the airports skipped for want of coordinates.
export function mapRoutes(rowsB, rowsA, airports, { min = 1 } = {}) {
  const compare = Array.isArray(rowsA);
  const perYear = (rows) => {
    const out = new Map();
    for (const r of rows) {
      const key = `${r.origin}\u0000${r.dest}`;
      const t = out.get(key) || { origin: r.origin, dest: r.dest, airlines: [], deps: 0, seats: 0, passengers: 0, freight: 0, domesticDeps: null };
      for (const f of ['deps', 'seats', 'passengers', 'freight']) t[f] += Number(r[f]) || 0;
      if (r.domestic_deps != null) t.domesticDeps = (t.domesticDeps || 0) + Number(r.domestic_deps);
      if (r.airline && !t.airlines.includes(r.airline)) t.airlines.push(r.airline);
      out.set(key, t);
    }
    for (const [k, t] of out) if (t.deps < min) out.delete(k);
    return out;
  };
  const now = perYear(rowsB);
  const then = compare ? perYear(rowsA) : null;
  const routes = [];
  const skipped = new Set();
  for (const t of compareYears([...now.values()], then && [...then.values()], (x) => `${x.origin}\u0000${x.dest}`)) {
    const from = airports.get(t.origin);
    const to = airports.get(t.dest);
    if (!from || !to) { skipped.add(!from ? t.origin : t.dest); continue; }
    routes.push({
      origin: t.origin, dest: t.dest, status: t.status, from: [from.lon, from.lat], to: [to.lon, to.lat],
      deps: t.deps, seats: t.seats, passengers: t.passengers, freight: t.freight,
      depsThen: t.depsThen ?? 0, depsNow: t.depsNow ?? t.deps, airlines: t.airlines,
      service: serviceOf(t, from, to),
    });
  }
  return { routes, skipped: [...skipped].sort() };
}

// Where to point the camera: the average direction of every route end, as a [lon, lat] in degrees
export function centreOf(routes) {
  let x = 0, y = 0, z = 0;
  for (const r of routes) {
    for (const [lon, lat] of [r.from, r.to]) {
      const lo = (lon * Math.PI) / 180, la = (lat * Math.PI) / 180;
      x += Math.cos(la) * Math.cos(lo); y += Math.cos(la) * Math.sin(lo); z += Math.sin(la);
    }
  }
  if (!x && !y && !z) return [-96, 38];
  return [(Math.atan2(y, x) * 180) / Math.PI, (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI];
}

// Rows from airline_list (each group, and each member of a merged group) -> what the search box offers, the biggest first.
// `value` is the short name (what gets typed into the box), `hint` the years and full name (which the box also searches).
export function airlineOptions(rows) {
  const latest = new Map();
  for (const r of rows) {
    const had = latest.get(r.id);
    if (!had || r.last_year > had.last_year) latest.set(r.id, r);
  }
  const entries = [...latest.values()];
  const shorts = shortNames(entries.map((r) => r.name));
  return entries.map((r) => {
    const value = shorts.get(r.name);
    const notes = [value === r.name ? '' : r.name, r.parent ? `part of ${shortName(r.parent)}` : ''].filter(Boolean);
    return { id: r.id, value, hint: [`${r.first_year}–${r.last_year}`, ...notes].join(' · ') };
  });
}

// the airline whose value matches what was typed or picked, ignoring case; null if none or if the text is ambiguous
export function findAirline(options, text) {
  const want = String(text).trim().toLowerCase();
  if (!want) return null;
  const hits = options.filter((o) => o.value.toLowerCase() === want);
  return hits.length === 1 ? hits[0] : null;
}
