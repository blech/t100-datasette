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

export const labelFor = (row, split) => {
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
export function buildSeries(rows, { measure = 'passengers', split = 'carrier', top = 8, periodKey = 'year', keep = new Set() } = {}) {
  const cells = new Map(); // `${period}\u0000${label}` -> sums
  const overall = new Map(); // label -> total of the measure's base quantity
  for (const r of rows) {
    const label = labelFor(r, split);
    const t = { deps: num(r.deps), seats: num(r.total_seats), passengers: num(r.total_passengers), freight: num(r.total_freight) };
    const period = Number(r[periodKey]);
    const key = `${period}\u0000${label}`;
    const sum = cells.get(key) || { period, label, deps: 0, seats: 0, passengers: 0, freight: 0 };
    for (const k of ['deps', 'seats', 'passengers', 'freight']) sum[k] += t[k];
    cells.set(key, sum);
    const weight = measure === 'load_factor' ? t.passengers : Math.abs(valueOf(measure, t) ?? 0);
    overall.set(label, (overall.get(label) || 0) + weight);
  }

  const ranked = [...overall.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([l]) => l);
  // the top series, and any asked for by name (a highlighted airline is never folded into Other)
  const kept = new Set([...ranked.slice(0, top), ...ranked.filter((l) => keep.has(l))]);
  const folded = ranked.length > kept.size;

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
    if (value !== null) points.push({ period: m.period, series: m.label, value });
  }
  points.sort((a, b) => a.period - b.period || a.series.localeCompare(b.series));
  const series = ranked.filter((l) => kept.has(l) && points.some((p) => p.series === l));
  if (folded && points.some((p) => p.series === 'Other')) series.push('Other');
  const periods = [...new Set(points.map((p) => p.period))].sort((a, b) => a - b);
  return { points, series, periods, stackable: measure !== 'load_factor' };
}

// One row per carrier, aircraft, or carrier and aircraft pair (or a single row of totals), following the chart's
// split, summed over the rows given, biggest passenger total first
export function aggregateTable(rows, split = 'both') {
  const byCarrier = split === 'carrier' || split === 'both';
  const byAircraft = split === 'aircraft' || split === 'both';
  const groups = new Map();
  for (const r of rows) {
    const carrier = byCarrier ? name(r.carrier) : null;
    const aircraft = byAircraft ? name(r.aircraft) : null;
    const key = `${carrier}\u0000${aircraft}`;
    const t = groups.get(key) || {
      carrier, aircraft, groupId: byCarrier ? r.group_id || null : null, family: byAircraft ? r.family || null : null,
      deps: 0, seats: 0, passengers: 0, freight: 0,
    };
    t.deps += num(r.deps);
    t.seats += num(r.total_seats);
    t.passengers += num(r.total_passengers);
    t.freight += num(r.total_freight) / LB_PER_SHORT_TON;
    groups.set(key, t);
  }
  return [...groups.values()]
    .map((t) => ({ ...t, loadFactor: t.seats > 0 ? (t.passengers / t.seats) * 100 : null }))
    .sort((a, b) => b.passengers - a.passengers || String(a.carrier).localeCompare(String(b.carrier)) || String(a.aircraft).localeCompare(String(b.aircraft)));
}
