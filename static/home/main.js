import { queryUrl, fetchRows } from '/static/globe/src/api.js';
import { formatCount, millionsAxis } from '/static/common/numbers.js';
import { indexAirports, placePoints } from '/static/globe/src/adapter.js';
import { THEMES, resolveTheme } from '/static/globe/src/themes.js';
import { geoAlbersUsaTerritories } from '/static/globe/src/usamap.js';
import * as Plot from '/static/charts/vendor/plot.js';
import { buildEngineShares, ENGINE_SERIES, ENGINE_COLORS } from '/static/charts/src/rollup.js';
import { placeOnMap, hitTest, drawMap } from './src/map.js';
import { airlineLines, spreadLabels, passengerBands, OTHER_AIRLINES, airlineColours } from './src/airlines.js';
import { periodRows, attachPopover } from '/static/common/popover.js';

const $ = (id) => document.getElementById(id);
const minYear = Number(document.body.dataset.minYear);
const maxYear = Number(document.body.dataset.maxYear);
// charts leave room on screen for the next section to show
const chartHeight = () => Math.round(Math.min(380, window.innerHeight * 0.66));

function storedTheme() {
  try { return localStorage.getItem('t100-theme'); } catch (e) { return null; }
}
let theme = THEMES[resolveTheme(location.search, storedTheme(), matchMedia('(prefers-color-scheme: dark)').matches)];

function failed(box, what, err) {
  console.error(err);
  box.replaceChildren(Object.assign(document.createElement('p'), { className: 'graphic-status', textContent: `Couldn't load this ${what}.` }));
}

async function loadOutline() {
  const res = await fetch('/static/globe/vendor/states-10m.json');
  if (!res.ok) throw new Error(`Request failed (${res.status}): states-10m.json`);
  const topo = await res.json();
  return {
    nation: window.topojson.feature(topo, topo.objects.nation),
    borders: window.topojson.mesh(topo, topo.objects.states, (a, b) => a !== b),
  };
}

async function showMap() {
  const box = $('map-box');
  const canvas = $('usa-map');
  const tip = $('map-tip');
  const [outline, airportRes, busyRes] = await Promise.all([
    loadOutline(), fetchRows(queryUrl('airports')), fetchRows(queryUrl('busiest_airports', { year: maxYear })),
  ]);
  const points = placePoints(busyRes.rows, indexAirports(airportRes.rows));
  const proj = geoAlbersUsaTerritories(window.d3);
  const ctx = canvas.getContext('2d');
  const path = window.d3.geoPath(proj, ctx);
  let placed = [];
  let highlight = -1;
  let w = 1;
  let h = 1;

  const draw = () => drawMap(ctx, { w, h, path, frames: proj.insetFrames(), ...outline, placed, theme, highlight });
  function layout() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = Math.max(1, r.width);
    h = Math.max(1, r.height);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    proj.fitSize([w, h]);
    ({ placed } = placeOnMap(points, proj));
    highlight = -1;
    draw();
  }

  function pointAt(e) {
    const r = canvas.getBoundingClientRect();
    return hitTest(placed, e.clientX - r.left, e.clientY - r.top);
  }
  canvas.addEventListener('pointermove', (e) => {
    const i = pointAt(e);
    if (i === highlight) return;
    highlight = i;
    canvas.classList.toggle('pointing', i >= 0);
    if (i >= 0) {
      const p = placed[i];
      tip.textContent = `${p.code} · ${p.city} · ${formatCount(p.passengers)} passengers`;
      tip.style.left = `${Math.min(p.x + p.r + 6, w - 220)}px`;
      tip.style.top = `${Math.max(0, p.y - 30)}px`;
    }
    tip.hidden = i < 0;
    draw();
  });
  canvas.addEventListener('pointerleave', () => { highlight = -1; tip.hidden = true; canvas.classList.remove('pointing'); draw(); });
  canvas.addEventListener('click', (e) => {
    const i = pointAt(e);
    if (i >= 0) location.href = `/airports/${encodeURIComponent(placed[i].code)}`;
  });
  document.addEventListener('t100:theme', (e) => { theme = THEMES[e.detail.id] || theme; draw(); });
  new ResizeObserver(layout).observe(box);
  $('map-status').remove();
}

const pct = (v) => `${(v * 100).toFixed(1)}%`;
const width = (box) => Math.min(box.clientWidth || 900, 1100);

// the long-haul cut the /aircraft/engines page opens with
const ENGINE_STATE = { measure: 'deps', kind: 'passenger', band: '3000' };

async function showEngines() {
  const box = $('engine-chart');
  const rows = (await fetchRows(queryUrl('engines_by_year'))).rows;
  const res = buildEngineShares(rows, ENGINE_STATE);
  if (!res.points.length) { box.replaceChildren(); return; }
  const tips = periodRows(res.points, { key: (p) => p.year, order: ENGINE_SERIES, value: (p) => p.share, format: pct, top: () => 1 });
  const chart = Plot.plot({
    width: width(box),
    height: chartHeight(),
    marginLeft: 48,
    style: { background: 'transparent', fontSize: '12px' },
    x: { label: null, tickFormat: 'd', domain: [minYear, maxYear] },
    y: { label: 'Share of flights of 3,000 miles or more', tickFormat: '.0%', domain: [0, 1] },
    color: { domain: ENGINE_SERIES, range: ENGINE_COLORS, legend: true },
    marks: [
      Plot.areaY(res.points, { x: 'year', y: 'share', fill: 'series', order: ENGINE_SERIES }),
      Plot.ruleY([0]),
      Plot.ruleX(tips, Plot.pointerX({ x: 'period', stroke: 'currentColor', strokeOpacity: 0.25 })),
    ],
  });
  box.replaceChildren(...attachPopover(chart, { content: (d) => ({ title: String(d.period), rows: d.rows }), at: (d) => [d.period, 1] }));
}

const ALL_AIRLINES = 'All airlines';

// labels at the bands' right-hand ends, nudged apart where they crowd
function bandLabels(bands, names, height, yMax) {
  const ends = names.map((s) => bands.filter((d) => d.series === s).at(-1)).filter(Boolean);
  const y = spreadLabels(ends.map((d) => (d.y1 + d.y2) / 2), (14 * yMax) / (height - 62));
  return ends.map((d, i) => ({ ...d, labelY: y[i] }));
}

// a key mark before each label, then the name in the text colour (gold text on cream would be unreadable):
// a square in the band's colour for an airline, a pale square for everyone else
function labelMarks(labels, colourOf) {
  const at = { x: 'year', y: 'labelY', textAnchor: 'start' };
  const keyed = (kind) => labels.filter((d) => keyOf(d.series, colourOf).kind === kind);
  return [
    Plot.text(keyed('square'), { ...at, text: () => '■', dx: 6, fill: (d) => colourOf(d.series), fontSize: 14 }),
    Plot.text(keyed('other'), { ...at, text: () => '■', dx: 6, fill: 'currentColor', fillOpacity: 0.25, fontSize: 14 }),
    Plot.text(keyed('line'), { ...at, text: () => '—', dx: 5, fill: 'currentColor', fontWeight: 700 }),
    Plot.text(labels, { ...at, text: 'series', dx: 20, fill: 'currentColor' }),
  ];
}

function keyOf(series, colourOf) {
  if (series === OTHER_AIRLINES) return { kind: 'other' };
  if (series === ALL_AIRLINES) return { kind: 'line' };
  return { kind: 'square', colour: colourOf(series) };
}

const plotFrame = (box, height) => ({
  width: width(box),
  height,
  marginTop: 32,
  marginBottom: 30,
  marginLeft: 48,
  marginRight: 140,
  style: { background: 'transparent', fontSize: '12px' },
  x: { label: null, tickFormat: 'd', domain: [minYear, maxYear] },
});

// each airline's band and its top edge, in its livery colour
const airlineBands = (bands, colourOf) => [
  Plot.areaY(bands, { x: 'year', y1: 'y1', y2: 'y2', z: 'series', fill: (d) => colourOf(d.series), fillOpacity: 0.35, className: 'airline-band' }),
  Plot.lineY(bands, { x: 'year', y: 'y2', z: 'series', stroke: (d) => colourOf(d.series), strokeWidth: 1.5 }),
];

// passengers carried: today's four biggest airlines, then everyone else, stacked to the whole market
function passengerChart(box, { series, bands, colourOf }) {
  const height = chartHeight();
  const yMax = Math.max(...bands.map((d) => d.y2));
  const labels = bandLabels(bands, [...series, OTHER_AIRLINES], height, yMax);
  const totalByYear = new Map(bands.filter((d) => d.series === OTHER_AIRLINES).map((d) => [d.year, d.y2]));
  const tips = periodRows([...bands, ...[...totalByYear].map(([year, y2]) => ({ year, series: ALL_AIRLINES, passengers: y2, y2 }))], {
    key: (d) => d.year, order: [...series, OTHER_AIRLINES, ALL_AIRLINES], value: (d) => d.passengers,
    format: (n) => formatCount(n), top: (ds) => Math.max(...ds.map((d) => d.y2)),
  });
  const others = bands.filter((d) => d.series === OTHER_AIRLINES);
  return Plot.plot({
    ...plotFrame(box, height),
    y: { ...millionsAxis(yMax, 'Passengers'), domain: [0, yMax], grid: true, nice: true, ticks: 6 },
    marks: [
      ...airlineBands(bands.filter((d) => d.series !== OTHER_AIRLINES), colourOf),
      // everyone else: a faint tint of the text colour, its top edge (the whole market) dashed
      Plot.areaY(others, { x: 'year', y1: 'y1', y2: 'y2', fill: 'currentColor', fillOpacity: 0.07 }),
      Plot.lineY(others, { x: 'year', y: 'y2', stroke: 'currentColor', strokeOpacity: 0.6, strokeWidth: 1.5, strokeDasharray: '4 3' }),
      Plot.ruleY([0]),
      ...labelMarks(labels, colourOf),
      Plot.ruleX(tips, Plot.pointerX({ x: 'period', stroke: 'currentColor', strokeOpacity: 0.25 })),
    ],
  });
}

async function showAirlines() {
  const box = $('passenger-chart');
  const rows = (await fetchRows(queryUrl('top_carrier_history', { year: maxYear }))).rows;
  const { series } = airlineLines(rows);
  if (!series.length) { box.replaceChildren(); return; }
  const colours = new Map(series.map((name, i) => [name, airlineColours(series)[i]]));
  const colourOf = (name) => colours.get(name);
  const chart = passengerChart(box, { series, bands: passengerBands(rows, series), colourOf });
  box.replaceChildren(...attachPopover(chart, {
    content: (d) => ({ title: String(d.period), rows: d.rows }), at: (d) => [d.period, d.top], keyOf: (label) => keyOf(label, colourOf),
  }));
}

async function drawCharts() {
  showEngines().catch((err) => failed($('engine-chart'), 'chart', err));
  showAirlines().catch((err) => failed($('passenger-chart'), 'chart', err));
}

showMap().catch((err) => failed($('map-box'), 'map', err));
drawCharts();
