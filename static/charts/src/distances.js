// An airport's distances page: its flight segments in one year (routes_by_year rows), binned by distance on an axis every
// airport shares. A BTS distance far off the great-circle one is left out (the same check as plugins/t100_distances.py).
import { exactCount } from '../../common/numbers.js';
import { hasFreight } from './flights.js';

const num = (v) => Number(v) || 0;
const present = (v) => v !== null && v !== undefined && v !== '';

export function isSuspect(distance, gc, { ratio, miles }) {
  if (!present(distance) || !present(gc)) return false;
  const off = Math.abs(distance - gc);
  return off > ratio * gc && off > miles;
}

// rows -> { empty: true }, or the bins from 0 to max (every one, empty or not), the total and weighted median of what's kept,
// and what was left out (dropped: suspect; noDistance: none given), kept unchecked, or kept in the last bin beyond the axis
export function profile(rows, { measure, bin, max, ratio, miles }) {
  const count = Math.max(1, Math.ceil(max / bin));
  const bins = Array.from({ length: count }, (_, i) => ({ from: i * bin, to: (i + 1) * bin, value: 0, share: 0 }));
  const dropped = { pairs: 0, value: 0 };
  const noDistance = { pairs: 0, value: 0 };
  const unchecked = { pairs: 0 };
  const beyondAxis = { pairs: 0 };
  const kept = [];
  for (const row of rows) {
    const value = num(row[measure]);
    if (!value) continue; // nothing to chart, nor to mention
    if (!present(row.distance)) {
      noDistance.pairs += 1;
      noDistance.value += value;
    } else if (isSuspect(row.distance, row.gc_distance, { ratio, miles })) {
      dropped.pairs += 1;
      dropped.value += value;
    } else {
      const distance = Number(row.distance);
      if (!present(row.gc_distance)) unchecked.pairs += 1;
      if (distance >= max) beyondAxis.pairs += 1;
      bins[Math.min(count - 1, Math.floor(distance / bin))].value += value;
      kept.push({ distance, value });
    }
  }
  const total = kept.reduce((sum, k) => sum + k.value, 0);
  if (!total) return { empty: true };
  for (const b of bins) b.share = b.value / total;
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
