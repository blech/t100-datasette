import * as Plot from '/static/charts/vendor/plot.js';
import { HEAT_MEASURES } from '/static/charts/src/heatmap.js';
import { buildFamilySeries, SERIES_COLORS, OTHER_COLOR } from '/static/charts/src/rollup.js';
import { KIND_OPTIONS } from '/static/charts/src/aircraft.js';
import { queryUrl, fetchRows } from '/static/globe/src/api.js';
import { replaceSearch } from '/static/nav/src/state.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const pick = (key, allowed, fallback) => (allowed.includes(params.get(key)) ? params.get(key) : fallback);
const state = {
  measure: pick('measure', Object.keys(HEAT_MEASURES), 'passengers'),
  kind: pick('flights', ['passenger', 'freight', 'all'], 'passenger'),
  service: pick('service', ['all', 'domestic', 'international'], 'all'),
  aircraftKind: pick('aircraft', KIND_OPTIONS.map((k) => k.value), 'all'),
};
let rows = [];

const unit = () => HEAT_MEASURES[state.measure].toLowerCase().replace(/ \(.*/, '');
const fmt = (v) => Math.round(v).toLocaleString('en-US');

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
  const data = res.points.map((p) => ({ ...p, year: String(p.year), title: `${p.series}, ${p.year}\n${fmt(p.value)} ${unit()}` }));
  const colors = { domain: res.series, range: res.series.map((s, i) => (s === 'Other' ? OTHER_COLOR : SERIES_COLORS[i % SERIES_COLORS.length])), legend: true };
  box.append(Plot.plot({
    width: Math.min(box.clientWidth || 900, 1100),
    height: 420,
    marginLeft: 64,
    style: { background: 'transparent', fontSize: '12px' },
    x: { type: 'band', domain: years, label: null, tickFormat: (d) => (Number(d) % labelEvery === 0 ? d : '') },
    y: { label: HEAT_MEASURES[state.measure], tickFormat: '~s', grid: true },
    color: colors,
    marks: [
      Plot.barY(data, { x: 'year', y: 'value', fill: 'series', order: res.series, title: 'title', tip: true }),
      Plot.ruleY([0]),
    ],
  }));
}

async function main() {
  for (const [k, label] of Object.entries(HEAT_MEASURES)) $('mk-measure').append(new Option(label.toLowerCase(), k));
  for (const k of KIND_OPTIONS) $('mk-aircraft').append(new Option(k.label, k.value));
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
  $('mk-aircraft').value = state.aircraftKind;
  for (const [id, field] of [['mk-measure', 'measure'], ['mk-kind', 'kind'], ['mk-service', 'service'], ['mk-aircraft', 'aircraftKind']]) {
    $(id).addEventListener('change', (e) => { state[field] = e.target.value; pushState(); draw(); });
  }
  draw();
}

main();
