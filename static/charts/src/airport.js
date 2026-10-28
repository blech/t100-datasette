// An airport's pages: departures from it, by year (airport_size, routes_by_year) and between two years (airport_changes)
import { buildSeries } from './series.js';

const LB_PER_SHORT_TON = 2000;
const num = (v) => Number(v) || 0;
const FIXED = { service: ['domestic', 'international'], kind: ['passenger', 'freight'] };

// airport_size rows -> stacked points per year, split by service, kind, or airline group (the top 8 and "Other"), with each
// shown group's page id by name; a value of nothing is no point, so a measure the airport has none of draws nothing
export function sizeSeries(rows, { measure = 'passengers', flights = 'passenger', split = 'service' } = {}) {
  const kept = rows.filter((r) => flights === 'all' || r.kind === flights);
  if (split === 'airline') {
    const res = buildSeries(kept.map((r) => ({
      year: r.year, carrier: r.group_name, deps: r.deps, total_seats: r.seats, total_passengers: r.passengers, total_freight: r.freight,
    })), { measure, split: 'carrier', top: 8, periodKey: 'year' });
    const points = res.points.filter((p) => p.value > 0).map((p) => ({ year: p.period, series: p.series, value: p.value }));
    const series = res.series.filter((name) => points.some((p) => p.series === name));
    const links = new Map();
    for (const r of kept) if (r.group_id !== 'unknown' && series.includes(r.group_name)) links.set(r.group_name, r.group_id);
    return { points, series, links };
  }
  const sums = new Map();
  for (const r of kept) {
    const key = `${r.year}\u0000${r[split]}`;
    const v = num(r[measure]) / (measure === 'freight' ? LB_PER_SHORT_TON : 1);
    sums.set(key, { year: Number(r.year), series: r[split], value: (sums.get(key)?.value || 0) + v });
  }
  const points = [...sums.values()].filter((p) => p.value > 0).sort((a, b) => a.year - b.year);
  return { points, series: FIXED[split].filter((name) => points.some((p) => p.series === name)), links: new Map() };
}

// routes_by_year rows (fetched with min_deps=1) -> how many destinations reached `min` departures, per year and service
export function placeCounts(rows, { min = 12 } = {}) {
  const counts = new Map();
  for (const r of rows) {
    if (num(r.deps) < min) continue;
    const key = `${r.year}\u0000${r.service}`;
    counts.set(key, { year: Number(r.year), service: r.service, count: (counts.get(key)?.count || 0) + 1 });
  }
  return [...counts.values()].sort((a, b) => a.year - b.year || FIXED.service.indexOf(a.service) - FIXED.service.indexOf(b.service));
}

const statusOf = (a, b, min) => (a >= min ? (b >= min ? 'kept' : 'dropped') : b >= min ? 'added' : null);
const countOf = (x) => (x.status === 'added' ? x.deps_b : x.deps_a);

// airport_changes rows (one per destination and group) -> destinations or airline groups, each kept, dropped or added
// between the two years at `min` departures; the year that counts is the first, or the second for one added
export function classifyChanges(rows, { min = 12, show = 'destinations' } = {}) {
  const key = show === 'airlines' ? 'group_id' : 'dest';
  const items = new Map();
  for (const r of rows) {
    const it = items.get(r[key]) || { rows: [], deps_a: 0, deps_b: 0, first: Infinity, last: -Infinity };
    it.rows.push(r);
    it.deps_a += num(r.deps_a);
    it.deps_b += num(r.deps_b);
    if (r.first_ym) it.first = Math.min(it.first, r.first_ym);
    if (r.last_ym) it.last = Math.max(it.last, r.last_ym);
    items.set(r[key], it);
  }
  const out = [];
  for (const it of items.values()) {
    const status = statusOf(it.deps_a, it.deps_b, min);
    if (!status) continue;
    const ofYear = status === 'added' ? 'deps_b' : 'deps_a';
    const ym = status === 'added' ? it.first : it.last;
    const r = it.rows[0];
    if (show === 'airlines') {
      const places = it.rows.filter((x) => num(x[ofYear]) >= min).length;
      out.push({ id: r.group_id, name: r.group_name, deps_a: it.deps_a, deps_b: it.deps_b, places, status, year: Math.floor(ym / 100) });
    } else {
      const airlines = it.rows.filter((x) => num(x[ofYear]) > 0).sort((x, y) => num(y[ofYear]) - num(x[ofYear])).map((x) => x.group_name);
      out.push({ code: r.dest, city: r.city, deps_a: it.deps_a, deps_b: it.deps_b, airlines, status, ym });
    }
  }
  return out.sort((x, y) => countOf(y) - countOf(x));
}

// The columns a status's list can be sorted by, the default first: the departures of the year that counts (either year,
// for kept ones; the other year's are all nothing) and when it changed (first flown, for added; last flown, for dropped).
// Those dropped at any point (src/gone.js) sort by their busiest year's departures, or by the last year they flew.
const CHANGE_SORTS = { added: ['b', 'when'], dropped: ['a', 'when'], kept: ['a', 'b'], gone: ['peak', 'when'] };
export const changeSort = (status, sort) => (CHANGE_SORTS[status].includes(sort) ? sort : CHANGE_SORTS[status][0]);

// classifyChanges' items of one status, by a column, biggest or latest first; ties go to the busier
export function sortChanges(items, status, sort) {
  const key = { a: (x) => x.deps_a, b: (x) => x.deps_b, peak: (x) => x.peakDeps, when: (x) => x.lastYear ?? x.ym ?? x.year }[changeSort(status, sort)];
  const busy = (x) => x.peakDeps ?? countOf(x);
  return [...items].sort((x, y) => key(y) - key(x) || busy(y) - busy(x));
}

export function summariseChanges(items) {
  const counts = { kept: 0, dropped: 0, added: 0 };
  for (const it of items) counts[it.status] += 1;
  return counts;
}

// "United, Delta, Alaska + 2 more"
export function airlineList(names, shown = 3) {
  const rest = names.length - shown;
  return `${names.slice(0, shown).join(', ')}${rest > 0 ? ` + ${rest} more` : ''}`;
}
