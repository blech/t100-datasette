// "Dropped at any point" on the changes pages: what was flown in some year from the first compared up to the second, but
// not in the second. That is the dropped ones (flown in the first year) and those added and dropped again in between
// ('between'), each with the years it flew and its busiest year.
import { formatCount } from '../../common/numbers.js';

const num = (v) => Number(v) || 0;
const busiestFirst = (x, y) => y.peakDeps - x.peakDeps;

// airport_gone rows (one per item and member, in the item's busiest year) -> one per destination or airline group.
// `members` are its airlines (or destinations) that busiest year, busiest first, and `places` how many: all of them, since
// the item reaches `min` in that year even when no one member does alone. `min` sorts dropped from added then dropped.
export function airportGone(rows, { min = 12 } = {}) {
  const items = new Map();
  for (const r of rows) {
    const it = items.get(r.code) || {
      code: r.code, name: r.name, deps_a: num(r.deps_a), firstYear: num(r.first_year), lastYear: num(r.last_year),
      peakYear: num(r.peak_year), peakDeps: num(r.peak_deps), byMember: [],
    };
    it.byMember.push([r.member, num(r.member_deps)]);
    items.set(r.code, it);
  }
  return [...items.values()].map(({ byMember, ...it }) => {
    const sorted = byMember.filter(([, d]) => d > 0).sort((x, y) => y[1] - x[1]);
    return {
      ...it, status: it.deps_a >= min ? 'dropped' : 'between',
      members: sorted.map(([m]) => m), places: sorted.length,
    };
  }).sort(busiestFirst);
}

// carrier_routes_gone rows (one per pair, member airline and year, already at the minimum) -> one per pair, its members
// added up within each year; a pair flown in `a` was dropped, any other added then dropped
export function pairsGone(rows, { a }) {
  const pairs = new Map();
  for (const r of rows) {
    const key = `${r.origin}\u0000${r.dest}`;
    const p = pairs.get(key) || { origin: r.origin, dest: r.dest, byYear: new Map(), byAirline: new Map() };
    p.byYear.set(num(r.year), (p.byYear.get(num(r.year)) || 0) + num(r.deps));
    if (r.airline) p.byAirline.set(r.airline, (p.byAirline.get(r.airline) || 0) + num(r.deps));
    pairs.set(key, p);
  }
  return [...pairs.values()].map(({ byYear, byAirline, ...p }) => {
    const years = [...byYear.keys()];
    const [peakYear, peakDeps] = [...byYear].sort((x, y) => y[1] - x[1] || y[0] - x[0])[0];
    const deps_a = byYear.get(Number(a)) || 0;
    return {
      ...p, deps_a, status: deps_a ? 'dropped' : 'between', firstYear: Math.min(...years), lastYear: Math.max(...years),
      peakYear, peakDeps, airlines: [...byAirline].sort((x, y) => y[1] - x[1]).map(([name]) => name),
    };
  }).sort(busiestFirst);
}

// "2016–2023", or "2019" for one year
export const flownText = ({ firstYear, lastYear }) => (firstYear === lastYear ? String(firstYear) : `${firstYear}–${lastYear}`);

// "1,350 in 2017"
export const mostText = ({ peakDeps, peakYear }) => `${formatCount(peakDeps)} in ${peakYear}`;
