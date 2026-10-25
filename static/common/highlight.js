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

const pinnedFor = new WeakMap(); // plot -> { pinned, show }

// attach to a plot (a <figure> with a swatch legend, or a bare <svg>); returns the plot. `pinned` is a set of series
// shown highlighted from the start (a ?highlight= from the link that led here), and returned to when the pointer leaves
export function attachHighlight(plot, { pinned = new Set() } = {}) {
  const scale = plot.scale('color');
  if (!scale?.domain || !scale.range) return plot;
  const lookup = seriesByFill(scale);
  const colourOf = new Map(scale.domain.map((s, i) => [s, rgb(scale.range[i])]));
  const svg = plot.tagName.toLowerCase() === 'svg' ? plot : [...plot.querySelectorAll('svg')].at(-1);
  const marks = () => svg.querySelectorAll('g[aria-label="bar"] rect[fill], g[aria-label="area"] path[fill]');
  // matched anywhere in the class: a faded entry's class no longer ends in -swatch
  const legend = () => (plot === svg ? [] : plot.querySelectorAll('[class*="-swatch"]:not([class*="-swatches"])'));
  const state = { pinned: new Set(pinned), active: '' };

  function show(set) {
    const key = [...set].sort().join('\n');
    if (key === state.active) return;
    state.active = key;
    const colours = new Set([...set].map((s) => colourOf.get(s)));
    for (const el of marks()) el.classList.toggle('faded', set.size > 0 && !colours.has(rgb(el.getAttribute('fill'))));
    for (const sw of legend()) sw.classList.toggle('faded', set.size > 0 && !set.has(sw.textContent.trim()));
    plot.dataset.highlight = [...set].join('\n');
    plot.dispatchEvent(new CustomEvent('highlight', { detail: [...set] }));
  }
  state.show = show;
  pinnedFor.set(plot, state);

  // only a segment changes the highlight, so crossing the gaps between bars doesn't flicker; leaving returns to the pin
  svg.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const series = lookup(e.target.getAttribute?.('fill'));
    if (series !== null) show(new Set([series]));
  });
  svg.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') show(state.pinned); });
  for (const sw of legend()) {
    const series = sw.textContent.trim();
    sw.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') show(new Set([series])); });
    sw.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') show(state.pinned); });
    // touch: a tap toggles it
    sw.addEventListener('click', () => show(state.active === series ? state.pinned : new Set([series])));
  }
  show(state.pinned);
  return plot;
}

// change what a chart returns to (for "clear": an empty set)
export function setPinned(plot, set) {
  const state = pinnedFor.get(plot);
  if (!state) return;
  state.pinned = new Set(set);
  state.show(state.pinned);
}

// ?highlight=airline:{group id}: a series to pick out on arrival, named by id because labels differ between pages
export function parseHighlight(search) {
  const m = /^airline:([A-Za-z0-9_-]+)$/.exec(new URLSearchParams(search || '').get('highlight') || '');
  return m ? { kind: 'airline', id: m[1] } : null;
}

// the chart's series labels whose rows belong to the highlighted airline group
export function highlightedSeries(rows, highlight, labelOf) {
  const out = new Set();
  if (!highlight) return out;
  for (const r of rows) if (r.group_id === highlight.id) out.add(labelOf(r));
  return out;
}

// What the highlight line says, or null for no line. An airline's pages link airport pairs (both directions counted
// together), so a link can land on the direction the airline never flew: then the airline isn't in the rows at all,
// its name is unknown, and the line offers the other way.
export function highlightMessage({ highlight, name, byAirline, splitLabel, shown }) {
  if (!highlight) return null;
  if (!name) return { text: "This airline doesn't fly this way", reverse: true };
  if (!byAirline) return { text: `${name} isn't shown when split by ${splitLabel}`, reverse: false };
  return { text: shown ? `Highlighting ${name}` : `${name} doesn't appear here`, reverse: false };
}
