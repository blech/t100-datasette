// Point at a series (a segment of a stacked bar or area, or its legend entry) to fade every other series, so one
// airline or version can be followed through the years. The series is found from the segment's fill, read back
// through the chart's own colour scale.

const rgb = (c) => {
  if (!c) return null;
  const s = String(c).trim().toLowerCase();
  const hex = s.match(/^#([0-9a-f]{6})$/);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)).join(',');
  const fn = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  return fn ? fn.slice(1, 4).join(',') : null;
};

// a colour scale's { domain, range } -> (fill) -> the series drawn in that colour, or null. Series that share a
// colour (a ninth series reusing the last Ember step) answer as the first of them
export function seriesByFill({ domain, range }) {
  const byColour = new Map();
  domain.forEach((s, i) => { const k = rgb(range[i]); if (k && !byColour.has(k)) byColour.set(k, s); });
  return (fill) => byColour.get(rgb(fill)) ?? null;
}

// attach to a plot (a <figure> with a swatch legend, or a bare <svg>); returns the plot
export function attachHighlight(plot) {
  const scale = plot.scale('color');
  if (!scale?.domain || !scale.range) return plot;
  const lookup = seriesByFill(scale);
  const colourOf = new Map(scale.domain.map((s, i) => [s, rgb(scale.range[i])]));
  const svg = plot.tagName.toLowerCase() === 'svg' ? plot : [...plot.querySelectorAll('svg')].at(-1);
  const marks = () => svg.querySelectorAll('g[aria-label="bar"] rect[fill], g[aria-label="area"] path[fill]');
  let active = null;

  function set(series) {
    if (series === active) return;
    active = series;
    const keep = series === null ? null : colourOf.get(series);
    for (const el of marks()) el.classList.toggle('faded', keep !== null && rgb(el.getAttribute('fill')) !== keep);
    for (const sw of legend()) sw.classList.toggle('faded', series !== null && sw.textContent.trim() !== series);
    plot.dataset.highlight = series ?? '';
    plot.dispatchEvent(new CustomEvent('highlight', { detail: series }));
  }
  // matched anywhere in the class: a faded entry's class no longer ends in -swatch
  const legend = () => (plot === svg ? [] : plot.querySelectorAll('[class*="-swatch"]:not([class*="-swatches"])'));

  // only a segment changes the highlight, so crossing the gaps between bars doesn't flicker; leaving the chart clears it
  svg.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const series = lookup(e.target.getAttribute?.('fill'));
    if (series !== null) set(series);
  });
  svg.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') set(null); });
  for (const sw of legend()) {
    const series = sw.textContent.trim();
    sw.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') set(series); });
    sw.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') set(null); });
    sw.addEventListener('click', () => set(active === series ? null : series)); // touch: a tap toggles it
  }
  return plot;
}
