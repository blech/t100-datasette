import { queryUrl, fetchRows } from '/static/globe/src/api.js';
import { formatCount, millionsAxis } from '/static/common/numbers.js';
import { indexAirports, placePoints } from '/static/globe/src/adapter.js';
import { THEMES, resolveTheme } from '/static/globe/src/themes.js';
import { geoAlbersUsaTerritories } from '/static/globe/src/usamap.js';
import * as Plot from '/static/charts/vendor/plot.js';
import { buildEngineShares, ENGINE_SERIES } from '/static/charts/src/rollup.js';
import { palette, isDark } from '/static/common/palette.js';
import { placeOnMap, hitTest, drawMap } from './src/map.js';
import { airlineLines, passengerBands, OTHER_AIRLINES, airlineColours } from './src/airlines.js';
import { periodRows, attachPopover } from '/static/common/popover.js';
import { attachHighlight } from '/static/common/highlight.js';

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

// the long-haul cut the /aircraft/groups page opens with
const ENGINE_STATE = { measure: 'deps', kind: 'passenger', from: '3000', to: 'any' };

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
    color: { domain: ENGINE_SERIES, range: palette(isDark()).engines, legend: true },
    marks: [
      Plot.areaY(res.points, { x: 'year', y: 'share', fill: 'series', order: ENGINE_SERIES }),
      Plot.ruleY([0]),
      Plot.ruleX(tips, Plot.pointerX({ x: 'period', strokeOpacity: 0 })),
    ],
  });
  attachHighlight(chart);
  box.replaceChildren(...attachPopover(chart, { content: (d) => ({ title: String(d.period), rows: d.rows }), at: (d) => [d.period, 1] }));
}

const ALL_AIRLINES = 'All airlines';

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
  marginRight: 20,
  style: { background: 'transparent', fontSize: '12px' },
  x: { label: null, tickFormat: 'd', domain: [minYear, maxYear] },
});

// each airline's band (filled through the colour scale, so the legend and highlight know it) and its top edge
const airlineBands = (bands, colourOf) => [
  Plot.areaY(bands, { x: 'year', y1: 'y1', y2: 'y2', fill: 'series', fillOpacity: 0.35, className: 'airline-band' }),
  Plot.lineY(bands, { x: 'year', y: 'y2', z: 'series', stroke: (d) => colourOf(d.series), strokeWidth: 1.5, className: 'band-edge' }),
];

// the highlight fades bands; fade the other bands' top edges with them (everyone else's dashed edge too)
function fadeEdges(plot, colourOf) {
  const svg = [...plot.querySelectorAll('svg')].at(-1);
  const hex = (c) => String(c).toLowerCase();
  plot.addEventListener('highlight', (e) => {
    const on = e.detail.length > 0;
    const keep = new Set(e.detail.map((s) => hex(colourOf(s))));
    for (const path of svg.querySelectorAll('.band-edge path')) path.classList.toggle('faded', on && !keep.has(hex(path.getAttribute('stroke'))));
    for (const path of svg.querySelectorAll('.others-edge path')) path.classList.toggle('faded', on && !e.detail.includes(OTHER_AIRLINES));
  });
}

// passengers carried: today's four biggest airlines, then everyone else, stacked to the whole market
function passengerChart(box, { series, bands, colourOf }) {
  const height = chartHeight();
  const yMax = Math.max(...bands.map((d) => d.y2));
  const totalByYear = new Map(bands.filter((d) => d.series === OTHER_AIRLINES).map((d) => [d.year, d.y2]));
  const tips = periodRows([...bands, ...[...totalByYear].map(([year, y2]) => ({ year, series: ALL_AIRLINES, passengers: y2, y2 }))], {
    key: (d) => d.year, order: [...series, OTHER_AIRLINES, ALL_AIRLINES], value: (d) => d.passengers,
    format: (n) => formatCount(n), top: (ds) => Math.max(...ds.map((d) => d.y2)),
  });
  const others = bands.filter((d) => d.series === OTHER_AIRLINES);
  return Plot.plot({
    ...plotFrame(box, height),
    y: { ...millionsAxis(yMax, 'Passengers'), domain: [0, yMax], grid: true, tickSize: 0, nice: true, ticks: 6 },
    color: { domain: [...series, OTHER_AIRLINES], range: [...series, OTHER_AIRLINES].map(colourOf), legend: true },
    marks: [
      ...airlineBands(bands.filter((d) => d.series !== OTHER_AIRLINES), colourOf),
      // everyone else: a faint grey, its top edge (the whole market) dashed in the text colour
      Plot.areaY(others, { x: 'year', y1: 'y1', y2: 'y2', fill: 'series', fillOpacity: 0.2 }),
      Plot.lineY(others, { x: 'year', y: 'y2', stroke: 'currentColor', strokeOpacity: 0.6, strokeWidth: 1.5, strokeDasharray: '4 3', className: 'others-edge' }),
      Plot.ruleY([0]),
      Plot.ruleX(tips, Plot.pointerX({ x: 'period', strokeOpacity: 0 })),
    ],
  });
}

async function showAirlines() {
  const box = $('passenger-chart');
  const rows = (await fetchRows(queryUrl('top_carrier_history', { year: maxYear }))).rows;
  const { series } = airlineLines(rows);
  if (!series.length) { box.replaceChildren(); return; }
  const colours = new Map(series.map((name, i) => [name, airlineColours(series)[i]]));
  colours.set(OTHER_AIRLINES, palette(isDark()).other);
  const colourOf = (name) => colours.get(name);
  const chart = passengerChart(box, { series, bands: passengerBands(rows, series), colourOf });
  attachHighlight(chart);
  fadeEdges(chart, colourOf);
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
// the charts' colours follow the theme (the map listens for itself)
document.addEventListener('t100:theme', () => drawCharts());
