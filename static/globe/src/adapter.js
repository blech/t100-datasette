export function indexAirports(rows) {
  const m = new Map();
  for (const r of rows) {
    m.set(r.code, {
      code: r.code, name: r.name, city: r.city, country: r.country,
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
    routes.push({ ...r, from: [from.lon, from.lat], to: [to.lon, to.lat], destCity: to.city, destName: to.name });
  }
  return { routes, skipped: [...skipped].sort(), originMissing: false };
}

export const yearsIn = (rows) => [...new Set(rows.map((r) => r.year))].sort((a, b) => a - b);
export const forYear = (routes, year) => routes.filter((r) => r.year === year);
export const forMonth = (routes, month) => routes.filter((r) => r.month === month);
