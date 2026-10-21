import { formatCount as fmt } from '../../common/numbers.js';

// Year B's routes set against year A's, matched by `keyOf`: each route once, marked kept, added or dropped,
// with its departures in both years. A dropped route keeps its year-A numbers so it can still be drawn.
export function compareYears(now, then, keyOf) {
  if (!then) return now.map((r) => ({ ...r, status: null }));
  const before = new Map(then.map((r) => [keyOf(r), r]));
  const seen = new Set();
  const out = now.map((r) => {
    const k = keyOf(r);
    seen.add(k);
    const a = before.get(k);
    return { ...r, status: a ? 'kept' : 'added', depsThen: a ? Number(a.deps) || 0 : 0, depsNow: Number(r.deps) || 0 };
  });
  for (const [k, a] of before) if (!seen.has(k)) out.push({ ...a, status: 'dropped', depsThen: Number(a.deps) || 0, depsNow: 0 });
  return out;
}

export function countStatuses(routes) {
  const c = { kept: 0, added: 0, dropped: 0 };
  for (const r of routes) if (r.status) c[r.status] += 1;
  return c;
}

export function changeText(r, compareYear) {
  if (!r.status) return '';
  return r.status === 'dropped' ? `Dropped: ${fmt(r.depsThen)} departures in ${compareYear}` : `${fmt(r.depsThen)} → ${fmt(r.depsNow)} departures`;
}

// The year range's two handles are indexes into `years`: the solid one (`year`) never sits below the hollow one (`compare`).
// Moving one past the other carries it along; the hollow one only stays behind when the solid one moves away from it.
export function moveHandle(years, { year, compare }, which, index) {
  const lo = years.indexOf(compare ?? year);
  const hi = years.indexOf(year);
  const [a, b] = which === 'year' ? [Math.min(lo, index), index] : [index, Math.max(index, hi)];
  return { year: years[b], compare: a < b ? years[a] : null };
}

// Months and a comparison don't mix: in the month view the solid handle only changes the year,
// and moving the hollow one back leaves the months for a comparison
export function moveRange(years, state, which, index) {
  const next = moveHandle(years, state, which, index);
  if (state.month === null) return { ...next, month: null };
  if (which === 'year') return { year: next.year, compare: null, month: state.month };
  return { ...next, month: next.compare === null ? state.month : null };
}

// One step of play: the solid handle moves on a year and the hollow one stays at `base`; null once at the end
export function playStep(years, year, base) {
  const next = years.indexOf(year) + 1;
  if (next <= 0 || next >= years.length) return null;
  return { year: years[next], compare: base !== null && base < years[next] ? base : null };
}
