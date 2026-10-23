export const SORTS = { passengers: 'Passengers', deps: 'Departures', dests: 'Destinations', freight: 'Freight' };

// passengers as a percentage of seats, or null with no seats (an all-freight airport)
export const loadFactor = (r) => (Number(r.seats) > 0 ? (Number(r.passengers) / Number(r.seats)) * 100 : null);

// descending by `key`, ties by airport code; does not modify `rows`
export function topBy(rows, key, n) {
  return [...rows]
    .sort((a, b) => (Number(b[key]) || 0) - (Number(a[key]) || 0) || String(a.origin).localeCompare(String(b.origin)))
    .slice(0, n);
}

export function parseState(search, minYear, maxYear) {
  const q = new URLSearchParams(search || '');
  const year = Number.parseInt(q.get('year'), 10);
  const sort = q.get('sort');
  return {
    year: q.get('year') === 'all' ? 'all' : Number.isFinite(year) && year >= minYear && year <= maxYear ? year : maxYear,
    sort: Object.hasOwn(SORTS, sort) ? sort : 'passengers',
    group: q.get('group') === 'city' ? 'city' : 'airport',
  };
}

// the heading's years: one year, or the whole span for all years
export const yearLabel = (year, minYear, maxYear) => (year === 'all' ? `${minYear}–${maxYear}` : String(year));

export function toSearch(state, maxYear) {
  const q = new URLSearchParams();
  if (state.year !== maxYear) q.set('year', state.year);
  if (state.sort !== 'passengers') q.set('sort', state.sort);
  if (state.group === 'city') q.set('group', 'city');
  const s = q.toString();
  return s ? `?${s}` : '';
}

// the sort column carries over as the airport page's matrix measure (the keys are the same); destinations has no matrix
// the table's sort and the airports matrix's measure are the same setting where both have it (not destinations, not seats)
const SHARED = ['deps', 'freight'];
// and so is showing airports or cities
const search = (q) => (q.size ? `?${q}` : '');
export const matrixSearch = (sort, group = 'airport') => {
  const q = new URLSearchParams();
  if (SHARED.includes(sort)) q.set('measure', sort);
  if (group === 'city') q.set('group', 'city');
  return search(q);
};
export const tableSearch = (s) => {
  const from = new URLSearchParams(s || '');
  const q = new URLSearchParams();
  if (SHARED.includes(from.get('measure'))) q.set('sort', from.get('measure'));
  if (from.get('group') === 'city') q.set('group', 'city');
  return search(q);
};

// top_airports rows -> one row per BTS city market: its airports' totals (busiest first), named after the busiest airport's
// city, with the market's own destination count (each destination once, however many of its airports fly there). An airport
// with no market is a city of its own.
export function groupCities(rows) {
  const cities = new Map();
  for (const r of rows) {
    const key = r.market_id ? String(r.market_id) : `solo:${r.origin}`;
    const c = cities.get(key) || { key, airports: [], passengers: 0, deps: 0, seats: 0, freight: 0, dests: Number(r.market_id ? r.market_dests : r.dests) || 0 };
    c.airports.push(r);
    for (const k of ['passengers', 'deps', 'seats', 'freight']) c[k] += Number(r[k]) || 0;
    cities.set(key, c);
  }
  return [...cities.values()].map((c) => {
    const airports = [...c.airports].sort((a, b) => (Number(b.passengers) || 0) - (Number(a.passengers) || 0) || String(a.origin).localeCompare(String(b.origin)));
    // named by the city name its airports carry most between them: DCA and IAD's "Washington, DC" over BWI's "Baltimore, MD"
    const carried = new Map();
    for (const a of airports) {
      const name = a.origin_city_name || a.origin;
      carried.set(name, (carried.get(name) || 0) + (Number(a.passengers) || Number(a.deps) || 0));
    }
    const name = [...carried].sort((x, y) => y[1] - x[1])[0][0];
    return { ...c, airports, origin: airports[0].origin, name };
  });
}

export const airportHref = (code, sort) =>
  `/airports/${encodeURIComponent(code)}${sort === 'passengers' || sort === 'dests' ? '' : `?measure=${sort}`}`;
