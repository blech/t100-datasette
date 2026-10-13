import * as Plot from '/static/charts/vendor/plot.js';
import { buildSeries, MEASURES, SPLITS } from '/static/charts/src/series.js';

const root = document.getElementById('route-chart');
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const state = {
  measure: Object.hasOwn(MEASURES, params.get('measure')) ? params.get('measure') : 'passengers',
  split: Object.hasOwn(SPLITS, params.get('split')) ? params.get('split') : 'carrier',
};
let rows = [];

function fillSelect(select, options, value) {
  for (const [k, label] of Object.entries(options)) select.append(new Option(label, k));
  select.value = value;
}

function pushState() {
  const q = new URLSearchParams(location.search);
  q.set('measure', state.measure);
  q.set('split', state.split);
  history.replaceState(null, '', `${location.pathname}?${q}`);
}

function draw() {
  const res = buildSeries(rows, state);
  const box = $('route-chart-plot');
  box.replaceChildren();
  if (!res.points.length) {
    box.textContent = 'No data to chart for this selection.';
    return;
  }
  const years = res.years.map(String);
  const labelEvery = years.length <= 15 ? 1 : 5;
  const x = { label: null, domain: years, tickFormat: (d) => (Number(d) % labelEvery === 0 || labelEvery === 1 ? d : '') };
  const data = res.points.map((p) => ({ ...p, year: String(p.year) }));
  const common = { x: 'year', y: 'value', tip: true };
  const marks = res.stackable
    ? [Plot.barY(data, { ...common, fill: 'series' }), Plot.ruleY([0])]
    : [Plot.lineY(data, { x: 'year', y: 'value', stroke: 'series' }), Plot.dot(data, { ...common, stroke: 'series' }), Plot.ruleY([0])];
  box.append(Plot.plot({
    width: Math.min(box.clientWidth || 800, 1000),
    height: 420,
    marginLeft: 64,
    style: { background: 'transparent', fontSize: '12px' },
    x: res.stackable ? { ...x, type: 'band' } : { ...x, type: 'point' },
    y: { grid: true, label: MEASURES[state.measure], tickFormat: state.measure === 'load_factor' ? 'd' : '~s', ...(state.measure === 'load_factor' ? { domain: [0, 100] } : {}) },
    color: { legend: true, domain: res.series, scheme: 'tableau10' },
    marks,
  }));
}

async function main() {
  const url = new URL(location.href);
  url.pathname += '.json';
  url.searchParams.set('_shape', 'objects');
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    rows = (await res.json()).rows || [];
  } catch (err) {
    console.error(err);
    $('route-chart-plot').textContent = 'Could not load the chart data.';
    return;
  }
  if (!rows.length) { root.hidden = true; return; }
  fillSelect($('chart-measure'), MEASURES, state.measure);
  fillSelect($('chart-split'), SPLITS, state.split);
  $('chart-measure').addEventListener('change', (e) => { state.measure = e.target.value; pushState(); draw(); });
  $('chart-split').addEventListener('change', (e) => { state.split = e.target.value; pushState(); draw(); });
  root.hidden = false;
  draw();
}

main();
