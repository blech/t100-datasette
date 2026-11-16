// An airport's distances page: its flight segments in one year (routes_by_year rows), binned by distance on an axis every
// airport shares. A BTS distance far off the great-circle one is left out (the same check as plugins/t100_distances.py).
import { exactCount, formatCount, formatTons } from '../../common/numbers.js';
import { hasFreight } from './flights.js';

const num = (v) => Number(v) || 0;
const present = (v) => v !== null && v !== undefined && v !== '';

export function isSuspect(distance, gc, { ratio, miles }) {
  if (!present(distance) || !present(gc)) return false;
  const off = Math.abs(distance - gc);
  return off > ratio * gc && off > miles;
}

// rows -> { empty: true } ({ empty: true, unavailable: true } with no axis: the distances aren't loaded), or the bins from 0 to max (every one, empty or not), the total and weighted median of what's kept,
// and what was left out (dropped: suspect; noDistance: none given), kept unchecked, or kept in the last bin beyond the axis
// each bar's biggest destinations, for its popover: the top TOP, and how many more
const TOP = 5;

// bins are bin miles wide, or (given count) count even slices of the axis, the last ending at max
export function profile(rows, { measure, bin, count: slices, max, ratio, miles, origin = null }) {
  if (!(max > 0)) return { empty: true, unavailable: true };
  const count = slices ? Math.max(1, Math.floor(slices)) : Math.max(1, Math.ceil(max / bin));
  const edge = (i) => (slices ? (i === count ? max : (i * max) / count) : i * bin);
  const indexOf = (d) => Math.min(count - 1, Math.floor(slices ? (d * count) / max : d / bin));
  const bins = Array.from({ length: count }, (_, i) => ({ from: edge(i), to: edge(i + 1), value: 0, share: 0, dests: [] }));
  const dropped = { pairs: 0, value: 0 };
  const noDistance = { pairs: 0, value: 0 };
  const unchecked = { pairs: 0 };
  const beyondAxis = { pairs: 0 };
  const kept = [];
  for (const row of rows) {
    const value = num(row[measure]);
    if (!value || (origin && row.dest === origin)) continue; // nothing to chart, nor to mention; or a loop, with no distance
    if (!present(row.distance)) {
      noDistance.pairs += 1;
      noDistance.value += value;
    } else if (isSuspect(row.distance, row.gc_distance, { ratio, miles })) {
      dropped.pairs += 1;
      dropped.value += value;
    } else {
      const distance = Number(row.distance);
      if (!present(row.gc_distance)) unchecked.pairs += 1;
      if (distance > max) beyondAxis.pairs += 1;
      const b = bins[indexOf(distance)];
      b.value += value;
      b.dests.push({ dest: row.dest, value });
      kept.push({ distance, value });
    }
  }
  const total = kept.reduce((sum, k) => sum + k.value, 0);
  if (!total) return { empty: true };
  for (const b of bins) {
    b.share = b.value / total;
    b.dests.sort((x, y) => y.value - x.value || String(x.dest).localeCompare(String(y.dest)));
    b.top = b.dests.slice(0, TOP);
    b.more = Math.max(0, b.dests.length - TOP);
    delete b.dests;
  }
  kept.sort((a, b) => a.distance - b.distance);
  let running = 0;
  const median = kept.find((k) => (running += k.value) >= total / 2).distance;
  return { empty: false, bins, total, median, dropped, unchecked, noDistance, beyondAxis };
}

// how many bars of the given pixels fit a chart of this width: the plot is a whole number of them, and what's left over
// widens the right margin, so every bar is exactly that many pixels wide at any width
export function barLayout(width, { marginLeft, marginRight, pixels }) {
  const room = Math.floor(width) - marginLeft - marginRight;
  const count = Math.max(1, Math.floor(room / pixels));
  return { count, marginRight: Math.floor(width) - marginLeft - count * pixels };
}

export const measuresOffered = (rows) => ['passengers', 'deps', ...(hasFreight(rows) ? ['freight'] : [])];

// code is the airport, or null for every flight segment of the year
export function summaryText(code, year, measure, median) {
  const n = exactCount(median);
  const whose = code ? `${code}'s` : 'all';
  return {
    passengers: `Half of ${whose} passengers in ${year} flew segments of ${n} miles or less.`,
    deps: `Half of ${whose} flight segments in ${year} were ${n} miles or less.`,
    freight: `Half of ${whose} freight in ${year} went on segments of ${n} miles or less.`,
  }[measure];
}

const LABELS = { passengers: 'passengers', deps: 'flight segments', freight: 'freight' };
const amount = (measure, v) => (measure === 'freight' ? formatTons(v) : formatCount(v));

// the small print after the page's own: what was left out, couldn't be checked, or went past the scale, for the measure shown
export function noteText(p, measure) {
  if (p.empty) return '';
  const pairs = (n) => `${exactCount(n)} airport pair${n === 1 ? '' : 's'}`;
  const is = (n) => (n === 1 ? 'is' : 'are');
  const parts = [];
  if (p.dropped.pairs) parts.push(`${pairs(p.dropped.pairs)} whose BTS distance disagreed with it (${amount(measure, p.dropped.value)} ${LABELS[measure]}) ${is(p.dropped.pairs)} left out`);
  if (p.noDistance.pairs) parts.push(`${pairs(p.noDistance.pairs)} with no distance from BTS (${amount(measure, p.noDistance.value)} ${LABELS[measure]}) ${is(p.noDistance.pairs)} left out`);
  if (p.unchecked.pairs) parts.push(`${pairs(p.unchecked.pairs)} couldn't be checked, as an airport has no coordinates, and ${is(p.unchecked.pairs)} shown as BTS gives ${p.unchecked.pairs === 1 ? 'it' : 'them'}`);
  if (p.beyondAxis.pairs) parts.push(`${pairs(p.beyondAxis.pairs)} beyond the scale ${is(p.beyondAxis.pairs)} counted in the last bar`);
  if (!parts.length) return '';
  const text = parts.join('; ');
  return ` ${text[0].toUpperCase()}${text.slice(1)}.`;
}
