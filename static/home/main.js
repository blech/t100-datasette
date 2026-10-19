import { queryUrl, fetchRows } from '/static/globe/src/api.js';
import { indexAirports, placePoints } from '/static/globe/src/adapter.js';
import { THEMES, resolveTheme } from '/static/globe/src/themes.js';
import { geoAlbersUsaTerritories } from '/static/globe/src/usamap.js';
import { placeOnMap, hitTest, drawMap } from './src/map.js';

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

// the two charts; filled in by the next task
async function drawCharts() {}

showMap().catch((err) => failed($('map-box'), 'map', err));
drawCharts();
