import * as Plot from '/static/charts/vendor/plot.js';
import { HEAT_MEASURES } from '/static/charts/src/heatmap.js';
import { buildFamilySeries, SERIES_COLORS, OTHER_COLOR } from '/static/charts/src/rollup.js';
import { shortNames } from '/static/charts/src/names.js';
import { parseSpan, yearDomain } from '/static/charts/src/span.js';
import { queryUrl, fetchRows } from '/static/globe/src/api.js';
import { replaceSearch } from '/static/nav/src/state.js';

const family = document.body.dataset.family;
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const pick = (key, allowed, fallback) => (allowed.includes(params.get(key)) ? params.get(key) : fallback);
const state = {
  measure: pick('measure', Object.keys(HEAT_MEASURES), 'passengers'),
  kind: pick('flights', ['passenger', 'freight', 'all'], 'passenger'),
  service: pick('service', ['all', 'domestic', 'international'], 'all'),
  split: pick('split', ['subfamily', 'airline', 'service'], null),
  span: parseSpan(params.get('span')),
};
const bounds = { min: Number(document.body.dataset.minYear), max: Number(document.body.dataset.maxYear) };
let rows = [];

const unit = () => HEAT_MEASURES[state.measure].toLowerCase().replace(/ \(.*/, '');
const fmt = (v) => Math.round(v).toLocaleString('en-US');

function pushState() {
  const q = new URLSearchParams();
  if (state.measure !== 'passengers') q.set('measure', state.measure);
  if (state.kind !== 'passenger') q.set('flights', state.kind);
  if (state.service !== 'all') q.set('service', state.service);
  q.set('split', state.split);
  if (state.span !== 'flown') q.set('span', state.span);
  history.replaceState(null, '', `${location.pathname}${replaceSearch(location.search, ['measure', 'flights', 'service', 'split', 'span'], `?${q}`)}`);
}

function draw() {
  const box = $('family-chart');
  box.replaceChildren();
  const res = buildFamilySeries(rows, state);
  if (!res.points.length) { box.textContent = `No ${unit()} for this selection.`; return; }
  const years = yearDomain(res.years, { span: state.span, ...bounds }).map(String);
  const labelEvery = years.length <= 15 ? 1 : 5;
  const data = res.points.map((p) => ({ ...p, year: String(p.year), title: `${family}, ${p.year}\n${p.series}: ${fmt(p.value)} ${unit()}` }));
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

function chooseSplit() {
  // a family with several versions is most interesting split by version; otherwise by airline
  if (state.split) return;
  const versions = new Set(rows.map((r) => r.subfamily).filter(Boolean));
  state.split = versions.size > 1 ? 'subfamily' : 'airline';
}

async function main() {
  const measure = $('fam-measure');
  for (const [k, label] of Object.entries(HEAT_MEASURES)) measure.append(new Option(label.toLowerCase(), k));
  try {
    rows = (await fetchRows(queryUrl('family_detail', { family }))).rows;
    const shorts = shortNames(rows.map((r) => r.group_name));
    rows = rows.map((r) => ({ ...r, group_name: shorts.get(r.group_name) }));
  } catch (err) {
    console.error(err);
    $('family-chart').textContent = 'Could not load the chart data.';
    return;
  }
  chooseSplit();
  measure.value = state.measure;
  $('fam-kind').value = state.kind;
  $('fam-service').value = state.service;
  $('fam-split').value = state.split;
  $('fam-span').value = state.span;
  for (const [id, field] of [['fam-measure', 'measure'], ['fam-kind', 'kind'], ['fam-service', 'service'], ['fam-split', 'split'], ['fam-span', 'span']]) {
    $(id).addEventListener('change', (e) => { state[field] = e.target.value; pushState(); draw(); });
  }
  draw();
}

main();
