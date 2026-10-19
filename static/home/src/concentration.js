export const CONCENTRATION_SERIES = ['Top 4 airlines', 'Top 10 airlines'];

// carrier_concentration rows -> one point per year and series, for a line chart
export function concentrationPoints(rows) {
  const out = [];
  for (const r of rows) {
    const year = Number(r.year);
    for (const [series, key] of [[CONCENTRATION_SERIES[0], 'top4'], [CONCENTRATION_SERIES[1], 'top10']]) {
      if (r[key] === null || r[key] === undefined || r[key] === '') continue;
      out.push({ year, series, share: Number(r[key]) });
    }
  }
  return out.sort((a, b) => a.year - b.year || CONCENTRATION_SERIES.indexOf(a.series) - CONCENTRATION_SERIES.indexOf(b.series));
}
