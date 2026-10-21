import * as Plot from '/static/charts/vendor/plot.js';
import { HEAT_MEASURES } from '/static/charts/src/heatmap.js';
import { buildFamilySeries, SERIES_COLORS, OTHER_COLOR } from '/static/charts/src/rollup.js';
import { shortNames } from '/static/charts/src/names.js';
import { queryUrl, fetchRows } from '/static/globe/src/api.js';
import { periodRows, attachPopover } from '/static/common/popover.js';
import { formatCount, millionsAxis } from '/static/common/numbers.js';
import { replaceSearch } from '/static/nav/src/state.js';

// the tallest stack, which sets the y axis's scale
const stackMax = (points, key, value = (p) => p.value) => {
  const sums = new Map();
  for (const p of points) sums.set(p[key], (sums.get(p[key]) || 0) + value(p));
  return Math.max(0, ...sums.values());
};

const family = document.body.dataset.family;
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const pick = (key, allowed, fallback) => (allowed.includes(params.get(key)) ? params.get(key) : fallback);
const state = {
  measure: pick('measure', Object.keys(HEAT_MEASURES), 'passengers'),
  kind: pick('flights', ['passenger', 'freight', 'all'], 'passenger'),
  service: pick('service', ['all', 'domestic', 'international'], 'all'),
  split: pick('split', ['subfamily', 'airline', 'service'], null),
};
let rows = [];

const unit = () => HEAT_MEASURES[state.measure].toLowerCase().replace(/ \(.*/, '');

function pushState() {
  const q = new URLSearchParams();
  if (state.measure !== 'passengers') q.set('measure', state.measure);
  if (state.kind !== 'passenger') q.set('flights', state.kind);
  if (state.service !== 'all') q.set('service', state.service);
  q.set('split', state.split);
  history.replaceState(null, '', `${location.pathname}${replaceSearch(location.search, ['measure', 'flights', 'service', 'split'], `?${q}`)}`);
}

function draw() {
  const box = $('family-chart');
  box.replaceChildren();
  const res = buildFamilySeries(rows, state);
  if (!res.points.length) { box.textContent = `No ${unit()} for this selection.`; return; }
  const years = res.years.map(String);
  const labelEvery = years.length <= 15 ? 1 : 5;
  const data = res.points.map((p) => ({ ...p, year: String(p.year) }));
  const tips = periodRows(data, { key: (p) => p.year, order: res.series, format: (v) => formatCount(v) });
  const colors = { domain: res.series, range: res.series.map((s, i) => (s === 'Other' ? OTHER_COLOR : SERIES_COLORS[i % SERIES_COLORS.length])), legend: true };
  const chart = Plot.plot({
    width: Math.min(box.clientWidth || 900, 1100),
    height: 420,
    marginLeft: 64,
    style: { background: 'transparent', fontSize: '12px' },
    x: { type: 'band', domain: years, label: null, tickFormat: (d) => (Number(d) % labelEvery === 0 ? d : '') },
    y: { ...millionsAxis(stackMax(res.points, 'year'), HEAT_MEASURES[state.measure]), grid: true },
    color: colors,
    marks: [
      Plot.barY(data, { x: 'year', y: 'value', fill: 'series', order: res.series }),
      Plot.ruleX(tips, Plot.pointerX({ x: 'period', strokeOpacity: 0 })),
      Plot.ruleY([0]),
    ],
  });
  box.append(...attachPopover(chart, { content: (d) => ({ title: `${family}, ${d.period}`, rows: d.rows }), at: (d) => [d.period, d.top] }));
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
  for (const [id, field] of [['fam-measure', 'measure'], ['fam-kind', 'kind'], ['fam-service', 'service'], ['fam-split', 'split']]) {
    $(id).addEventListener('change', (e) => { state[field] = e.target.value; pushState(); draw(); });
  }
  draw();
}

main();
