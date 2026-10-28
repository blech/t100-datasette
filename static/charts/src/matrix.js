import { yearDomain } from './span.js';
export const MATRIX_MEASURES = { passengers: 'Passengers', deps: 'Departures', seats: 'Seats', freight: 'Freight (short tons)' };

const LB_PER_SHORT_TON = 2000;
const valueOf = (row, measure) => {
  const v = Number(row[measure]) || 0;
  return measure === 'freight' ? v / LB_PER_SHORT_TON : v;
};

// Rows from routes_by_year (one per destination, year and service) -> a destination-by-year grid.
// Destinations are ranked by the measure summed over all years, or in `rankYear` alone (which drops
// destinations that did not fly then); only the top `n` are kept, and their whole history is shown.
export function buildMatrix(rows, { measure = 'passengers', service = 'all', n = 25, rankYear = null } = {}) {
  const kept = service === 'all' ? rows : rows.filter((r) => r.service === service);
  const cellMap = new Map(); // `${dest}\u0000${year}` -> value
  const totals = new Map(); // what ranks a destination
  const yearSet = new Set();
  const yearTotals = {}; // year -> the measure over every destination, for the share of each year
  for (const r of kept) {
    yearSet.add(r.year);
    const v = valueOf(r, measure);
    yearTotals[r.year] = (yearTotals[r.year] || 0) + v;
    const key = `${r.dest}\u0000${r.year}`;
    cellMap.set(key, (cellMap.get(key) || 0) + v);
    if (rankYear === null || Number(r.year) === rankYear) totals.set(r.dest, (totals.get(r.dest) || 0) + v);
  }
  const dests = [...totals.entries()]
    .filter(([, t]) => t > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([d]) => d);
  const top = new Set(dests);
  const yearMax = {}; // year -> the busiest destination's value, kept or not
  for (const [key, value] of cellMap) {
    const year = key.split('\u0000')[1];
    yearMax[year] = Math.max(yearMax[year] || 0, value);
  }
  const cells = [];
  for (const [key, value] of cellMap) {
    const [dest, year] = key.split('\u0000');
    if (top.has(dest) && value > 0) cells.push({ dest, year: Number(year), value, share: value / yearTotals[year], peak: value / yearMax[year] });
  }
  cells.sort((a, b) => a.year - b.year || dests.indexOf(a.dest) - dests.indexOf(b.dest));
  return { dests, years: yearDomain([...yearSet]), cells, yearTotals, yearMax };
}

// the row labels' column: wide enough for the longest label, from three-letter codes to the 280px the city labels had
// when they listed their airports. `width` measures a label; a page passes the browser's measure of its 12px type
export const labelMargin = (texts, width = (t) => t.length * 7) => Math.min(280, Math.max(48, Math.ceil(Math.max(0, ...texts.map((t) => width(String(t)))) + 16)));

// a grouped matrix's ▸/▾ column, between the row names and the cells: the names end ARROW_SLOT px short of the cells to leave
// room for it, and a group's arrow (a #toggle: link) opens and closes the group. `title` gives each arrow's hover text
export const ARROW_SLOT = 16;
export const disclosureArrows = (Plot, labels, title) => Plot.text(labels.filter((l) => l.kind === 'group'), {
  y: 'key', text: (d) => (d.open ? '▾' : '▸'), title, href: (d) => `#toggle:${d.key}`,
  frameAnchor: 'left', textAnchor: 'end', dx: -5, fill: 'currentColor', fontSize: 14,
});

// how far the cell pointer reaches (Plot.pointer's maxRadius): from a cell's centre to its corners, so any point in a cell
// picks it, but short of the row labels, which end 8px left of the first year's cells (its default 40px reached into them,
// so hovering a label lit up that row's first cell)
export function pointerReach({ width, marginLeft, years, rowPx }) {
  const cell = (width - marginLeft) / Math.max(1, years);
  return Math.min(Math.hypot(cell / 2, rowPx / 2) + 0.5, cell / 2 + 7.5);
}

// the colour key, drawn beside the Colour choice that sets it rather than inside the chart, between the settings and the cells;
// `chart` is null when there is nothing to chart, which empties the key
export function placeKey(box, chart) {
  if (box) box.replaceChildren(...(chart ? [chart.legend('color')] : []));
}

// a label's width in px as the page's 12px type sets it, for labelMargin (a browser's canvas; null where there isn't one)
export function textWidth(box) {
  const ctx = typeof document !== 'undefined' && document.createElement('canvas').getContext('2d');
  if (!ctx) return undefined;
  ctx.font = `12px ${getComputedStyle(box).fontFamily}`;
  return (t) => ctx.measureText(t).width;
}

// Same grid, but airports in one BTS city market are one row (or aircraft in one family: rows with a `group_label` name their group). A group can be opened (`open` lists market ids),
// which puts its airports on rows directly beneath.
export function buildCityMatrix(rows, { measure = 'passengers', service = 'all', n = 25, open = [], rankYear = null } = {}) {
  const kept = service === 'all' ? rows : rows.filter((r) => r.service === service);
  const openSet = new Set(open.map(String));
  const groups = new Map(); // key -> { rank, airports: Map(dest -> {rank, name, nameYear, byYear}), byYear: Map(year -> {value, parts: Map}) }
  const yearSet = new Set();
  const yearTotals = {};
  for (const r of kept) {
    yearSet.add(r.year);
    const key = r.market_id !== null && r.market_id !== undefined && r.market_id !== '' ? String(r.market_id) : `solo:${r.dest}`;
    const v = valueOf(r, measure);
    yearTotals[r.year] = (yearTotals[r.year] || 0) + v;
    const g = groups.get(key) || { key, rank: 0, name: r.group_label || null, airports: new Map(), byYear: new Map() };
    groups.set(key, g);
    const ranked = rankYear === null || Number(r.year) === rankYear;
    if (ranked) g.rank += v;
    const a = g.airports.get(r.dest) || { dest: r.dest, rank: 0, name: null, nameYear: -Infinity, byYear: new Map() };
    g.airports.set(r.dest, a);
    if (ranked) a.rank += v;
    if (r.city && r.year >= a.nameYear) { a.name = r.city; a.nameYear = r.year; }
    a.byYear.set(r.year, (a.byYear.get(r.year) || 0) + v);
    const cell = g.byYear.get(r.year) || { value: 0, parts: new Map() };
    g.byYear.set(r.year, cell);
    cell.value += v;
    cell.parts.set(r.dest, (cell.parts.get(r.dest) || 0) + v);
  }

  const yearMax = {}; // year -> the busiest market's value, listed or not
  for (const g of groups.values()) for (const [year, cell] of g.byYear) yearMax[year] = Math.max(yearMax[year] || 0, cell.value);
  const byVolume = (a, b) => b.rank - a.rank || a.dest.localeCompare(b.dest);
  const ranked = [...groups.values()]
    .filter((g) => g.rank > 0)
    .map((g) => ({ ...g, list: [...g.airports.values()].filter((a) => a.rank > 0).sort(byVolume) }))
    .sort((a, b) => b.rank - a.rank || a.list[0].dest.localeCompare(b.list[0].dest))
    .slice(0, n);

  const outRows = [];
  const cells = [];
  for (const g of ranked) {
    // the city alone, named by the city name its airports carry most between them (DCA and IAD's "Washington, DC" over
    // BWI's "Baltimore, MD"); its airports are on hover and in the rows it opens into, which every city has
    const carried = new Map();
    for (const a of g.list) carried.set(a.name || a.dest, (carried.get(a.name || a.dest) || 0) + a.rank);
    const label = g.name || [...carried].sort((x, y) => y[1] - x[1])[0][0]; // rows can name their own group (a family)
    const isOpen = openSet.has(g.key);
    outRows.push({ key: g.key, kind: 'group', label, expandable: true, open: isOpen, codes: g.list.map((a) => a.dest) });
    for (const [year, cell] of g.byYear) {
      if (cell.value <= 0) continue;
      const parts = [...cell.parts].map(([dest, value]) => ({ dest, value })).filter((p) => p.value > 0)
        .sort((a, b) => b.value - a.value || a.dest.localeCompare(b.dest));
      cells.push({ row: g.key, year, value: cell.value, share: cell.value / yearTotals[year], peak: cell.value / yearMax[year], parts });
    }
    if (isOpen) {
      for (const a of g.list) {
        const key = `${g.key}/${a.dest}`;
        outRows.push({ key, kind: 'airport', code: a.dest, groupKey: g.key, label: a.dest, name: a.name });
        for (const [year, value] of a.byYear) if (value > 0) cells.push({ row: key, year, value, share: value / yearTotals[year], peak: value / yearMax[year] });
      }
    }
  }
  const order = new Map(outRows.map((r, i) => [r.key, i]));
  cells.sort((x, y) => x.year - y.year || order.get(x.row) - order.get(y.row));
  return { rows: outRows, years: yearDomain([...yearSet]), cells, yearTotals, yearMax };
}
