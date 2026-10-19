import { queryUrl, fetchRows } from '/static/globe/src/api.js';
import { indexAirports, placePoints } from '/static/globe/src/adapter.js';
import { THEMES, resolveTheme } from '/static/globe/src/themes.js';
import { geoAlbersUsaTerritories } from '/static/globe/src/usamap.js';
import * as Plot from '/static/charts/vendor/plot.js';
import { buildEngineShares, ENGINE_SERIES, ENGINE_COLORS } from '/static/charts/src/rollup.js';
import { placeOnMap, hitTest, drawMap } from './src/map.js';
import { concentrationPoints, CONCENTRATION_SERIES } from './src/concentration.js';

const $ = (id) => document.getElementById(id);
const minYear = Number(document.body.dataset.minYear);
const maxYear = Number(document.body.dataset.maxYear);
const fmt = (n) => Number(n || 0).toLocaleString('en-US');
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
      tip.textContent = `${p.code} · ${p.city} · ${fmt(p.passengers)} passengers`;
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
  const data = res.points.map((p) => ({ ...p, title: `${p.series}, ${p.year}\n${pct(p.share)} of long-haul flights` }));
  box.replaceChildren(Plot.plot({
    width: width(box),
    height: chartHeight(),
    marginLeft: 48,
    style: { background: 'transparent', fontSize: '12px' },
    x: { label: null, tickFormat: 'd', domain: [minYear, maxYear] },
    y: { label: 'Share of flights of 3,000 miles or more', tickFormat: '.0%', domain: [0, 1] },
    color: { domain: ENGINE_SERIES, range: ENGINE_COLORS, legend: true },
    marks: [
      Plot.areaY(data, { x: 'year', y: 'share', fill: 'series', order: ENGINE_SERIES, title: 'title', tip: true }),
      Plot.ruleY([0]),
    ],
  }));
}

async function showConcentration() {
  const box = $('concentration-chart');
  const data = concentrationPoints((await fetchRows(queryUrl('carrier_concentration'))).rows);
  if (!data.length) { box.replaceChildren(); return; }
  const [top4, top10] = CONCENTRATION_SERIES;
  const line = (series, opts) => Plot.lineY(data.filter((d) => d.series === series), { x: 'year', y: 'share', stroke: 'currentColor', ...opts });
  box.replaceChildren(Plot.plot({
    width: width(box),
    height: chartHeight(),
    marginLeft: 48,
    marginRight: 110,
    style: { background: 'transparent', fontSize: '12px' },
    x: { label: null, tickFormat: 'd', domain: [minYear, maxYear] },
    y: { label: 'Share of all passengers', tickFormat: '.0%', domain: [0, 1], grid: true },
    marks: [
      Plot.ruleY([0]),
      line(top10, { strokeWidth: 1.5, strokeOpacity: 0.45 }),
      line(top4, { strokeWidth: 2.5 }),
      Plot.text(data, Plot.selectLast({ x: 'year', y: 'share', z: 'series', text: 'series', textAnchor: 'start', dx: 6, fill: 'currentColor' })),
      Plot.tip(data, Plot.pointerX({ x: 'year', y: 'share', title: (d) => `${d.series}, ${d.year}: ${pct(d.share)}` })),
    ],
  }));
}

async function drawCharts() {
  showEngines().catch((err) => failed($('engine-chart'), 'chart', err));
  showConcentration().catch((err) => failed($('concentration-chart'), 'chart', err));
}

showMap().catch((err) => failed($('map-box'), 'map', err));
drawCharts();
