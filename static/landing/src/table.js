import { countWord, abroadCountWord } from '../../common/direction.js';

export const SORTS = { passengers: 'Passengers', deps: 'Departures', dests: 'Destinations', freight: 'Freight' };
// the same, with the flight count named for the direction counted
export const sortLabels = (dir, abroad = false) => ({ ...SORTS, deps: (abroad ? abroadCountWord : countWord)(dir) });

// a label in the middle of a sentence (not the "US" in it)
export const lowerFirst = (text) => text.charAt(0).toLowerCase() + text.slice(1);

// passengers as a percentage of seats, or null with no seats (an all-freight airport)
export const loadFactor = (r) => (Number(r.seats) > 0 ? (Number(r.passengers) / Number(r.seats)) * 100 : null);

// descending by `key`, ties by airport code; does not modify `rows`
export function topBy(rows, key, n) {
  return [...rows]
    .sort((a, b) => (Number(b[key]) || 0) - (Number(a[key]) || 0) || String(a.airport).localeCompare(String(b.airport)))
    .slice(0, n);
}

export const SERVICES = ['all', 'domestic', 'international'];
export const ROW_COUNTS = [10, 25, 50];
export const DEFAULT_ROWS = 50;

// The table's address for each grouping (plugins/t100_globe.py has the same): its airports, cities, or (only abroad) countries
export const TABLE_PATHS = { airport: '/airports', city: '/airports/cities', country: '/airports/countries' };
const groupOf = (path) => Object.keys(TABLE_PATHS).find((g) => TABLE_PATHS[g] === path) || 'airport';

// The table's settings from its address: the grouping from the path, the rest from the query (the countries are abroad by their address)
export function parseState(search, minYear, maxYear, path = '/airports') {
  const q = new URLSearchParams(search || '');
  const year = Number.parseInt(q.get('year'), 10);
  const sort = q.get('sort');
  const n = Number.parseInt(q.get('n'), 10);
  const group = groupOf(path);
  const region = group === 'country' || q.get('region') === 'abroad' ? 'abroad' : 'us';
  return {
    region,
    n: ROW_COUNTS.includes(n) ? n : DEFAULT_ROWS,
    service: region === 'us' && SERVICES.includes(q.get('service')) ? q.get('service') : 'all', // abroad, every flight is international
    year: q.get('year') === 'all' ? 'all' : Number.isFinite(year) && year >= minYear && year <= maxYear ? year : maxYear,
    sort: Object.hasOwn(SORTS, sort) ? sort : 'passengers',
    group,
  };
}

// the heading's years: one year, or the whole span for all years
export const yearLabel = (year, minYear, maxYear) => (year === 'all' ? `${minYear}–${maxYear}` : String(year));

// the query for the table's settings, the grouping being in the path (tableHref)
export function toSearch(state, maxYear) {
  const q = new URLSearchParams();
  if (state.year !== maxYear) q.set('year', state.year);
  if (state.sort !== 'passengers') q.set('sort', state.sort);
  if (state.region === 'abroad' && state.group !== 'country') q.set('region', 'abroad');
  if (state.n && state.n !== DEFAULT_ROWS) q.set('n', state.n);
  if (state.service && state.service !== 'all') q.set('service', state.service);
  const s = q.toString();
  return s ? `?${s}` : '';
}

// the sort column carries over as the airport page's matrix measure (the keys are the same); destinations has no matrix
// the table's sort and the airports matrix's measure are the same setting where both have it (not destinations, not seats)
const SHARED = ['deps', 'freight'];
// and so are showing airports or cities, how many rows and which flights
const search = (q) => (q.size ? `?${q}` : '');
export const matrixSearch = (sort, group = 'airport', { n = DEFAULT_ROWS, service = 'all', region = 'us' } = {}) => {
  const q = new URLSearchParams();
  if (SHARED.includes(sort)) q.set('measure', sort);
  if (group === 'city' || (group === 'country' && region === 'abroad')) q.set('group', group);
  if (region === 'abroad') q.set('region', 'abroad');
  if (n !== DEFAULT_ROWS) q.set('n', n);
  if (service !== 'all') q.set('service', service);
  return search(q);
};
// the table's address for the airports matrix's settings (its query), at the path for the matrix's grouping
export const tableHref = (s) => {
  const from = new URLSearchParams(s || '');
  const q = new URLSearchParams();
  if (SHARED.includes(from.get('measure'))) q.set('sort', from.get('measure'));
  const abroad = from.get('region') === 'abroad';
  const group = from.get('group') === 'city' || (abroad && from.get('group') === 'country') ? from.get('group') : 'airport';
  if (abroad && group !== 'country') q.set('region', 'abroad');
  if (ROW_COUNTS.includes(Number(from.get('n'))) && Number(from.get('n')) !== DEFAULT_ROWS) q.set('n', from.get('n'));
  if (SERVICES.includes(from.get('service')) && from.get('service') !== 'all') q.set('service', from.get('service'));
  return `${TABLE_PATHS[group]}${search(q)}`;
};

// top_airports rows -> one row per BTS city market: its airports' totals (busiest first), named after the busiest airport's
// city, with the market's own destination count (each destination once, however many of its airports fly there). An airport
// with no market is a city of its own.
export function groupCities(rows, by = 'city') {
  const cities = new Map();
  for (const r of rows) {
    const country = by === 'country' && r.country;   // abroad, a country's airports: every one with a country in its city name
    const key = country ? `country:${r.country}` : r.market_id ? String(r.market_id) : `solo:${r.airport}`;
    const c = cities.get(key) || { key, airports: [], passengers: 0, deps: 0, seats: 0, freight: 0, dests: Number(country ? r.country_dests : r.market_id ? r.market_dests : r.dests) || 0 };
    c.airports.push(r);
    for (const k of ['passengers', 'deps', 'seats', 'freight']) c[k] += Number(r[k]) || 0;
    cities.set(key, c);
  }
  return [...cities.values()].map((c) => {
    const airports = [...c.airports].sort((a, b) => (Number(b.passengers) || 0) - (Number(a.passengers) || 0) || String(a.airport).localeCompare(String(b.airport)));
    // named by the city name its airports carry most between them: DCA and IAD's "Washington, DC" over BWI's "Baltimore, MD"
    const carried = new Map();
    for (const a of airports) {
      const name = a.city || a.airport;
      carried.set(name, (carried.get(name) || 0) + (Number(a.passengers) || Number(a.deps) || 0));
    }
    const name = by === 'country' && airports[0].country ? airports[0].country : [...carried].sort((x, y) => y[1] - x[1])[0][0];
    return { ...c, airports, airport: airports[0].airport, name };
  });
}

// a country's page: its name in lower case without accents, anything else between words a dash (plugins/t100_globe.py does the same)
export const countrySlug = (name) => name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const countryHref = (name, { year = 'all', dir = '' } = {}, maxYear) => {
  const q = new URLSearchParams();
  if (year !== maxYear) q.set('year', year);
  if (dir) q.set('dir', dir);
  return `${TABLE_PATHS.country}/${countrySlug(name)}${q.size ? `?${q}` : ''}`;
};

// a city row's page, /airports/cities/<market>, for a BTS market (a "solo:" airport has none): its destinations ranked by the table's
// year (the page's own default is all years), counted the table's way
export const cityHref = (key, { year = 'all', dir = '' } = {}) => {
  if (!/^[0-9]{5}$/.test(String(key))) return null;
  const q = new URLSearchParams();
  if (year !== 'all') q.set('year', year);
  if (dir) q.set('dir', dir);
  return `/airports/cities/${key}${q.size ? `?${q}` : ''}`;
};

// a country opens to its busiest airports and one row adding up the rest (a lone leftover airport is listed, not summed)
export const SHOWN_IN_COUNTRY = 5;
export function splitAirports(airports, shown = SHOWN_IN_COUNTRY) {
  if (airports.length <= shown + 1) return { shown: airports, others: [] };
  return { shown: airports.slice(0, shown), others: airports.slice(shown) };
}
export const sumOf = (rows) => Object.fromEntries(['passengers', 'deps', 'seats', 'freight'].map((k) => [k, rows.reduce((n, r) => n + (Number(r[k]) || 0), 0)]));

export const airportHref = (code, sort) =>
  `/airports/${encodeURIComponent(code)}${sort === 'passengers' || sort === 'dests' ? '' : `?measure=${sort}`}`;
