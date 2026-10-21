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

// the chart's own <svg>: a plot with a legend is a <figure>, and a ramp legend is an <svg> too, so take the last
export const chartSvg = (plot) => (plot.tagName.toLowerCase() === 'svg' ? plot : [...plot.querySelectorAll('svg')].at(-1));

const el = (tag, className, textContent = '') => Object.assign(document.createElement(tag), { className, textContent });

// Show `content(plot.value)` beside the point `at(plot.value)` whenever Plot's pointer moves. The chart needs a
// pointer mark (Plot.pointerX for years, Plot.pointer for cells) whose data are the records content() reads.
export function attachPopover(plot, { content, at, keyOf = null, link = () => null }) {
  const pop = el('div', 'popover');
  pop.hidden = true;
  pop.setAttribute('role', 'tooltip');
  const colour = plot.scale('color');
  const key = keyOf || ((label) => (colour ? { kind: 'square', colour: colour.apply(label) } : { kind: 'none' }));
  const idOf = (d) => (d ? String(at(d)) : null);

  function show(d) {
    if (!d) { pop.hidden = true; return; }
    const { title, rows } = content(d);
    const extra = rows.some((r) => r.extra !== undefined);
    pop.className = `popover${extra ? ' with-extra' : ''}`;
    pop.replaceChildren(el('div', 'popover-title', title), ...rows.flatMap((r) => {
      const k = key(r.label);
      const swatch = el('span', k.kind === 'none' ? '' : `key key-${k.kind}`);
      if (k.colour) swatch.style.background = k.colour;
      return [swatch, el('span', '', r.label), el('span', 'num', r.value), ...(extra ? [el('span', 'extra', r.extra ?? '')] : [])];
    }));
    pop.hidden = false;
    const [xv, yv] = at(d);
    const sx = plot.scale('x'), sy = plot.scale('y');
    const box = chartSvg(plot).getBoundingClientRect();
    const x = box.left + sx.apply(xv) + (sx.bandwidth ? sx.bandwidth / 2 : 0);
    const y = box.top + sy.apply(yv) + (sy.bandwidth ? sy.bandwidth / 2 : 0);
    const fitsRight = x + 12 + pop.offsetWidth <= window.innerWidth - 4;
    pop.style.left = `${fitsRight ? x + 12 : Math.max(4, x - 12 - pop.offsetWidth)}px`;
    pop.style.top = `${Math.max(4, Math.min(y - 10, window.innerHeight - pop.offsetHeight - 4))}px`;
  }

  // touch: the first tap shows, a second on the same target follows its link. When the plot is a bare <svg> our
  // pointerdown can run before Plot's own has moved the pointer, so read the target again at the click, by when Plot
  // has (a click also makes Plot's pointer sticky, so it survives the pointerleave touch fires after every tap)
  let touch = false, tapped = null, showing = null;
  plot.addEventListener('pointerdown', (e) => { touch = e.pointerType === 'touch'; tapped = plot.value; });
  plot.addEventListener('click', (e) => {
    if (!touch) return;
    tapped = plot.value ?? tapped;
    const action = tapAction(showing, idOf(tapped), Boolean(tapped && link(tapped)));
    if (action === 'follow') { location.href = link(tapped); return; }
    e.preventDefault();
    if (action === 'hide') { showing = null; pop.hidden = true; return; }
    showing = idOf(tapped);
    show(tapped);
  }, true);
  plot.addEventListener('input', () => { if (!touch) show(plot.value); });
  plot.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') pop.hidden = true; });
  document.addEventListener('pointerdown', (e) => {
    if (!plot.isConnected) return;
    if (!plot.contains(e.target)) { showing = null; pop.hidden = true; }
  });
  return [plot, pop];
}
