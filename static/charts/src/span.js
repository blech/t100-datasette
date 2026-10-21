// Which years a chart's year axis shows: only the years the data has ("flown"), or every year from the first to the last
// ("all"), so charts for different families, routes or airlines line up when you flip between tabs.
export const SPAN_OPTIONS = { flown: 'years flown', all: 'all years' };

export const parseSpan = (value) => (value === 'all' ? 'all' : 'flown');

// `years`: the years that have data. Returns a sorted list of numbers. A year outside min..max is kept, never dropped.
export function yearDomain(years, { span = 'flown', min, max } = {}) {
  const have = [...new Set(years.map(Number))];
  if (span === 'all' && Number.isFinite(min) && Number.isFinite(max)) {
    for (let y = min; y <= max; y++) have.push(y);
  }
  return [...new Set(have)].sort((a, b) => a - b);
}
