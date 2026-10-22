import * as Plot from '/static/charts/vendor/plot.js';
import { HEAT_MEASURES } from '/static/charts/src/heatmap.js';
import { buildFamilySeries } from '/static/charts/src/rollup.js';
import { kindOptions } from '/static/charts/src/aircraft.js';
import { queryUrl, fetchRows } from '/static/globe/src/api.js';
import { replaceSearch } from '/static/nav/src/state.js';
import { formatCount, millionsAxis } from '/static/common/numbers.js';
import { periodRows, attachPopover } from '/static/common/popover.js';
import { attachHighlight } from '/static/common/highlight.js';
import { seriesColours, isDark } from '/static/common/palette.js';

// the tallest stack, which sets the y axis's scale
const stackMax = (points, key, value = (p) => p.value) => {
  const sums = new Map();
  for (const p of points) sums.set(p[key], (sums.get(p[key]) || 0) + value(p));
  return Math.max(0, ...sums.values());
};

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const pick = (key, allowed, fallback) => (allowed.includes(params.get(key)) ? params.get(key) : fallback);
const state = {
  measure: pick('measure', Object.keys(HEAT_MEASURES), 'passengers'),
  kind: pick('flights', ['passenger', 'freight', 'all'], 'passenger'),
  service: pick('service', ['all', 'domestic', 'international'], 'all'),
  aircraftKind: params.get('aircraft') || 'all',  // checked against the menu once the data is in
};
let rows = [];

const unit = () => HEAT_MEASURES[state.measure].toLowerCase().replace(/ \(.*/, '');

function pushState() {
  const q = new URLSearchParams();
  if (state.measure !== 'passengers') q.set('measure', state.measure);
  if (state.kind !== 'passenger') q.set('flights', state.kind);
  if (state.service !== 'all') q.set('service', state.service);
  if (state.aircraftKind !== 'all') q.set('aircraft', state.aircraftKind);
  history.replaceState(null, '', `${location.pathname}${replaceSearch(location.search, ['measure', 'flights', 'service', 'aircraft'], `?${q}`)}`);
}

function draw() {
  const box = $('maker-chart');
  box.replaceChildren();
  const res = buildFamilySeries(rows, { ...state, split: 'maker' });
  if (!res.points.length) { box.textContent = `No ${unit()} for this selection.`; return; }
  const years = res.years.map(String);
  const labelEvery = years.length <= 15 ? 1 : 5;
  const data = res.points.map((p) => ({ ...p, year: String(p.year) }));
  const tips = periodRows(data, { key: (p) => p.year, order: res.series, format: (v) => formatCount(v) });
  const colors = { ...seriesColours(res.series, isDark()), legend: true };
  const chart = Plot.plot({
    width: Math.min(box.clientWidth || 900, 1100),
    height: 420,
    marginLeft: 64,
    style: { background: 'transparent', fontSize: '12px' },
    x: { type: 'band', domain: years, label: null, tickFormat: (d) => (Number(d) % labelEvery === 0 ? d : '') },
    y: { ...millionsAxis(stackMax(data, 'year'), HEAT_MEASURES[state.measure]), grid: true },
    color: colors,
    marks: [
      Plot.barY(data, { x: 'year', y: 'value', fill: 'series', order: res.series }),
      Plot.ruleY([0]),
      Plot.ruleX(tips, Plot.pointerX({ x: 'period', strokeOpacity: 0 })),
    ],
  });
  attachHighlight(chart);
  box.append(...attachPopover(chart, { content: (d) => ({ title: d.period, rows: d.rows }), at: (d) => [d.period, d.top] }));
}

async function main() {
  for (const [k, label] of Object.entries(HEAT_MEASURES)) $('mk-measure').append(new Option(label.toLowerCase(), k));
  try {
    rows = (await fetchRows(queryUrl('maker_by_year'))).rows;
  } catch (err) {
    console.error(err);
    $('maker-chart').textContent = 'Could not load the chart data.';
    return;
  }
  $('mk-measure').value = state.measure;
  $('mk-kind').value = state.kind;
  $('mk-service').value = state.service;
  const kinds = kindOptions(rows);
  $('mk-aircraft').replaceChildren(...kinds.map((o) => new Option(o.label, o.value)));
  if (!kinds.some((o) => o.value === state.aircraftKind)) { state.aircraftKind = 'all'; pushState(); }
  $('mk-aircraft').value = state.aircraftKind;
  for (const [id, field] of [['mk-measure', 'measure'], ['mk-kind', 'kind'], ['mk-service', 'service'], ['mk-aircraft', 'aircraftKind']]) {
    $(id).addEventListener('change', (e) => { state[field] = e.target.value; pushState(); draw(); });
  }
  document.addEventListener('t100:theme', () => draw());
  draw();
}

main();
