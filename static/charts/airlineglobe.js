import { THEMES, resolveTheme } from '/static/globe/src/themes.js';
import { defaultView, clamp } from '/static/globe/src/camera.js';
import { attachInteraction, applyInertia } from '/static/globe/src/interaction.js';
import { queryUrl, fetchRows } from '/static/globe/src/api.js';
import { indexAirports } from '/static/globe/src/adapter.js';
import { NetworkRenderer } from '/static/globe/src/renderer.js';
import { maxOf } from '/static/globe/src/scale.js';
import { mapRoutes, centreOf } from '/static/charts/src/airline.js';
import { shortName } from '/static/charts/src/names.js';

const $ = (id) => document.getElementById(id);
const group = document.body.dataset.group;
const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const params = new URLSearchParams(location.search);
const MINS = ['1', '12', '52'];
const state = {
  year: Number(params.get('year')) || null,
  compare: Number(params.get('compare')) || null,
  proj: params.get('proj') === 'flat' ? 'flat' : 'globe',
  width: ['passengers', 'deps', 'freight'].includes(params.get('width')) ? params.get('width') : 'passengers',
  min: MINS.includes(params.get('min')) ? params.get('min') : '12',
};

let airports = new Map();
let years = [];
let routes = [];
let skipped = [];
let themeId = resolveTheme(location.search, localStorage.getItem('t100-theme'));
let dirty = true;
let hover = -1;
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
  themeId = THEMES[id] ? id : 'paper';
  if (renderer) renderer.setTheme(THEMES[themeId]);
  dirty = true;
}
document.addEventListener('t100:theme', (e) => { applyTheme(e.detail.id); pushState(); });

function pushState() {
  const q = new URLSearchParams();
  if (state.year) q.set('year', state.year);
  if (state.compare) q.set('compare', state.compare);
  if (state.proj === 'flat') q.set('proj', 'flat');
  if (state.width !== 'passengers') q.set('width', state.width);
  if (state.min !== '12') q.set('min', state.min);
  if (themeId !== 'paper') q.set('theme', themeId);
  const s = q.toString();
  history.replaceState(null, '', `${location.pathname}${s ? `?${s}` : ''}`);
}

async function yearRows(year) {
  const key = `${year}:${state.min}`;
  if (!cache.has(key)) cache.set(key, fetchRows(queryUrl('carrier_routes_year', { group, year, min: state.min })));
  return cache.get(key);
}

async function load() {
  const id = ++latest;
  setStatus('Loading…');
  try {
    const [now, then] = await Promise.all([yearRows(state.year), state.compare ? yearRows(state.compare) : null]);
    if (id !== latest) return;
    ({ routes, skipped } = mapRoutes(now.rows, then ? then.rows : null, airports));
    setStatus(now.truncated || (then && then.truncated) ? 'Too many rows: some routes are missing from this view.' : '', true);
  } catch (err) {
    if (id !== latest) return;
    console.error(err);
    routes = [];
    setStatus(`Could not load routes: ${err.message}`, true);
  }
  refresh();
}

function counts() {
  const c = { kept: 0, added: 0, dropped: 0 };
  for (const r of routes) if (r.status) c[r.status] += 1;
  return c;
}

function refresh() {
  hover = -1;
  selected = -1;
  $('panel').hidden = true;
  $('tooltip').hidden = true;
  $('year-label').textContent = state.compare ? `${state.compare} → ${state.year}` : state.year;
  syncHandles();
  const c = counts();
  const pax = routes.reduce((s, r) => s + (r.status === 'dropped' ? 0 : Number(r.passengers || 0)), 0);
  $('stats').textContent = state.compare
    ? `${state.year} compared with ${state.compare} · ${c.kept} kept · ${c.dropped} dropped · ${c.added} added`
    : `${state.year} · ${routes.length} airport pairs · ${fmt(pax)} passengers`;
  $('legend-status').hidden = !state.compare;
  $('legend-service').hidden = Boolean(state.compare);
  $('footnote').textContent = skipped.length ? `${skipped.length} airport${skipped.length === 1 ? '' : 's'} not shown (no coordinates): ${skipped.slice(0, 12).join(', ')}${skipped.length > 12 ? '…' : ''}` : '';
  if (!routes.length && !$('status').textContent) setStatus('No routes at this level in this year.');
  else if (routes.length && $('status').className !== 'warn') setStatus('');
  $('table-link').href = `/airlines/${group}${state.compare ? `?from=${state.compare}&to=${state.year}` : ''}#changes`;
  pushState();
  dirty = true;
}

const label = (r) => `${r.origin} – ${r.dest}`;
const place = (code) => airports.get(code)?.place || '';

function tooltipText(r) {
  const lines = [`${label(r)}`, `${place(r.origin)} – ${place(r.dest)}`];
  if (r.status) lines.push(r.status === 'dropped' ? `Dropped: ${fmt(r.depsThen)} departures in ${state.compare}` : `${fmt(r.depsThen)} → ${fmt(r.depsNow)} departures`);
  else lines.push(`${fmt(r.passengers)} passengers · ${fmt(r.deps)} departures`);
  return lines.join('\n');
}

function showPanel(r) {
  const p = $('panel');
  p.replaceChildren();
  const close = Object.assign(document.createElement('button'), { className: 'close', textContent: '×' });
  close.setAttribute('aria-label', 'Close');
  close.onclick = () => { selected = -1; p.hidden = true; dirty = true; };
  const h = document.createElement('h2');
  h.textContent = label(r);
  const sub = document.createElement('div');
  sub.textContent = `${place(r.origin)} – ${place(r.dest)}${r.status ? ` (${r.status})` : ''}`;
  const dl = document.createElement('dl');
  for (const [k, v] of [['Departures', fmt(r.deps)], ['Seats', fmt(r.seats)], ['Passengers', fmt(r.passengers)], ['Freight (lb)', fmt(r.freight)]]) {
    dl.append(Object.assign(document.createElement('dt'), { textContent: k }), Object.assign(document.createElement('dd'), { textContent: v }));
  }
  const a = Object.assign(document.createElement('a'), { href: `/airports/${r.origin}/${r.dest}`, textContent: 'This route over time →' });
  p.append(close, h, sub, dl, a);
  p.hidden = false;
}

// the two handles are indexes into `years`; the solid one (year) never sits below the hollow one (year-from)
function syncHandles() {
  const from = $('year-from'), to = $('year');
  const lo = years.indexOf(state.compare ?? state.year), hi = years.indexOf(state.year);
  from.value = String(lo);
  to.value = String(hi);
  const span = Math.max(1, years.length - 1);
  const fill = $('range-fill');
  fill.style.left = `calc(8px + (100% - 16px) * ${lo / span})`;
  fill.style.width = `calc((100% - 16px) * ${(hi - lo) / span})`;
}

function bindControls() {
  const from = $('year-from'), slider = $('year');
  for (const el of [from, slider]) { el.max = String(years.length - 1); }
  // moving one handle past the other carries it along; the hollow handle only stays behind when the solid one moves away from it
  const apply = (lo, hi) => {
    state.year = years[hi];
    state.compare = lo < hi ? years[lo] : null;
    load();
  };
  slider.addEventListener('input', () => {
    const hi = Number(slider.value);
    apply(Math.min(years.indexOf(state.compare ?? state.year), hi), hi);
  });
  from.addEventListener('input', () => {
    const lo = Number(from.value);
    apply(lo, Math.max(lo, years.indexOf(state.year)));
  });

  const min = $('min');
  min.value = state.min;
  min.addEventListener('change', () => { state.min = min.value; load(); });

  const proj = $('proj');
  proj.value = state.proj;
  proj.addEventListener('change', () => { state.proj = proj.value === 'flat' ? 'flat' : 'globe'; renderer.setMode(state.proj); pushState(); dirty = true; });
  const width = $('width');
  width.value = state.width;
  width.addEventListener('change', () => { state.width = width.value; pushState(); dirty = true; });

  $('play').addEventListener('click', () => {
    if (playTimer) { clearInterval(playTimer); playTimer = null; $('play').textContent = '▶'; return; }
    $('play').textContent = '⏸';
    // play moves the solid handle on towards the end, keeping the hollow one where it is; from the end, start again from it
    const base = state.compare;
    if (state.year === years.at(-1)) { state.year = base ?? years[0]; state.compare = null; load(); }
    playTimer = setInterval(() => {
      const next = years.indexOf(state.year) + 1;
      if (next >= years.length) { clearInterval(playTimer); playTimer = null; $('play').textContent = '▶'; return; }
      state.year = years[next];
      state.compare = base && base < state.year ? base : null;
      load();
    }, 900);
  });
}

function bindCanvas() {
  attachInteraction(canvas, view, {
    degPerPx: () => renderer.degPerPx(),
    onUserMove: () => { dirty = true; $('tooltip').hidden = true; },
    onReset: () => { Object.assign(view, defaultView(), { rot: initialRot() }); dirty = true; },
    onHover: (x, y) => {
      const i = renderer.hitTest(x, y, routes);
      if (i !== hover) { hover = i; dirty = true; }
      const tip = $('tooltip');
      if (i < 0) { tip.hidden = true; return; }
      tip.textContent = tooltipText(routes[i]);
      tip.style.left = `${x + 14}px`;
      tip.style.top = `${y + 14}px`;
      tip.hidden = false;
    },
    onTap: (x, y) => {
      selected = renderer.hitTest(x, y, routes, 10);
      if (selected >= 0) showPanel(routes[selected]); else $('panel').hidden = true;
      dirty = true;
    },
  });
}

let home = [-96, 38];
const initialRot = () => [-home[0], clamp(-home[1], -70, 70)];

function frame(last, now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  const moving = !view.dragging && (Math.abs(view.vel[0]) > 0.05 || Math.abs(view.vel[1]) > 0.05);
  applyInertia(view, dt);
  if (moving) dirty = true;
  if (dirty && renderer) {
    dirty = false;
    renderer.draw(view, routes, { widthKey: state.width, max: maxOf(routes, state.width), highlight: selected >= 0 ? selected : hover, labels: 0, bothEnds: true });
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
  const [land, airportRes, yearRes] = await Promise.all([loadLand(), fetchRows(queryUrl('airports')), fetchRows(queryUrl('carrier_route_counts', { group, min: 1 }))]);
  airports = indexAirports(airportRes.rows);
  years = yearRes.rows.map((r) => r.year);
  if (!years.length) { $('controls').hidden = true; setStatus('No routes in the data for this airline.'); return; }
  if (!years.includes(state.year)) state.year = years[years.length - 1];
  if (!years.includes(state.compare) || state.compare >= state.year) state.compare = null;
  renderer = new NetworkRenderer(canvas, land);
  renderer.setMode(state.proj);
  applyTheme(themeId);
  const resize = () => { renderer.resize(); dirty = true; };
  window.addEventListener('resize', resize);
  resize();
  bindCanvas();
  bindControls();
  requestAnimationFrame((n) => frame(n, n));
  await load();
  home = centreOf(routes);
  Object.assign(view, { rot: initialRot() });
  dirty = true;
}

main().catch((err) => { console.error(err); setStatus(`Something went wrong: ${err.message}`, true); });
