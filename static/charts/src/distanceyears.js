// The distances pages' years: rows by year, the bars' heights on either scale, the y scale over the years, and the address.
const LB_PER_SHORT_TON = 2000;

export function byYear(rows) {
  const m = new Map();
  for (const row of rows) {
    const y = Number(row.year);
    if (!m.has(y)) m.set(y, []);
    m.get(y).push(row);
  }
  return m;
}

// a bar's height: its percentage of the year's total, or its count (freight in short tons)
export function barHeight(bin, measure, scale) {
  if (scale === 'share') return bin.share * 100;
  return measure === 'freight' ? bin.value / LB_PER_SHORT_TON : bin.value;
}

// the tallest bar over the profiles (each one year's), so the y scale stays put as the years change
export function scaleTop(profiles, measure, scale) {
  let top = 0;
  for (const p of profiles) {
    if (p.empty) continue;
    for (const b of p.bins) top = Math.max(top, barHeight(b, measure, scale));
  }
  return top;
}

const yearIn = (v, years) => (/^\d{4}$/.test(v ?? '') && years.includes(Number(v)) ? Number(v) : null);

// the year shown (one of the years, else the latest), the year it's compared with (an earlier one, or null), and the scale
export function readState(search, years, latest) {
  const q = new URLSearchParams(search);
  const year = yearIn(q.get('year'), years) ?? latest;
  const compare = yearIn(q.get('compare'), years);
  return { year, compare: compare !== null && compare < year ? compare : null, scale: q.get('scale') === 'count' ? 'count' : 'share' };
}

// the address's year, compare and scale, each only when it isn't the default
export function yearParams({ year, compare, scale }, latest) {
  return {
    ...(year !== latest ? { year: String(year) } : {}),
    ...(compare !== null ? { compare: String(compare) } : {}),
    ...(scale === 'count' ? { scale } : {}),
  };
}
