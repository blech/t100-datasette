// The year in focus on a route's chart over time (?year=, from a matrix cell or a year's page going up): marked on the
// chart when it shows that year, and carried by links to a route's chart over time, either way round, but no others.

export const parseFocus = (search, domain) => {
  const year = new URLSearchParams(search).get('year');
  return year !== null && domain.includes(year) ? year : null;
};

const CHART_OVER_TIME = /^\/airports\/[A-Z0-9]{3}\/[A-Z0-9]{3}$/;

// the query a link to `pathname` gets: the page's settings, with the year in focus only on a chart over time
export function focusSearch(pathname, search, focus) {
  const q = new URLSearchParams(search);
  q.delete('year');
  if (focus !== null && CHART_OVER_TIME.test(pathname)) q.set('year', focus);
  const s = q.toString();
  return s ? `?${s}` : '';
}
