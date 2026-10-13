export const MEASURES = {
  passengers: 'Passengers',
  deps: 'Departures',
  seats: 'Seats',
  freight: 'Freight (short tons)',
  load_factor: 'Load factor (%)',
};
export const SPLITS = { carrier: 'Carrier', aircraft: 'Aircraft', both: 'Carrier and aircraft', none: 'No split' };

const LB_PER_SHORT_TON = 2000;
const num = (v) => Number(v) || 0;
const name = (v) => (v === null || v === undefined || String(v).trim() === '' ? 'Unknown' : String(v));

const labelFor = (row, split) => {
  if (split === 'none') return 'All';
  if (split === 'carrier') return name(row.carrier);
  if (split === 'aircraft') return name(row.aircraft);
  return `${name(row.carrier)} · ${name(row.aircraft)}`;
};

function valueOf(measure, t) {
  switch (measure) {
    case 'deps': return t.deps;
    case 'seats': return t.seats;
    case 'passengers': return t.passengers;
    case 'freight': return t.freight / LB_PER_SHORT_TON;
    case 'load_factor': return t.seats > 0 ? (t.passengers / t.seats) * 100 : null;
    default: throw new Error(`Unknown measure: ${measure}`);
  }
}

// Rows from the `route` or `route_year` query -> one value per (period, series).
// Series beyond the `top` biggest overall are folded into "Other", listed last.
export function buildSeries(rows, { measure = 'passengers', split = 'carrier', top = 8 } = {}) {
  const cells = new Map(); // `${period}\u0000${label}` -> sums
  const overall = new Map(); // label -> total of the measure's base quantity
  for (const r of rows) {
    const label = labelFor(r, split);
    const t = { deps: num(r.deps), seats: num(r.total_seats), passengers: num(r.total_passengers), freight: num(r.total_freight) };
    const key = `${r.year}\u0000${label}`;
    const sum = cells.get(key) || { period: r.year, label, deps: 0, seats: 0, passengers: 0, freight: 0 };
    for (const k of ['deps', 'seats', 'passengers', 'freight']) sum[k] += t[k];
    cells.set(key, sum);
    const weight = measure === 'load_factor' ? t.passengers : Math.abs(valueOf(measure, t) ?? 0);
    overall.set(label, (overall.get(label) || 0) + weight);
  }

  const ranked = [...overall.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([l]) => l);
  const kept = new Set(ranked.slice(0, top));
  const folded = ranked.length > top;

  // merge folded series into "Other" before taking the measure (so load factor stays a ratio)
  const merged = new Map();
  for (const c of cells.values()) {
    const label = kept.has(c.label) ? c.label : 'Other';
    const key = `${c.period}\u0000${label}`;
    const m = merged.get(key) || { period: c.period, label, deps: 0, seats: 0, passengers: 0, freight: 0 };
    for (const k of ['deps', 'seats', 'passengers', 'freight']) m[k] += c[k];
    merged.set(key, m);
  }

  const points = [];
  for (const m of merged.values()) {
    const value = valueOf(measure, m);
    if (value !== null) points.push({ year: m.period, series: m.label, value });
  }
  points.sort((a, b) => a.year - b.year || a.series.localeCompare(b.series));
  const series = ranked.slice(0, top).filter((l) => points.some((p) => p.series === l));
  if (folded && points.some((p) => p.series === 'Other')) series.push('Other');
  const years = [...new Set(points.map((p) => p.year))].sort((a, b) => a - b);
  return { points, series, years, stackable: measure !== 'load_factor' };
}
