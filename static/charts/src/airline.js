// Rows from carrier_route_changes (one per airport pair, with departures in year A and year B) ->
// each pair's fate between the two years, for an airline's own page.
export function classifyRoutes(rows, { min = 12 } = {}) {
  const out = [];
  for (const r of rows) {
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
// With no comparison year, each route is coloured by whether both ends are in the US.
// `rowsB` and `rowsA` are carrier_routes_year rows; `airports` maps a code to { lon, lat, isUs }.
export function mapRoutes(rowsB, rowsA, airports) {
  const compare = Array.isArray(rowsA);
  const byPair = new Map();
  const add = (rows, which) => {
    for (const r of rows) {
      const key = `${r.origin}\u0000${r.dest}`;
      const entry = byPair.get(key) || { origin: r.origin, dest: r.dest, a: null, b: null };
      entry[which] = r;
      byPair.set(key, entry);
    }
  };
  add(rowsB, 'b');
  if (compare) add(rowsA, 'a');
  const routes = [];
  const skipped = new Set();
  for (const { origin, dest, a, b } of byPair.values()) {
    const from = airports.get(origin);
    const to = airports.get(dest);
    if (!from || !to) { skipped.add(!from ? origin : dest); continue; }
    const status = !compare ? null : a && b ? 'kept' : a ? 'dropped' : 'added';
    const shown = b || a;
    const domestic = from.isUs && to.isUs;
    routes.push({
      origin, dest, status, from: [from.lon, from.lat], to: [to.lon, to.lat],
      deps: shown.deps, seats: shown.seats, passengers: shown.passengers, freight: shown.freight,
      depsThen: a ? a.deps : 0, depsNow: b ? b.deps : 0,
      service: domestic ? 'domestic' : 'international',
      colour: status ? STATUS_COLOURS[status] : undefined,
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
