// The risers-and-fallers charts' numbers: which airports to label, their passengers indexed to the first year, and the
// median airport's line. Rows are airport_movers and airport_movers_series (datasette.yml). The page's design:
// docs/superpowers/specs/2026-11-11-airport-movers-design.md

// a log axis has no zero: an airport with nothing left sits at the bottom of the chart instead
export const FLOOR = 0.01;
export const clampRatio = (v) => Math.max(Number(v), FLOOR);

// The `n` furthest above the median and the `n` furthest below it (by how many times faster or slower, so a half and a double
// are as far from it), each beyond it, furthest first. Rows with no comparison (a median of 0) have none.
export function extremes(rows, n = 5) {
  const usable = rows.filter((r) => r.vs_median !== null && r.vs_median !== undefined);
  const risers = usable.filter((r) => r.vs_median > 1).sort((a, b) => b.vs_median - a.vs_median).slice(0, n);
  const fallers = usable.filter((r) => r.vs_median < 1).sort((a, b) => a.vs_median - b.vs_median).slice(0, n);
  return { risers, fallers };
}

// series rows (airport, year, pax) -> one point per airport and year, passengers as a percentage of the airport's first year
// in the range (so every line starts at 100); airports without a first-year figure have no line
export function indexSeries(series, firstYear, codes = null) {
  const base = new Map(series.filter((r) => r.year === firstYear).map((r) => [r.airport, r.pax]));
  return series
    .filter((r) => base.get(r.airport) > 0 && (!codes || codes.has(r.airport)))
    .map((r) => ({ airport: r.airport, year: r.year, index: (100 * r.pax) / base.get(r.airport) }));
}

const median = (values) => {
  const v = [...values].sort((a, b) => a - b);
  const mid = v.length >> 1;
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
};

// the median airport's index in each year: the median of every listed airport's index that year (an airport with no
// passengers in a year has no figure, so it is left out of that year's median)
export function medianIndex(series, firstYear) {
  const byYear = new Map();
  for (const p of indexSeries(series, firstYear)) {
    if (!byYear.has(p.year)) byYear.set(p.year, []);
    byYear.get(p.year).push(p.index);
  }
  return [...byYear].sort((a, b) => a[0] - b[0]).map(([year, values]) => ({ year, index: median(values) }));
}
