export const SORTS = { passengers: 'Passengers', deps: 'Departures', seats: 'Seats', freight: 'Freight' };

const LB_PER_SHORT_TON = 2000;

// Whole numbers with commas below a million; 1.2M / 3.4B above
export function formatCount(n) {
  const v = Number(n) || 0;
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  return Math.round(v).toLocaleString('en-US');
}

export const formatTons = (pounds) => `${formatCount((Number(pounds) || 0) / LB_PER_SHORT_TON)} tons`;

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
