import * as Plot from '/static/charts/vendor/plot.js';
import { setDataLink } from '/static/common/datalink.js';
import { palette, isDark } from '/static/common/palette.js';
import { queryUrl, fetchRows } from '/static/globe/src/api.js';
import { periodRows, attachPopover } from '/static/common/popover.js';
import { formatCount, formatMultiple as multiple, exactCount, millionsAxis } from '/static/common/numbers.js';
import { clampRatio, clampIndex, INDEX_FLOOR, extremes, indexSeries, medianIndex, lineLabel, spreadLabels } from '/static/movers/src/movers.js';

const $ = (id) => document.getElementById(id);
const page = $('movers');
const first = Number(page.dataset.from);
const last = Number(page.dataset.to);
const minValue = page.dataset.min;
const measure = page.dataset.measure; // passengers, flights or destinations
const label = page.dataset.label; // Passengers, Flights or Destinations
const FASTER = 'Faster than the median';
const SLOWER = 'Slower than the median';
const MEDIAN = 'Median airport';
const LABELLED = 5; // airports named on the charts in each direction

// the settings select reloads the page on change, as the other pages' selects do; without scripts the form's button does it
for (const id of ['from', 'to', 'measure', 'min']) $(id)?.addEventListener('change', (e) => e.target.form.requestSubmit());

let movers = [];
let series = [];

// The airport the pointer is on, in the lines chart (its line, its leader or its name) or in a table row: that airport's
// elements are picked out in both and the other lines fade. `tagged` is the lines chart's elements, each with its airport.
let active = null;
let tagged = [];
let linesChart = null;
let nameOf = new Map();

function applyActive() {
  for (const el of tagged) {
    const code = el.dataset.code;
    el.classList.toggle('faded', active !== null && code !== active && code !== 'median');
    el.classList.toggle('active', active !== null && code === active);
  }
  for (const tr of document.querySelectorAll('tr[data-code]')) tr.classList.toggle('current', active !== null && tr.dataset.code === active);
  if (linesChart) {
    // the year popover shows the airport's row in bold (static/common/popover.js)
    linesChart.dataset.highlight = active !== null ? nameOf.get(active) ?? '' : '';
    linesChart.dispatchEvent(new CustomEvent('highlight'));
  }
}

function setActive(code) {
  if (code === active) return;
  active = code;
  applyActive();
}

// pointing at, or tabbing to, a table row does the same as pointing at its line
function coupleTables() {
  for (const tr of document.querySelectorAll('tr[data-code]')) {
    const code = tr.dataset.code;
    tr.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') setActive(code); });
    tr.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') setActive(null); });
    tr.addEventListener('focusin', () => setActive(code));
    tr.addEventListener('focusout', () => setActive(null));
  }
}

const width = (box) => Math.min(box.clientWidth || 900, 1100);
const groupOf = (r) => (r.vs_median > 1 ? FASTER : SLOWER);
const share = (v) => `${Math.round(v * 100)}%`;

function colours() {
  const c = palette(isDark()).change;
  return { [FASTER]: c.added, [SLOWER]: c.dropped, [MEDIAN]: c.between };
}

function drawScatter() {
  const box = $('movers-scatter');
  box.replaceChildren();
  const points = movers
    .filter((r) => r.vs_median !== null && r.vs_median !== undefined)
    .map((r) => ({ ...r, x: r.value_from, y: clampRatio(r.vs_median), group: groupOf(r) }));
  if (!points.length) { box.textContent = 'Nothing to chart for this selection.'; return; }
  const { risers, fallers } = extremes(points, LABELLED);
  const tone = colours();
  const xAxis = millionsAxis(Math.max(...points.map((p) => p.x)), `${label} in ${first}`);
  const chart = Plot.plot({
    width: width(box),
    height: 460,
    marginLeft: 56,
    marginRight: 24,
    style: { background: 'transparent', fontSize: '12px' },
    x: { type: 'log', grid: true, ...xAxis },
    y: { type: 'log', grid: true, label: 'Growth against the median airport', tickFormat: (v) => multiple(v) },
    color: { domain: [FASTER, SLOWER], range: [tone[FASTER], tone[SLOWER]], legend: true },
    marks: [
      Plot.ruleY([1], { stroke: tone[MEDIAN], strokeWidth: 1.5 }),
      Plot.dot(points, { x: 'x', y: 'y', fill: 'group', fillOpacity: 0.65, r: 3.5, href: (d) => `/airports/${d.airport}` }),
      // risers' names above their points, fallers' below
      Plot.text(risers, { x: 'x', y: 'y', text: 'airport', fill: 'group', dy: -9, fontWeight: 600 }),
      Plot.text(fallers, { x: 'x', y: 'y', text: 'airport', fill: 'group', dy: 10, fontWeight: 600 }),
      Plot.dot(points, Plot.pointer({ x: 'x', y: 'y', r: 7, stroke: 'currentColor', strokeWidth: 1.5, fill: 'none' })),
    ],
  });
  box.append(...attachPopover(chart, {
    keyOf: () => ({ kind: 'none' }),
    at: (d) => [d.x, d.y],
    content: (d) => ({
      title: `${d.airport}${d.city ? ` · ${d.city}` : ''}`,
      rows: [
        { label: `${label} ${first}`, value: formatCount(d.value_from) },
        { label: `${label} ${last}`, value: formatCount(d.value_to) },
        { label: 'Growth', value: multiple(d.ratio) },
        { label: 'Against median', value: multiple(d.vs_median) },
        { label: `Peak: ${d.peak_year}`, value: share(d.vs_peak) },
      ],
    }),
  }));
}

function drawLines() {
  const box = $('movers-lines');
  box.replaceChildren();
  const { risers, fallers } = extremes(movers, LABELLED);
  const group = new Map([...risers.map((r) => [r.airport, FASTER]), ...fallers.map((r) => [r.airport, SLOWER])]);
  // a line is named by its code and its city ("TTN Trenton"), in the chart and in the popover
  const name = new Map(movers.map((r) => [r.airport, lineLabel(r.airport, r.city)]));
  nameOf = name;
  const lines = indexSeries(series, first, new Set(group.keys())).map((p) => ({ ...p, index: clampIndex(p.index), series: name.get(p.airport) ?? p.airport, group: group.get(p.airport) }));
  const median = medianIndex(series, first).map((p) => ({ ...p, index: clampIndex(p.index), series: MEDIAN, group: MEDIAN }));
  if (!lines.length) { box.textContent = 'Nothing to chart for this selection.'; return; }
  const tone = colours();
  const all = [...lines, ...median];
  const tips = periodRows(all, {
    key: (p) => p.year, value: (p) => p.index, format: (v) => String(Math.round(v)),
  });

  // The axis spans the lines drawn (to the floor at the lowest), not the whole range an index could have
  const HEIGHT = 460, TOP = 16, BOTTOM = 30, LEFT = 56, RIGHT = 150, GAP = 14, LEAD = 14;
  const values = all.map((p) => p.index);
  const lo = Math.max(INDEX_FLOOR, Math.min(...values) / 1.1);
  const hi = Math.max(...values) * 1.1;
  const w = width(box);
  // Names at the line ends, moved apart where lines finish close together, each joined to its line by a short leader. The
  // log axis is mapped by hand (its margins and domain are fixed above) so the labels can be spread in pixels.
  const toPixel = (v) => TOP + ((Math.log(hi) - Math.log(v)) / (Math.log(hi) - Math.log(lo))) * (HEIGHT - TOP - BOTTOM);
  const fromPixel = (px) => Math.exp(Math.log(hi) - ((px - TOP) / (HEIGHT - TOP - BOTTOM)) * (Math.log(hi) - Math.log(lo)));
  const years = last - first;
  const perYear = (w - LEFT - RIGHT) / years; // pixels in a year along the x axis
  const ends = [...new Map(all.map((p) => [p.series, p])).values()];
  const spread = spreadLabels(ends.map((d) => toPixel(d.index)), GAP, TOP + 6, HEIGHT - BOTTOM - 6);
  ends.forEach((d, i) => { d.labelY = fromPixel(spread[i]); d.labelX = d.year + LEAD / perYear; });
  const chart = Plot.plot({
    width: w,
    height: HEIGHT,
    marginTop: TOP,
    marginBottom: BOTTOM,
    marginLeft: LEFT,
    marginRight: RIGHT,
    style: { background: 'transparent', fontSize: '12px' },
    // a short range gets a tick for every year (left to itself Plot puts them at half years, which all print as whole ones)
    x: { label: null, tickFormat: 'd', domain: [first, last], ticks: years <= 10 ? Array.from({ length: years + 1 }, (_, i) => first + i) : undefined },
    y: { type: 'log', grid: true, label: `${label} (${first} = 100)`, tickFormat: exactCount, domain: [lo, hi] },
    color: { domain: [FASTER, SLOWER, MEDIAN], range: [tone[FASTER], tone[SLOWER], tone[MEDIAN]], legend: true },
    marks: [
      Plot.ruleY([100], { strokeOpacity: 0.4 }),
      Plot.line(lines, { x: 'year', y: 'index', z: 'series', stroke: 'group', strokeWidth: 1.6, strokeOpacity: 0.9, className: 'm-line' }),
      Plot.line(median, { x: 'year', y: 'index', stroke: 'group', strokeWidth: 3.5, className: 'm-median' }),
      // an invisible, wider copy of each line to point at: the lines themselves are too thin to hit
      Plot.line(lines, { x: 'year', y: 'index', z: 'series', stroke: 'black', strokeOpacity: 0, strokeWidth: 12, pointerEvents: 'stroke', className: 'm-hit' }),
      Plot.link(ends, { x1: 'year', y1: 'index', x2: 'labelX', y2: 'labelY', stroke: 'group', strokeOpacity: 0.6, className: 'm-link' }),
      Plot.text(ends, { x: 'labelX', y: 'labelY', text: (d) => (d.series === MEDIAN ? 'Median' : d.series), fill: 'group', dx: 3, textAnchor: 'start', fontWeight: 600, className: 'm-label', href: (d) => (d.airport ? `/airports/${d.airport}` : null) }),
      Plot.ruleX(tips, Plot.pointerX({ x: 'period', strokeOpacity: 0.3 })),
    ],
  });
  // each element of the chart knows its airport, in the order the marks were given their data (a series' line, in order of its
  // first point; a leader or a name, in order of `ends`)
  const lineCodes = [...new Set(lines.map((p) => p.airport))];
  const endCodes = ends.map((d) => d.airport ?? 'median');
  tagged = [];
  const tag = (selector, codes) => {
    const els = [...chart.querySelectorAll(selector)];
    if (els.length !== codes.length) return [];
    els.forEach((el, i) => { el.dataset.code = codes[i]; tagged.push(el); });
    return els;
  };
  tag('.m-line path', lineCodes);
  tag('.m-median path', ['median']);
  // pointing at any of these picks the airport out
  for (const el of [...tag('.m-hit path', lineCodes), ...tag('.m-link line, .m-link path', endCodes), ...tag('.m-label text', endCodes)]) {
    if (el.dataset.code === 'median') continue;
    el.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') setActive(el.dataset.code); });
    el.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') setActive(null); });
  }
  linesChart = chart;
  const keyColour = new Map(all.map((p) => [p.series, tone[p.group]]));
  box.append(...attachPopover(chart, {
    keyOf: (label) => ({ kind: 'square', colour: keyColour.get(label) }),
    at: (d) => [d.period, d.top],
    content: (d) => ({ title: String(d.period), rows: d.rows }),
  }));
  applyActive(); // a redraw (the theme changing) keeps whatever the pointer is on
}

function draw() {
  drawScatter();
  drawLines();
}

async function main() {
  const params = { measure, from_year: first, to_year: last, min_value: minValue };
  setDataLink('airport_movers', params);
  try {
    [movers, series] = (await Promise.all([fetchRows(queryUrl('airport_movers', params)), fetchRows(queryUrl('airport_movers_series', params))])).map((r) => r.rows);
  } catch (err) {
    console.error(err);
    for (const id of ['movers-scatter', 'movers-lines']) $(id).textContent = 'Could not load the chart data.';
    return;
  }
  // an airport that kept under 1% of its passengers is named on the page and counts for nothing here (the median included)
  const gone = new Set(movers.filter((r) => r.lost).map((r) => r.airport));
  movers = movers.filter((r) => !r.lost);
  series = series.filter((r) => !gone.has(r.airport));
  draw();
  coupleTables();
  document.addEventListener('t100:theme', draw);
}

main();
