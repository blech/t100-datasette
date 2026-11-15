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

export function profile(rows, { measure, bin, max, ratio, miles, origin = null }) {
  if (!(max > 0)) return { empty: true, unavailable: true };
  const count = Math.max(1, Math.ceil(max / bin));
  const bins = Array.from({ length: count }, (_, i) => ({ from: i * bin, to: (i + 1) * bin, value: 0, share: 0, dests: [] }));
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
      const b = bins[Math.min(count - 1, Math.floor(distance / bin))];
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

export const measuresOffered = (rows) => ['passengers', 'deps', ...(hasFreight(rows) ? ['freight'] : [])];

export function summaryText(code, year, measure, median) {
  const n = exactCount(median);
  return {
    passengers: `Half of ${code}'s passengers in ${year} flew segments of ${n} miles or less.`,
    deps: `Half of ${code}'s flight segments in ${year} were ${n} miles or less.`,
    freight: `Half of ${code}'s freight in ${year} went on segments of ${n} miles or less.`,
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
