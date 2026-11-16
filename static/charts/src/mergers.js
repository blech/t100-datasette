import { stackShares, OTHER_AIRLINES, brand, airlineColours } from '../../home/src/airlines.js';

// a colour mixed toward white by t (0 is the colour, 1 is white), as "#rrggbb"
export function shade(hex, t) {
  const channel = (i) => Math.round(parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) * (1 - t) + 255 * t);
  return `#${[0, 1, 2].map((i) => channel(i).toString(16).padStart(2, '0')).join('')}`;
}

// Rows from carrier_member_by_year -> the mergers chart: the airline groups that absorbed another, each survivor's band with its
// absorbed airlines stacked on it in lighter shades of its colour, then everyone else. Survivors are ordered by their size in the
// latest year, absorbed airlines by their size over all years.
//   series  the bands, bottom to top, the last being OTHER_AIRLINES
//   bands   one { year, series, passengers, y1, y2 } per band and year (as passengerBands gives the front page)
//   groups  [{ id, name, survivor, members }] with series names, survivor first
//   colours series -> colour;   years  [first, last]
export function mergerBands(rows) {
  const flown = new Map(); // airline_id -> { id, group, groupName, name, total, byYear: Map(year -> passengers) }
  const totals = new Map(); // year -> every airline's passengers
  for (const r of rows) {
    const passengers = Number(r.passengers) || 0;
    totals.set(r.year, (totals.get(r.year) || 0) + passengers);
    const a = flown.get(r.airline_id) || { id: r.airline_id, group: r.group_id, groupName: r.group_name, name: r.airline_name, total: 0, byYear: new Map() };
    flown.set(r.airline_id, a);
    a.total += passengers;
    a.byYear.set(r.year, (a.byYear.get(r.year) || 0) + passengers);
  }
  const years = [...totals.keys()].sort((a, b) => a - b);
  const latest = years.at(-1);
  const inLatest = (a) => a.byYear.get(latest) || 0;

  const byGroup = new Map();
  for (const a of flown.values()) if (a.total > 0) byGroup.set(a.group, [...(byGroup.get(a.group) || []), a]);
  const groups = [...byGroup.entries()]
    .filter(([, members]) => members.length > 1)
    .map(([id, members]) => {
      const ordered = [...members].sort((a, b) => inLatest(b) - inLatest(a) || b.total - a.total || a.id.localeCompare(b.id));
      return { id, name: members[0].groupName, airlines: [ordered[0], ...ordered.slice(1).sort((a, b) => b.total - a.total || a.id.localeCompare(b.id))] };
    })
    .sort((a, b) => inLatest(b.airlines[0]) - inLatest(a.airlines[0]) || a.id.localeCompare(b.id));

  // a series is named for its airline; two with the same short name are told apart by their id
  const everyone = groups.flatMap((g) => g.airlines);
  const uses = new Map();
  for (const a of everyone) uses.set(brand(a.name), (uses.get(brand(a.name)) || 0) + 1);
  const seriesOf = new Map(everyone.map((a) => [a.id, uses.get(brand(a.name)) > 1 ? `${brand(a.name)} (${a.id})` : brand(a.name)]));

  const survivorColours = airlineColours(groups.map((g) => brand(g.airlines[0].name)));
  const colours = new Map();
  groups.forEach((g, i) => g.airlines.forEach((a, j) => colours.set(seriesOf.get(a.id), j === 0 ? survivorColours[i] : shade(survivorColours[i], Math.min(0.8, 0.3 + 0.2 * (j - 1))))));

  const series = [...everyone.map((a) => seriesOf.get(a.id)), OTHER_AIRLINES];
  const points = [];
  for (const a of everyone) for (const [year, passengers] of a.byYear) points.push({ year, series: seriesOf.get(a.id), passengers });
  for (const year of years) {
    const listed = everyone.reduce((sum, a) => sum + (a.byYear.get(year) || 0), 0);
    points.push({ year, series: OTHER_AIRLINES, passengers: totals.get(year) - listed });
  }
  const bands = stackShares(points, (d) => series.indexOf(d.series), (d) => d.passengers);

  return {
    series,
    bands,
    groups: groups.map((g) => ({ id: g.id, name: g.name, survivor: seriesOf.get(g.airlines[0].id), members: g.airlines.map((a) => seriesOf.get(a.id)) })),
    colours,
    years: [years[0], latest],
  };
}
