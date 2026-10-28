// Which years a chart's year axis shows: from the data's first year to its last ("flown"), or every year from the site's
// first to its last ("all"), so charts for different families, routes or airlines line up when you flip between tabs.
export const SPAN_OPTIONS = { flown: 'years flown', all: 'all years' };

export const parseSpan = (value) => (value === 'all' ? 'all' : 'flown');

// `years`: the years that have data. Returns a sorted list of numbers with no gaps, so a quiet year shows as an empty slot
// rather than vanishing. A year outside min..max is kept, never dropped.
export function yearDomain(years, { span = 'flown', min, max } = {}) {
  const have = years.map(Number).filter(Number.isFinite);
  if (span === 'all' && Number.isFinite(min) && Number.isFinite(max)) have.push(min, max);
  if (!have.length) return [];
  const out = [];
  for (let y = Math.min(...have); y <= Math.max(...have); y++) out.push(y);
  return out;
}
