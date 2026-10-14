export function indexAirports(rows) {
  const m = new Map();
  for (const r of rows) {
    m.set(r.code, {
      code: r.code, name: r.name, city: r.city, country: r.country,
      place: r.place || [r.city, r.country].filter(Boolean).join(', '),
      lat: r.latitude, lon: r.longitude, isUs: Boolean(r.is_us),
    });
  }
  return m;
}

export function placeRoutes(rows, origin, airports) {
  const from = airports.get(origin);
  if (!from) return { routes: [], skipped: [], originMissing: true };
  const skipped = new Set();
  const routes = [];
  for (const r of rows) {
    const to = airports.get(r.dest);
    if (!to) { skipped.add(r.dest); continue; }
    routes.push({ ...r, from: [from.lon, from.lat], to: [to.lon, to.lat], destCity: to.place, destName: to.name });
  }
  return { routes, skipped: [...skipped].sort(), originMissing: false };
}

// airports listed by top_us_airports as map dots; those without coordinates are left out
export function placePoints(rows, airports) {
  const pts = [];
  for (const r of rows) {
    const a = airports.get(r.origin);
    if (!a) continue;
    pts.push({ code: r.origin, city: r.origin_city_name, pos: [a.lon, a.lat], passengers: r.total_passengers });
  }
  return pts;
}

export const yearsIn = (rows) => [...new Set(rows.map((r) => r.year))].sort((a, b) => a - b);
export const forYear = (routes, year) => routes.filter((r) => r.year === year);
export const forMonth = (routes, month) => routes.filter((r) => r.month === month);
export const forService = (routes, service) => (service === 'all' ? routes : routes.filter((r) => r.service === service));

// destinations in `rows` (already limited to the period on screen) that have no coordinates
export function skippedFor(rows, airports) {
  const skipped = new Set();
  for (const r of rows) if (!airports.has(r.dest)) skipped.add(r.dest);
  return [...skipped].sort();
}

// why an origin can't be drawn: no flights at all beats no coordinates
export function originProblem(rows, airports, origin) {
  if (!rows.length) return 'no-data';
  if (!airports.has(origin)) return 'no-coordinates';
  return null;
}
