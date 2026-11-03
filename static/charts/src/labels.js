import { exactCount } from '../../common/numbers.js';

const MAX_AIRPORTS_IN_TIP = 8;

const codes = (code, info) => (info && info.icao ? `${code} · ${info.icao}` : code);

// a distance from the page's airport, from routes_by_year: "734 miles"
const miles = (n) => `${exactCount(n)} miles`;

// Hover text for one airport: name, IATA (and ICAO) code, then city and country, and on an airport's own pages how far
// it is from that airport (`from`, with `distances` its other airports' distances)
export function airportTip(code, airports, { from, distances } = {}) {
  const far = distances?.get(code) ? `${miles(distances.get(code))} from ${from}` : '';
  const a = airports.get(code);
  if (!a) return [code, far].filter(Boolean).join('\n');
  const place = a.place || [a.city, a.country].filter(Boolean).join(', ');
  return [a.name || code, codes(code, a), place, far].filter(Boolean).join('\n');
}

// Hover text for a city row: its label, then one line per airport in the market, with its distance when there are `distances`
export function groupTip(row, airports, { distances } = {}) {
  const lines = row.codes.slice(0, MAX_AIRPORTS_IN_TIP).map((code) => {
    const a = airports.get(code);
    const far = distances?.get(code) ? ` · ${miles(distances.get(code))}` : '';
    return (a && a.name ? `${codes(code, a)}  ${a.name}` : code) + far;
  });
  const more = row.codes.length - MAX_AIRPORTS_IN_TIP;
  return [row.label, '', ...lines, ...(more > 0 ? [`+${more} more`] : [])].join('\n');
}
