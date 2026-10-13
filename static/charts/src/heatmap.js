export const HEAT_MEASURES = { passengers: 'Passengers', deps: 'Departures', seats: 'Seats', freight: 'Freight (short tons)' };

const LB_PER_SHORT_TON = 2000;
const valueOf = (row, measure) => {
  const v = Number(row[measure]) || 0;
  return measure === 'freight' ? v / LB_PER_SHORT_TON : v;
};

// Rows from routes_by_year (one per destination, year and service) -> a destination-by-year grid.
// Destinations are ranked by the measure summed over all years; only the top `n` are kept.
export function buildHeatmap(rows, { measure = 'passengers', service = 'all', n = 25 } = {}) {
  const kept = service === 'all' ? rows : rows.filter((r) => r.service === service);
  const cellMap = new Map(); // `${dest}\u0000${year}` -> value
  const totals = new Map();
  const yearSet = new Set();
  for (const r of kept) {
    yearSet.add(r.year);
    const v = valueOf(r, measure);
    const key = `${r.dest}\u0000${r.year}`;
    cellMap.set(key, (cellMap.get(key) || 0) + v);
    totals.set(r.dest, (totals.get(r.dest) || 0) + v);
  }
  const dests = [...totals.entries()]
    .filter(([, t]) => t > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([d]) => d);
  const top = new Set(dests);
  const cells = [];
  for (const [key, value] of cellMap) {
    const [dest, year] = key.split('\u0000');
    if (top.has(dest) && value > 0) cells.push({ dest, year: Number(year), value });
  }
  cells.sort((a, b) => a.year - b.year || dests.indexOf(a.dest) - dests.indexOf(b.dest));
  return { dests, years: [...yearSet].sort((a, b) => a - b), cells };
}
