import * as Plot from '/static/charts/vendor/plot.js';
import { setDataLink } from '/static/common/datalink.js';
import { palette, isDark } from '/static/common/palette.js';
import { queryUrl, fetchRows } from '/static/globe/src/api.js';
import { periodRows, attachPopover } from '/static/common/popover.js';
import { formatCount, formatMultiple as multiple, exactCount, millionsAxis } from '/static/common/numbers.js';
import { clampRatio, clampIndex, INDEX_FLOOR, extremes, indexSeries, medianIndex } from '/static/movers/src/movers.js';

const $ = (id) => document.getElementById(id);
const page = $('movers');
const first = Number(page.dataset.from);
const last = Number(page.dataset.to);
const minPax = page.dataset.min;
const FASTER = 'Faster than the median';
const SLOWER = 'Slower than the median';
const MEDIAN = 'Median airport';
const LABELLED = 5; // airports named on the charts in each direction

// the settings select reloads the page on change, as the other pages' selects do; without scripts the form's button does it
for (const id of ['from', 'to', 'min']) $(id)?.addEventListener('change', (e) => e.target.form.requestSubmit());

let movers = [];
let series = [];

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
    .map((r) => ({ ...r, x: r.pax_from, y: clampRatio(r.vs_median), group: groupOf(r) }));
  if (!points.length) { box.textContent = 'Nothing to chart for this selection.'; return; }
  const { risers, fallers } = extremes(points, LABELLED);
  const tone = colours();
  const xAxis = millionsAxis(Math.max(...points.map((p) => p.x)), `Passengers in ${first}`);
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
        { label: `Passengers ${first}`, value: formatCount(d.pax_from) },
        { label: `Passengers ${last}`, value: formatCount(d.pax_to) },
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
  const lines = indexSeries(series, first, new Set(group.keys())).map((p) => ({ ...p, index: clampIndex(p.index), series: p.airport, group: group.get(p.airport) }));
  const median = medianIndex(series, first).map((p) => ({ ...p, index: clampIndex(p.index), series: MEDIAN, group: MEDIAN }));
  if (!lines.length) { box.textContent = 'Nothing to chart for this selection.'; return; }
  const tone = colours();
  const all = [...lines, ...median];
  // the last point of each line, where its name goes (points are in year order within a series)
  const ends = [...new Map(all.map((p) => [p.series, p])).values()];
  const tips = periodRows(all, {
    key: (p) => p.year, value: (p) => p.index, format: (v) => String(Math.round(v)),
  });
  const chart = Plot.plot({
    width: width(box),
    height: 460,
    marginLeft: 56,
    marginRight: 64,
    style: { background: 'transparent', fontSize: '12px' },
    x: { label: null, tickFormat: 'd' },
    y: { type: 'log', grid: true, label: `Passengers (${first} = 100)`, tickFormat: exactCount, domain: [INDEX_FLOOR, Math.max(...all.map((p) => p.index)) * 1.1] },
    color: { domain: [FASTER, SLOWER, MEDIAN], range: [tone[FASTER], tone[SLOWER], tone[MEDIAN]], legend: true },
    marks: [
      Plot.ruleY([100], { strokeOpacity: 0.4 }),
      Plot.line(lines, { x: 'year', y: 'index', z: 'series', stroke: 'group', strokeWidth: 1.6, strokeOpacity: 0.9 }),
      Plot.line(median, { x: 'year', y: 'index', stroke: 'group', strokeWidth: 3.5 }),
      Plot.text(ends, { x: 'year', y: 'index', text: (d) => (d.series === MEDIAN ? 'Median' : d.series), fill: 'group', dx: 6, textAnchor: 'start', fontWeight: 600 }),
      Plot.ruleX(tips, Plot.pointerX({ x: 'period', strokeOpacity: 0.3 })),
    ],
  });
  const keyColour = new Map(all.map((p) => [p.series, tone[p.group]]));
  box.append(...attachPopover(chart, {
    keyOf: (label) => ({ kind: 'square', colour: keyColour.get(label) }),
    at: (d) => [d.period, d.top],
    content: (d) => ({ title: String(d.period), rows: d.rows }),
  }));
}

function draw() {
  drawScatter();
  drawLines();
}

async function main() {
  const params = { from_year: first, to_year: last, min_pax: minPax };
  setDataLink('airport_movers', params);
  try {
    [movers, series] = (await Promise.all([fetchRows(queryUrl('airport_movers', params)), fetchRows(queryUrl('airport_movers_series', params))])).map((r) => r.rows);
  } catch (err) {
    console.error(err);
    for (const id of ['movers-scatter', 'movers-lines']) $(id).textContent = 'Could not load the chart data.';
    return;
  }
  draw();
  document.addEventListener('t100:theme', draw);
}

main();
