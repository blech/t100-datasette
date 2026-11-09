// SPIKE: a year's busiest airport pairs on the globe, or on a flat or azimuthal map (/airports/globe/routes).
// Everything is in the URL: year, n, service, proj (globe, flat, equirect, kansas, pole), arcs=bowed, sea=plain, theme.
import { THEMES, DEFAULT_THEME, resolveTheme, themeChoice } from '/static/globe/src/themes.js';
import { setDataLink } from '/static/common/datalink.js';
import { placePopover } from '/static/common/popover.js';
import { defaultView, glide } from '/static/globe/src/camera.js';
import { attachInteraction, applyInertia } from '/static/globe/src/interaction.js';
import { queryUrl, fetchRows } from '/static/globe/src/api.js';
import { indexAirports } from '/static/globe/src/adapter.js';
import { NetworkRenderer } from '/static/globe/src/renderer.js';
import { maxOf } from '/static/globe/src/scale.js';
import { styleRoutes, legendItems, toggleHide } from '/static/globe/src/routestyle.js';
import { renderLegend } from '/static/globe/src/controls.js';
import { formatCount as fmt, countLabel } from '/static/common/numbers.js';
import { routeFigures } from '/static/globe/src/panel.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const MIN_YEAR = 1990;
const MAX_YEAR = Number(document.body.dataset.maxYear) || 2025;
const years = Array.from({ length: MAX_YEAR - MIN_YEAR + 1 }, (_, i) => MIN_YEAR + i);
const NS = ['50', '100', '150', '250', '500'];
// the menu's map types: which renderer mode each uses, and where it starts (a rotation, as the view keeps it)
const PROJS = {
  globe: { mode: 'globe', rot: [96, -38] },
  flat: { mode: 'flat', rot: [100, 0] },
  equirect: { mode: 'equirect', rot: [100, 0] },
  kansas: { mode: 'azimuthal', rot: [98, -39] },
  pole: { mode: 'azimuthal', rot: [100, -90] },
};
const pick = (v, ok, fallback) => (ok.includes(v) ? v : fallback);
const state = {
  year: pick(Number(params.get('year')), years, MAX_YEAR),
  n: pick(params.get('n'), NS, '50'),
  service: pick(params.get('service'), ['', 'domestic', 'international'], ''),
  proj: pick(params.get('proj'), Object.keys(PROJS), 'globe'),
  arcs: params.get('arcs') === 'bowed' ? 'bowed' : 'great',
  sea: params.get('sea') === 'plain' ? 'plain' : 'sea',
  hide: [],
};

let airports = new Map();
let routes = [];
let shown = [];
let dots = [];
let skipped = [];
function storedTheme() {
  try { return localStorage.getItem('t100-theme'); } catch (e) { return null; }
}
let themeId = resolveTheme(location.search, storedTheme(), matchMedia('(prefers-color-scheme: dark)').matches);
let themeChosen = themeChoice(location.search, storedTheme());
let dirty = true;
let hover = -1;
let hoverDot = -1;
let selected = -1;
let playTimer = null;
let renderer;
let latest = 0;
const view = defaultView();
const cache = new Map();
const canvas = $('globe');

new ResizeObserver(() => {
  document.documentElement.style.setProperty('--below-header', `${Math.ceil($('header').getBoundingClientRect().bottom) + 8}px`);
}).observe($('header'));

function setStatus(text, warn = false) {
  const el = $('status');
  el.textContent = text;
  el.className = warn ? 'warn' : '';
}

function applyTheme(id) {
  themeId = THEMES[id] ? id : DEFAULT_THEME;
  if (renderer) renderer.setTheme(THEMES[themeId]);
  dirty = true;
}
document.addEventListener('t100:theme', (e) => { themeChosen = e.detail.choice; applyTheme(e.detail.id); drawLegend(); pushState(); });

function pushState() {
  const q = new URLSearchParams();
  if (state.year !== MAX_YEAR) q.set('year', state.year);
  if (state.n !== '50') q.set('n', state.n);
  if (state.service) q.set('service', state.service);
  if (state.proj !== 'globe') q.set('proj', state.proj);
  if (state.arcs === 'bowed') q.set('arcs', 'bowed');
  if (state.sea === 'plain') q.set('sea', 'plain');
  if (themeChosen !== 'auto') q.set('theme', themeChosen);
  const s = q.toString();
  history.replaceState(null, '', `${location.pathname}${s ? `?${s}` : ''}`);
}

function setProj(p) {
  state.proj = p;
  renderer.setMode(PROJS[p].mode);
  Object.assign(view, { rot: [...PROJS[p].rot], zoom: 1, vel: [0, 0], target: null });
  dirty = true;
}

// each route's ends placed on the map, and each airport's passengers summed over the routes shown
function placeAll(rows) {
  const miss = new Set();
  const out = [];
  for (const r of rows) {
    const a = airports.get(r.origin), b = airports.get(r.dest);
    if (!a) miss.add(r.origin);
    if (!b) miss.add(r.dest);
    if (a && b) out.push({ ...r, from: [a.lon, a.lat], to: [b.lon, b.lat] });
  }
  return { routes: out, skipped: [...miss].sort() };
}

function airportDots(list) {
  const by = new Map();
  for (const r of list) {
    for (const [code, pos] of [[r.origin, r.from], [r.dest, r.to]]) {
      const d = by.get(code) || { code, pos, value: 0 };
      d.value += Number(r.passengers) || 0;
      by.set(code, d);
    }
  }
  return [...by.values()];
}

async function load() {
  const id = ++latest;
  const args = { year: state.year, n: state.n, service: state.service };
  setDataLink('busiest_routes_year', args);
  const key = JSON.stringify(args);
  if (!cache.has(key)) cache.set(key, fetchRows(queryUrl('busiest_routes_year', args)));
  setStatus('Loading…');
  try {
    const res = await cache.get(key);
    if (id !== latest) return;
    ({ routes, skipped } = placeAll(res.rows));
    setStatus('');
  } catch (err) {
    if (id !== latest) return;
    console.error(err);
    routes = [];
    setStatus(`Could not load routes: ${err.message}`, true);
  }
  refresh();
}

function drawLegend() {
  renderLegend($('legend-chips'), legendItems({ mode: 'service', comparing: false, hide: state.hide, routes, dark: THEMES[themeId].dark }),
    (k) => { state.hide = toggleHide(state.hide, k); refresh(); });
}

function refresh() {
  hover = -1;
  hoverDot = -1;
  selected = -1;
  $('panel').hidden = true;
  $('tooltip').hidden = true;
  shown = routes.filter((r) => !state.hide.includes(r.service));
  dots = airportDots(shown);
  $('year').value = String(years.indexOf(state.year));
  $('year-label').textContent = state.year;
  const pax = shown.reduce((s, r) => s + Number(r.passengers || 0), 0);
  $('stats').textContent = `${state.year} · ${shown.length} airport pairs · ${dots.length} airports · ${countLabel(pax)} passengers`;
  drawLegend();
  $('footnote').textContent = skipped.length ? `Not shown (no coordinates): ${skipped.join(', ')}` : '';
  pushState();
  dirty = true;
}

const place = (code) => airports.get(code)?.place || '';

function showPanel(r) {
  const p = $('panel');
  p.replaceChildren();
  const close = Object.assign(document.createElement('button'), { className: 'close', textContent: '×' });
  close.setAttribute('aria-label', 'Close');
  close.onclick = () => { selected = -1; p.hidden = true; dirty = true; };
  const h = Object.assign(document.createElement('h2'), { textContent: `${r.origin} – ${r.dest}` });
  const sub = Object.assign(document.createElement('div'), { textContent: `${place(r.origin)} – ${place(r.dest)}` });
  const dl = document.createElement('dl');
  for (const f of routeFigures(r)) {
    dl.append(Object.assign(document.createElement('dt'), { textContent: f.label }), Object.assign(document.createElement('dd'), { title: f.title, textContent: f.shown }));
  }
  const a = Object.assign(document.createElement('a'), { href: `/airports/${r.origin}/${r.dest}/${state.year}`, textContent: 'This route over time →' });
  p.append(close, h, sub, dl, a);
  p.hidden = false;
}

function bindControls() {
  const slider = $('year');
  slider.max = String(years.length - 1);
  slider.addEventListener('input', () => { state.year = years[Number(slider.value)]; load(); });
  for (const [id, key] of [['n', 'n'], ['service', 'service']]) {
    const el = $(id);
    el.value = state[key];
    el.addEventListener('change', () => { state[key] = el.value; load(); });
  }
  const proj = $('proj');
  proj.value = state.proj;
  proj.addEventListener('change', () => { setProj(proj.value); pushState(); });
  for (const key of ['arcs', 'sea']) {
    const el = $(key);
    el.value = state[key];
    el.addEventListener('change', () => { state[key] = el.value; pushState(); dirty = true; });
  }
  // frame the routes in the clear area between the header and the controls, with room for labels: on the globe by turning
  // and zooming it, on the flat and azimuthal maps by moving the middle of the map too
  $('fit').addEventListener('click', () => {
    const points = shown.flatMap((r) => renderer.arcPoints(r));
    const box = { left: 48, right: innerWidth - 64, top: $('header').getBoundingClientRect().bottom + 24, bottom: $('controls').getBoundingClientRect().top - 16 };
    const fit = renderer.fitPlanar(points, box) || renderer.fit(points, box);
    if (fit) { view.vel = [0, 0]; view.target = fit; }
  });
  $('play').addEventListener('click', () => {
    if (playTimer) { clearInterval(playTimer); playTimer = null; $('play').textContent = '▶'; return; }
    $('play').textContent = '⏸';
    if (state.year === MAX_YEAR) { state.year = MIN_YEAR; load(); }
    playTimer = setInterval(() => {
      if (state.year >= MAX_YEAR) { clearInterval(playTimer); playTimer = null; $('play').textContent = '▶'; return; }
      state.year += 1;
      load();
    }, 900);
  });
}

function bindCanvas() {
  attachInteraction(canvas, view, {
    degPerPx: () => renderer.degPerPx(),
    onUserMove: () => { dirty = true; $('tooltip').hidden = true; },
    onReset: () => { setProj(state.proj); },
    onHover: (x, y) => {
      const d = renderer.hitTestDots(x, y, dots);
      const i = d >= 0 ? -1 : renderer.hitTest(x, y, shown);
      if (i !== hover || d !== hoverDot) { hover = i; hoverDot = d; dirty = true; }
      const tip = $('tooltip');
      if (d >= 0) {
        const a = dots[d];
        tip.textContent = `${a.code} · ${place(a.code)}\n${fmt(a.value)} passengers on these routes`;
      } else if (i >= 0) {
        const r = shown[i];
        tip.textContent = `${r.origin} – ${r.dest}\n${place(r.origin)} – ${place(r.dest)}\n${fmt(r.passengers)} passengers · ${fmt(r.deps)} departures`;
      } else { tip.hidden = true; return; }
      placePopover(tip, x, y, { dx: 14, dy: 14 });
    },
    onTap: (x, y) => {
      const d = renderer.hitTestDots(x, y, dots);
      if (d >= 0) { location.href = `/airports/${dots[d].code}/globe?year=${state.year}`; return; }
      selected = renderer.hitTest(x, y, shown, 10);
      if (selected >= 0) showPanel(shown[selected]); else $('panel').hidden = true;
      dirty = true;
    },
  });
}

// the routes to bring forward: the selected or hovered one, or every route of the hovered airport
function litRoutes() {
  const i = selected >= 0 ? selected : hover;
  if (i >= 0) return new Set([i]);
  if (hoverDot < 0) return new Set();
  const code = dots[hoverDot].code;
  return new Set(shown.flatMap((r, k) => (r.origin === code || r.dest === code ? [k] : [])));
}

function frame(last, now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  const moving = !view.dragging && (Math.abs(view.vel[0]) > 0.05 || Math.abs(view.vel[1]) > 0.05);
  applyInertia(view, dt);
  if (glide(view, dt) || moving) dirty = true;
  if (dirty && renderer) {
    dirty = false;
    const styles = styleRoutes(shown, { mode: 'service', theme: THEMES[themeId], widthKey: 'passengers' });
    renderer.draw(view, shown, {
      widthKey: 'passengers', max: maxOf(shown, 'passengers'), highlightSet: litRoutes(), fadeAll: true, styles,
      bowed: state.arcs === 'bowed', plain: state.sea === 'plain', airportDots: dots, dotLabels: 60,
    });
  }
  requestAnimationFrame((n) => frame(now, n));
}

async function loadLand() {
  const res = await fetch('/static/globe/vendor/land-110m.json');
  if (!res.ok) throw new Error(`Could not load land data: ${res.status}`);
  const topo = await res.json();
  return window.topojson.feature(topo, topo.objects.land);
}

async function main() {
  setStatus('Loading…');
  const [land, airportRes] = await Promise.all([loadLand(), fetchRows(queryUrl('airports'))]);
  airports = indexAirports(airportRes.rows);
  renderer = new NetworkRenderer(canvas, land);
  renderer.panFlat = true;
  applyTheme(themeId);
  const resize = () => { renderer.resize(); dirty = true; };
  window.addEventListener('resize', resize);
  setProj(state.proj);
  resize();
  bindCanvas();
  bindControls();
  requestAnimationFrame((n) => frame(n, n));
  await load();
}

main().catch((err) => { console.error(err); setStatus(`Something went wrong: ${err.message}`, true); });
