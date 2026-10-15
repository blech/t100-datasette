import { shortNames } from './names.js';

// A merged airline's members get a colour each, in this order
export const MEMBER_COLOURS = ['#4e79a7', '#f28e2c', '#59a14f', '#af7aa1', '#e15759', '#76b7b2', '#edc949', '#9c755f'];

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

// Each pair's fate between the two years, for an airline's own page. With `split`, each member airline is judged on its own
// (so a route one member stopped and another began shows as both dropped and added); otherwise the members are added up first.
export function classifyRoutes(rows, { min = 12, split = false } = {}) {
  const out = [];
  for (const r of split ? rows.map((x) => ({ ...x, airlines: x.airline ? [x.airline] : [] })) : mergeMembers(rows)) {
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

export const STATUS_COLOURS = { kept: '#2a9df4', added: '#2ca02c', dropped: '#d62728' };

// The routes to draw for year B, optionally compared with year A: every airport pair either year has coordinates for.
// Rows are carrier_routes_year rows (one per pair and member airline); `airports` maps a code to { lon, lat, isUs }.
// A pair counts in a year when it is flown `min` times. Members are added up, unless `split`, which keeps each member's
// routes apart and colours them by member (when not comparing). Returns the routes, the airports skipped for want of
// coordinates, and the members seen with their colours.
export function mapRoutes(rowsB, rowsA, airports, { min = 1, split = false } = {}) {
  const compare = Array.isArray(rowsA);
  const members = new Map();
  for (const r of [...rowsB, ...(compare ? rowsA : [])]) if (r.airline_id !== undefined && !members.has(r.airline_id)) members.set(r.airline_id, r.airline);
  const memberList = [...members].sort((x, y) => String(x[0]).localeCompare(String(y[0]))).map(([id, name], i) => ({ id, name, colour: MEMBER_COLOURS[i % MEMBER_COLOURS.length] }));
  const colourOf = new Map(memberList.map((m) => [m.id, m.colour]));

  const perYear = (rows) => {
    const out = new Map();
    for (const r of rows) {
      const key = `${r.origin}\u0000${r.dest}${split ? `\u0000${r.airline_id}` : ''}`;
      const t = out.get(key) || { origin: r.origin, dest: r.dest, airline_id: split ? r.airline_id : null, airline: split ? r.airline : null, airlines: [], deps: 0, seats: 0, passengers: 0, freight: 0 };
      for (const f of ['deps', 'seats', 'passengers', 'freight']) t[f] += Number(r[f]) || 0;
      if (r.airline && !t.airlines.includes(r.airline)) t.airlines.push(r.airline);
      out.set(key, t);
    }
    for (const [k, t] of out) if (t.deps < min) out.delete(k);
    return out;
  };
  const now = perYear(rowsB);
  const then = compare ? perYear(rowsA) : new Map();
  const routes = [];
  const skipped = new Set();
  for (const key of new Set([...now.keys(), ...then.keys()])) {
    const b = now.get(key), a = then.get(key);
    const shown = b || a;
    const from = airports.get(shown.origin);
    const to = airports.get(shown.dest);
    if (!from || !to) { skipped.add(!from ? shown.origin : shown.dest); continue; }
    const status = !compare ? null : a && b ? 'kept' : a ? 'dropped' : 'added';
    const domestic = from.isUs && to.isUs;
    routes.push({
      origin: shown.origin, dest: shown.dest, status, from: [from.lon, from.lat], to: [to.lon, to.lat],
      deps: shown.deps, seats: shown.seats, passengers: shown.passengers, freight: shown.freight,
      depsThen: a ? a.deps : 0, depsNow: b ? b.deps : 0,
      airline_id: shown.airline_id, airline: shown.airline, airlines: shown.airlines,
      service: domestic ? 'domestic' : 'international',
      colour: status ? STATUS_COLOURS[status] : split ? colourOf.get(shown.airline_id) : undefined,
    });
  }
  return { routes, skipped: [...skipped].sort(), members: memberList };
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

// Rows from airline_list -> what the search box offers: one entry per airline group, the biggest first.
// `value` is the short name (what gets typed into the box), `hint` the years and full name (which the box also searches).
export function airlineOptions(rows) {
  const latest = new Map();
  for (const r of rows) {
    const had = latest.get(r.group_id);
    if (!had || r.last_year > had.last_year) latest.set(r.group_id, r);
  }
  const entries = [...latest.values()];
  const shorts = shortNames(entries.map((r) => r.group_name));
  return entries.map((r) => ({
    id: r.group_id,
    value: shorts.get(r.group_name),
    hint: `${r.first_year}–${r.last_year}${shorts.get(r.group_name) === r.group_name ? '' : ` · ${r.group_name}`}`,
  }));
}

// the airline whose value matches what was typed or picked, ignoring case; null if none or if the text is ambiguous
export function findAirline(options, text) {
  const want = String(text).trim().toLowerCase();
  if (!want) return null;
  const hits = options.filter((o) => o.value.toLowerCase() === want);
  return hits.length === 1 ? hits[0] : null;
}
