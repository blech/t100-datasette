// Which data a page shows: the T-100 site's own (the t100 database, pages under /airports/) or the European airports'
// (the t_avia database, from Eurostat and the CAA, pages under /airports/europe/), from <body data-database>. The shared
// charts ask this for their queries and data links, how they count a destination, and where an airport links.
// Design: docs/superpowers/specs/2026-11-18-european-airports-design.md.

const body = () => (typeof document === 'undefined' ? null : document.body);

export const EUROPE_BASE = '/airports/europe';
export const database = () => body()?.dataset.database || 't100';
export const isEurope = () => database() === 't_avia';
// where this page's airports and routes are: /airports/LHR, /airports/LHR/JFK, or /airports/europe/LHR/JFK
export const airportsBase = () => (isEurope() ? EUROPE_BASE : '/airports');

// a destination counts by its flights on a T-100 page and by its passengers on a European one, where the CAA's years have
// no flights and Eurostat publishes only routes of about 10,000 passengers a year
export const countBy = () => (body()?.dataset.countBy === 'passengers' ? 'passengers' : 'deps');

// where an airport's page is. On a T-100 page, always its own. On a European page it depends on the airport, from the
// airports query's `page` column (info: code -> row): a European airport's page here, a US airport's T-100 page, and
// otherwise none (null): neither source has its whole network.
export function airportHref(code, suffix = '', info = null, europe = isEurope()) {
  const c = encodeURIComponent(code);
  if (!europe) return `/airports/${c}${suffix}`;
  const page = info?.get?.(code)?.page;
  if (page === 'europe') return `${EUROPE_BASE}/${c}${suffix}`;
  if (page === 't100') return `/airports/${c}${suffix}`;
  return null;
}

// where a route's page is: T-100's, or on a European page its European one (which leads to the reporting end's report itself)
export const routeHref = (a, b, year = '', europe = isEurope()) =>
  `${europe ? EUROPE_BASE : '/airports'}/${encodeURIComponent(a)}/${encodeURIComponent(b)}${year ? `/${year}` : ''}`;
