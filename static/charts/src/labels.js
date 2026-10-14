const MAX_AIRPORTS_IN_TIP = 8;

const codes = (code, info) => (info && info.icao ? `${code} · ${info.icao}` : code);

// Hover text for one airport: name, IATA (and ICAO) code, then city and country
export function airportTip(code, airports) {
  const a = airports.get(code);
  if (!a) return code;
  const place = a.place || [a.city, a.country].filter(Boolean).join(', ');
  return [a.name || code, codes(code, a), place].filter(Boolean).join('\n');
}

// Hover text for a city row: its label, then one line per airport in the market
export function groupTip(row, airports) {
  const lines = row.codes.slice(0, MAX_AIRPORTS_IN_TIP).map((code) => {
    const a = airports.get(code);
    return a && a.name ? `${codes(code, a)}  ${a.name}` : code;
  });
  const more = row.codes.length - MAX_AIRPORTS_IN_TIP;
  return [row.label, '', ...lines, ...(more > 0 ? [`+${more} more`] : [])].join('\n');
}
