import * as Plot from '/static/charts/vendor/plot.js';
import { buildEngineShares, ENGINE_BANDS, ENGINE_COLORS, ENGINE_SERIES } from '/static/charts/src/rollup.js';
import { queryUrl, fetchRows } from '/static/globe/src/api.js';
import { formatCount } from '/static/common/numbers.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const pick = (key, allowed, fallback) => (allowed.includes(params.get(key)) ? params.get(key) : fallback);
const MEASURES = { deps: 'departures', passengers: 'passengers', seats: 'seats', freight: 'freight (short tons)' };
const state = {
  measure: pick('emeasure', Object.keys(MEASURES), 'deps'),
  kind: pick('ekind', ['passenger', 'freight', 'all'], 'passenger'),
  band: pick('eband', ENGINE_BANDS.map((b) => b.value), '3000'),
};
let rows = [];

function pushState() {
  const q = new URLSearchParams(location.search);
  for (const [key, value, fallback] of [['emeasure', state.measure, 'deps'], ['ekind', state.kind, 'passenger'], ['eband', state.band, '3000']]) {
    if (value === fallback) q.delete(key); else q.set(key, value);
  }
  const s = q.toString();
  history.replaceState(null, '', `${location.pathname}${s ? `?${s}` : ''}`);
}


function draw() {
  const box = $('engine-chart');
  box.replaceChildren();
  const res = buildEngineShares(rows, state);
  if (!res.points.length) { box.textContent = 'Nothing to chart for this selection.'; return; }
  const unit = MEASURES[state.measure];
  const data = res.points.map((p) => ({ ...p, title: `${p.series}, ${p.year}\n${(p.share * 100).toFixed(1)}% of ${unit} (${formatCount(p.amount)})` }));
  box.append(Plot.plot({
    width: Math.min(box.clientWidth || 900, 1100),
    height: 380,
    marginLeft: 48,
    style: { background: 'transparent', fontSize: '12px' },
    x: { label: null, tickFormat: 'd' },
    y: { label: `Share of ${unit}`, tickFormat: '.0%', domain: [0, 1] },
    color: { domain: ENGINE_SERIES, range: ENGINE_COLORS, legend: true },
    marks: [
      Plot.areaY(data, { x: 'year', y: 'share', fill: 'series', order: ENGINE_SERIES, title: 'title', tip: true }),
      Plot.ruleY([0]),
    ],
  }));
}

async function main() {
  const measure = $('engine-measure');
  for (const [k, label] of Object.entries(MEASURES)) measure.append(new Option(label, k));
  for (const b of ENGINE_BANDS) $('engine-band').append(new Option(b.label, b.value));
  measure.value = state.measure;
  $('engine-kind').value = state.kind;
  $('engine-band').value = state.band;
  for (const [id, field] of [['engine-measure', 'measure'], ['engine-kind', 'kind'], ['engine-band', 'band']]) {
    $(id).addEventListener('change', (e) => { state[field] = e.target.value; pushState(); draw(); });
  }
  try {
    rows = (await fetchRows(queryUrl('engines_by_year'))).rows;
  } catch (err) {
    console.error(err);
    $('engine-chart').textContent = 'Could not load the chart data.';
    return;
  }
  draw();
}

main();
