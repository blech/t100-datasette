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

const CODES_IN_LABEL = 3;

// Same grid, but airports in one BTS city market are one row. Groups with several airports can be
// opened (`open` lists market ids), which puts their airports on rows directly beneath.
export function buildCityHeatmap(rows, { measure = 'passengers', service = 'all', n = 25, open = [] } = {}) {
  const kept = service === 'all' ? rows : rows.filter((r) => r.service === service);
  const openSet = new Set(open.map(String));
  const groups = new Map(); // key -> { total, airports: Map(dest -> {total, name, nameYear, byYear}), byYear: Map(year -> {value, parts: Map}) }
  const yearSet = new Set();
  for (const r of kept) {
    yearSet.add(r.year);
    const key = r.market_id !== null && r.market_id !== undefined && r.market_id !== '' ? String(r.market_id) : `solo:${r.dest}`;
    const v = valueOf(r, measure);
    const g = groups.get(key) || { key, total: 0, airports: new Map(), byYear: new Map() };
    groups.set(key, g);
    g.total += v;
    const a = g.airports.get(r.dest) || { dest: r.dest, total: 0, name: null, nameYear: -Infinity, byYear: new Map() };
    g.airports.set(r.dest, a);
    a.total += v;
    if (r.city && r.year >= a.nameYear) { a.name = r.city; a.nameYear = r.year; }
    a.byYear.set(r.year, (a.byYear.get(r.year) || 0) + v);
    const cell = g.byYear.get(r.year) || { value: 0, parts: new Map() };
    g.byYear.set(r.year, cell);
    cell.value += v;
    cell.parts.set(r.dest, (cell.parts.get(r.dest) || 0) + v);
  }

  const byVolume = (a, b) => b.total - a.total || a.dest.localeCompare(b.dest);
  const ranked = [...groups.values()]
    .filter((g) => g.total > 0)
    .map((g) => ({ ...g, list: [...g.airports.values()].filter((a) => a.total > 0).sort(byVolume) }))
    .sort((a, b) => b.total - a.total || a.list[0].dest.localeCompare(b.list[0].dest))
    .slice(0, n);

  const outRows = [];
  const cells = [];
  for (const g of ranked) {
    const lead = g.list[0];
    const shown = g.list.slice(0, CODES_IN_LABEL).map((a) => a.dest).join(', ');
    const extra = g.list.length - CODES_IN_LABEL;
    const expandable = g.list.length > 1;
    const isOpen = expandable && openSet.has(g.key);
    outRows.push({
      key: g.key, kind: 'group', label: `${lead.name || lead.dest} · ${shown}${extra > 0 ? ` +${extra}` : ''}`,
      expandable, open: isOpen, codes: g.list.map((a) => a.dest),
    });
    for (const [year, cell] of g.byYear) {
      if (cell.value <= 0) continue;
      const parts = [...cell.parts].map(([dest, value]) => ({ dest, value })).filter((p) => p.value > 0)
        .sort((a, b) => b.value - a.value || a.dest.localeCompare(b.dest));
      cells.push({ row: g.key, year, value: cell.value, parts });
    }
    if (isOpen) {
      for (const a of g.list) {
        const key = `${g.key}/${a.dest}`;
        outRows.push({ key, kind: 'airport', code: a.dest, groupKey: g.key, label: a.dest, name: a.name });
        for (const [year, value] of a.byYear) if (value > 0) cells.push({ row: key, year, value });
      }
    }
  }
  const order = new Map(outRows.map((r, i) => [r.key, i]));
  cells.sort((x, y) => x.year - y.year || order.get(x.row) - order.get(y.row));
  return { rows: outRows, years: [...yearSet].sort((a, b) => a - b), cells };
}
