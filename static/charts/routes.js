import * as Plot from '/static/charts/vendor/plot.js';
import { buildHeatmap, HEAT_MEASURES } from '/static/charts/src/heatmap.js';
import { queryUrl, fetchRows } from '/static/globe/src/api.js';

const origin = document.body.dataset.origin;
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const pick = (key, allowed, fallback) => (allowed.includes(params.get(key)) ? params.get(key) : fallback);
const state = {
  measure: pick('measure', Object.keys(HEAT_MEASURES), 'passengers'),
  service: pick('service', ['all', 'domestic', 'international'], 'all'),
  n: Number(pick('n', ['10', '25', '50'], '25')),
};
let rows = [];
let cities = new Map();

const ROW_PX = 20;

function pushState() {
  const q = new URLSearchParams();
  if (state.measure !== 'passengers') q.set('measure', state.measure);
  if (state.service !== 'all') q.set('service', state.service);
  if (state.n !== 25) q.set('n', state.n);
  const s = q.toString();
  history.replaceState(null, '', `${location.pathname}${s ? `?${s}` : ''}`);
}

function draw() {
  const box = $('heatmap');
  box.replaceChildren();
  const res = buildHeatmap(rows, state);
  if (!res.cells.length) {
    box.textContent = 'No routes to chart for this selection.';
    return;
  }
  const years = res.years.map(String);
  const labelEvery = years.length <= 15 ? 1 : 5;
  const data = res.cells.map((c) => ({
    ...c,
    year: String(c.year),
    label: `${c.dest}${cities.get(c.dest) ? ` · ${cities.get(c.dest)}` : ''}\n${c.year}: ${Math.round(c.value).toLocaleString('en-US')} ${HEAT_MEASURES[state.measure].toLowerCase().replace(/ \(.*/, '')}`,
    href: `/t100/route?origin=${encodeURIComponent(origin)}&dest=${encodeURIComponent(c.dest)}&_hide_sql=1`,
  }));
  box.append(Plot.plot({
    width: Math.min(box.clientWidth || 900, 1100),
    height: res.dests.length * ROW_PX + 90,
    marginLeft: 48,
    marginTop: 30,
    padding: 0.08,
    style: { background: 'transparent', fontSize: '12px' },
    x: { type: 'band', domain: years, label: null, axis: 'top', tickFormat: (d) => (Number(d) % labelEvery === 0 ? d : '') },
    y: { type: 'band', domain: res.dests, label: null },
    color: { type: 'sqrt', scheme: 'YlOrRd', legend: true, label: HEAT_MEASURES[state.measure], tickFormat: '~s' },
    marks: [Plot.cell(data, { x: 'year', y: 'dest', fill: 'value', title: 'label', href: 'href', tip: true })],
  }));
}

async function main() {
  fillControls();
  try {
    const [byYear, airports] = await Promise.all([
      fetchRows(queryUrl('routes_by_year', { origin })),
      fetchRows(queryUrl('airports')),
    ]);
    rows = byYear.rows;
    cities = new Map(airports.rows.map((a) => [a.code, a.city]));
    const here = airports.rows.find((a) => a.code === origin);
    if (here) $('title').textContent = `${origin} (${here.city}): routes over time`;
    if (byYear.truncated) $('subtitle').textContent = 'Too many rows: some routes are missing from this chart.';
  } catch (err) {
    console.error(err);
    $('heatmap').textContent = 'Could not load the chart data.';
    return;
  }
  if (!rows.length) { $('heatmap').textContent = `No flights from ${origin} in the data.`; return; }
  draw();
}

function fillControls() {
  const measure = $('heat-measure');
  for (const [k, label] of Object.entries(HEAT_MEASURES)) measure.append(new Option(label, k));
  measure.value = state.measure;
  $('heat-service').value = state.service;
  $('heat-n').value = String(state.n);
  measure.addEventListener('change', (e) => { state.measure = e.target.value; pushState(); draw(); });
  $('heat-service').addEventListener('change', (e) => { state.service = e.target.value; pushState(); draw(); });
  $('heat-n').addEventListener('change', (e) => { state.n = Number(e.target.value); pushState(); draw(); });
}

main();
