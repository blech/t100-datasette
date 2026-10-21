// The popover every chart over time shares: the whole year (or month) under the pointer, top of the stack first,
// with colour keys and right-aligned numbers; heat-map cells use the same box. The design:
// docs/superpowers/specs/2026-10-21-popovers-design.md

// points -> one record per period, its rows ordered as the chart draws them, top first.
// `order` is the stacking order, bottom first (Plot's); without one, rows are highest first and `top` is the highest
export function periodRows(points, { key, order = null, value = (p) => p.value, format, extra = null, top = null }) {
  const byPeriod = new Map();
  for (const p of points) {
    const k = key(p);
    if (!byPeriod.has(k)) byPeriod.set(k, []);
    byPeriod.get(k).push(p);
  }
  const rank = (p) => (order.includes(p.series) ? order.indexOf(p.series) : order.length);
  return [...byPeriod].map(([period, ps]) => {
    const sorted = order ? [...ps].sort((a, b) => rank(b) - rank(a)) : [...ps].sort((a, b) => value(b) - value(a));
    const total = top ? top(ps) : order ? ps.reduce((s, p) => s + value(p), 0) : Math.max(...ps.map(value));
    return {
      period,
      top: total,
      rows: sorted.map((p) => ({ label: p.series, value: format(value(p)), ...(extra ? { extra: extra(p) } : {}) })),
    };
  });
}

// what a tap on a touch screen does: a new target shows its popover, the one already shown follows its link
export function tapAction(showing, tapped, hasLink) {
  if (tapped === null || tapped === undefined) return 'hide';
  if (tapped !== showing) return 'show';
  return hasLink ? 'follow' : 'show';
}
