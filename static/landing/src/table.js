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
    year: Number.isFinite(year) && year >= minYear && year <= maxYear ? year : maxYear,
    sort: Object.hasOwn(SORTS, sort) ? sort : 'passengers',
  };
}

export function toSearch(state, maxYear) {
  const q = new URLSearchParams();
  if (state.year !== maxYear) q.set('year', state.year);
  if (state.sort !== 'passengers') q.set('sort', state.sort);
  const s = q.toString();
  return s ? `?${s}` : '';
}

// the sort column carries over as the airport page's matrix measure (the keys are the same); destinations has no matrix
// the table's sort and the airports matrix's measure are the same setting where both have it (not destinations, not seats)
const SHARED = ['deps', 'freight'];
export const matrixSearch = (sort) => (SHARED.includes(sort) ? `?measure=${sort}` : '');
export const tableSearch = (search) => {
  const measure = new URLSearchParams(search || '').get('measure');
  return SHARED.includes(measure) ? `?sort=${measure}` : '';
};

export const airportHref = (code, sort) =>
  `/airports/${encodeURIComponent(code)}${sort === 'passengers' || sort === 'dests' ? '' : `?measure=${sort}`}`;
