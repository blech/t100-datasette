export const SORTS = { passengers: 'Passengers', deps: 'Departures', seats: 'Seats', freight: 'Freight' };

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

// the sort column carries over as the airport page's heat map measure (the keys are the same)
export const airportHref = (code, sort) =>
  `/airports/${encodeURIComponent(code)}${sort === 'passengers' ? '' : `?measure=${sort}`}`;
