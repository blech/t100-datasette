const LEGAL_ENDING = /[\s,]+(?:Inc\.?|Co\.?|LLC|L\.L\.C\.|Corp\.?|Corporation|Ltd\.?)$/;

// "Southwest Airlines Co." -> "Southwest Airlines", matching short_airline_name in the plugin
export function shortAirlineName(name) {
  let previous;
  let out = String(name);
  while (previous !== out) { previous = out; out = out.replace(LEGAL_ENDING, '').trim(); }
  return out;
}

const brand = (name) => shortAirlineName(name).replace(/\s+Air\s?Lines$/i, '') || shortAirlineName(name);

// top_carrier_history rows -> one point per year and airline, and the airlines biggest-first in the latest year
export function airlineLines(rows) {
  const points = [];
  const latest = new Map();
  for (const r of rows) {
    if (r.share === null || r.share === undefined || r.share === '') continue;
    const year = Number(r.year);
    const series = brand(r.airline_name);
    points.push({ year, series, share: Number(r.share) });
    const seen = latest.get(series);
    if (!seen || year > seen.year || (year === seen.year && Number(r.share) > seen.share)) latest.set(series, { year, share: Number(r.share) });
  }
  const series = [...latest].sort((a, b) => b[1].year - a[1].year || b[1].share - a[1].share).map(([s]) => s);
  return { series, points };
}

// line-end label positions, at least `gap` apart: crowded labels form a block centred on their lines' mean
export function spreadLabels(values, gap) {
  const order = values.map((v, i) => i).sort((a, b) => values[b] - values[a]);
  let blocks = order.map((i) => ({ members: [i], centre: values[i] }));
  const top = (b) => b.centre + (gap * (b.members.length - 1)) / 2;
  const bottom = (b) => b.centre - (gap * (b.members.length - 1)) / 2;
  for (let merged = true; merged;) {
    merged = false;
    for (let k = 0; k + 1 < blocks.length; k++) {
      const [a, b] = [blocks[k], blocks[k + 1]];
      if (bottom(a) - top(b) >= gap - 1e-9) continue;
      const members = [...a.members, ...b.members];
      blocks.splice(k, 2, { members, centre: members.reduce((s, i) => s + values[i], 0) / members.length });
      merged = true;
      break;
    }
  }
  const out = new Array(values.length);
  for (const b of blocks) b.members.forEach((i, n) => { out[i] = top(b) - n * gap; });
  return out;
}

// each year's points stacked from zero in orderOf order: y1 is a point's base, y2 its top
export function stackShares(points, orderOf, valueOf = (d) => d.share) {
  const byYear = new Map();
  for (const d of points) byYear.set(d.year, [...(byYear.get(d.year) || []), d]);
  const out = [];
  for (const year of [...byYear.keys()].sort((a, b) => a - b)) {
    let base = 0;
    for (const d of byYear.get(year).sort((a, b) => orderOf(a) - orderOf(b))) {
      out.push({ ...d, y1: base, y2: base + valueOf(d) });
      base += valueOf(d);
    }
  }
  return out;
}

export const OTHER_AIRLINES = 'Every other airline';

// top_carrier_history rows -> passenger bands per year: the airlines in series order, then the rest of the market
export function passengerBands(rows, series) {
  const points = [];
  const rest = new Map();
  for (const r of rows) {
    const year = Number(r.year);
    const passengers = Number(r.passengers);
    points.push({ year, series: brand(r.airline_name), passengers });
    rest.set(year, (rest.has(year) ? rest.get(year) : Number(r.total)) - passengers);
  }
  for (const [year, passengers] of rest) points.push({ year, series: OTHER_AIRLINES, passengers });
  const order = [...series, OTHER_AIRLINES];
  return stackShares(points, (d) => order.indexOf(d.series), (d) => d.passengers);
}

// livery colours for the airlines that have been in the top four, and distinct fallbacks for any newcomer
const LIVERY = { Southwest: '#D99A00', Delta: '#C8102E', American: '#7A8A96', United: '#1F5FD1', 'US Airways': '#2E8B57' };
const FALLBACK = ['#8E5BB5', '#2A9D8F', '#D9763A', '#5C6BC0'];

export function airlineColours(names) {
  let next = 0;
  return names.map((n) => LIVERY[n] || FALLBACK[next++ % FALLBACK.length]);
}
