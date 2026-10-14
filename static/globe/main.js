import { THEMES, THEME_ORDER, resolveTheme } from './src/themes.js';
import { defaultView, clamp } from './src/camera.js';
import { attachInteraction, applyInertia } from './src/interaction.js';
import { parseState, toSearch } from './src/state.js';
import { queryUrl, fetchRows } from './src/api.js';
import { indexAirports, placeRoutes, placePoints, yearsIn, forYear, forMonth, forService, skippedFor, originProblem } from './src/adapter.js';
import { createLatest } from './src/latest.js';
import { NetworkRenderer } from './src/renderer.js';
import { maxOf } from './src/scale.js';

const $ = (id) => document.getElementById(id);
const origin = document.body.dataset.origin || '';
const state = parseState(location.search);
const fmt = (n) => Number(n || 0).toLocaleString('en-US');

let airports = new Map();
let yearRoutes = [];     // placed routes, all years
let monthRoutes = [];    // placed routes for the selected year, all months
let years = [];
let yearRaw = [];        // raw routes_by_year rows
let monthRaw = [];       // raw routes_by_month rows for the selected year
let truncated = false;
let loadError = '';
const monthSeq = createLatest();
let themeId = resolveTheme(location.search, localStorage.getItem('t100-theme'));
let dirty = true;
let hover = -1;
let chooserPoints = []; // airport dots on the chooser page (no origin selected)
let selected = -1;
let playTimer = null;
const view = defaultView();

const canvas = $('globe');
let renderer;

function setStatus(text, warn = false) {
  const el = $('status');
  el.textContent = text;
  el.className = warn ? 'warn' : '';
}

function applyTheme(id) {
  themeId = THEMES[id] ? id : 'paper';
  const t = THEMES[themeId];
  const root = document.documentElement.style;
  root.setProperty('--bg', t.bg);
  root.setProperty('--fg', t.ui.fg);
  root.setProperty('--muted', t.ui.muted);
  root.setProperty('--panel', t.ui.panel);
  root.setProperty('--accent', t.ui.accent);
  if (renderer) renderer.setTheme(t);
  try { localStorage.setItem('t100-theme', themeId); } catch (e) { /* storage may be unavailable */ }
  dirty = true;
}

function currentRoutes() {
  if (state.year === null) return [];
  const routes = state.month !== null ? forMonth(monthRoutes, state.month) : forYear(yearRoutes, state.year);
  return forService(routes, state.service);
}

function pushState() {
  const extra = themeId === 'paper' ? {} : { theme: themeId };
  history.replaceState(null, '', `${location.pathname}${toSearch(state, extra)}`);
}

function updateStats() {
  const routes = currentRoutes();
  const pax = routes.reduce((s, r) => s + Number(r.passengers || 0), 0);
  const deps = routes.reduce((s, r) => s + Number(r.deps || 0), 0);
  const label = state.month !== null ? `${state.year}-${String(state.month).padStart(2, '0')}` : `${state.year}`;
  $('stats').textContent = `${label} · ${routes.length} destinations · ${fmt(deps)} departures · ${fmt(pax)} passengers`;
  $('year-label').textContent = label;
  const periodRows = state.month !== null ? monthRaw.filter((r) => r.month === state.month) : yearRaw.filter((r) => r.year === state.year);
  const skipped = skippedFor(forService(periodRows, state.service), airports);
  const notes = [];
  if (skipped.length) notes.push(`${skipped.length} destination${skipped.length === 1 ? '' : 's'} not shown (no coordinates): ${skipped.slice(0, 12).join(', ')}${skipped.length > 12 ? '…' : ''}`);
  $('footnote').textContent = notes.join(' · ');
  if (loadError) setStatus(loadError, true);
  else if (truncated) setStatus('Too many rows: some routes are missing from this view.', true);
  else if (!routes.length) setStatus('No flights from this airport in this period.');
  else setStatus('');
}

function tooltipText(r) {
  return `${r.dest} · ${r.destCity || ''}\n${fmt(r.passengers)} passengers · ${fmt(r.deps)} departures\n${r.service}`;
}

function showPanel(r) {
  const p = $('panel');
  const routePath = `/route/${encodeURIComponent(origin)}/${encodeURIComponent(r.dest)}`;
  p.innerHTML = '';
  const close = document.createElement('button');
  close.className = 'close';
  close.textContent = '×';
  close.setAttribute('aria-label', 'Close');
  close.onclick = () => { selected = -1; p.hidden = true; dirty = true; };
  const h = document.createElement('h2');
  const destLink = document.createElement('a');
  destLink.href = `/globe/${encodeURIComponent(r.dest)}${toSearch(state)}`;
  destLink.textContent = r.dest;
  destLink.title = `Show routes from ${r.dest}`;
  h.append(`${origin} → `, destLink);
  const sub = document.createElement('div');
  sub.textContent = `${r.destCity || ''} (${r.service})`;
  const dl = document.createElement('dl');
  for (const [k, v] of [['Departures', fmt(r.deps)], ['Seats', fmt(r.seats)], ['Passengers', fmt(r.passengers)], ['Freight (lb)', fmt(r.freight)]]) {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    dl.append(dt, dd);
  }
  const a1 = document.createElement('a');
  a1.href = routePath;
  a1.textContent = 'This route over time →';
  const a2 = document.createElement('a');
  a2.href = `${routePath}/${state.year}`;
  a2.textContent = `Month by month in ${state.year} →`;
  p.append(close, h, sub, dl, a1, a2);
  p.hidden = false;
}

// true: fresh month data applied; false: a newer request superseded this one; 'failed': fetch error (reported in the status line)
async function loadMonths() {
  const id = monthSeq.next();
  monthRoutes = [];
  monthRaw = [];
  setStatus('Loading months…');
  try {
    const res = await fetchRows(queryUrl('routes_by_month', { origin, year: state.year }));
    if (!monthSeq.isCurrent(id)) return false;
    truncated = res.truncated;
    monthRaw = res.rows;
    monthRoutes = placeRoutes(res.rows, origin, airports).routes;
    loadError = '';
    return true;
  } catch (err) {
    if (!monthSeq.isCurrent(id)) return false;
    console.error(err);
    state.month = null;
    $('month-toggle').checked = false;
    loadError = `Could not load months: ${err.message}`;
    return 'failed';
  }
}

function refresh() {
  hover = -1;
  selected = -1;
  $('panel').hidden = true;
  $('tooltip').hidden = true;
  $('month').hidden = state.month === null;
  updateStats();
  pushState();
  dirty = true;
}

function fillPicker() {
  const list = $('airport-list');
  for (const a of airports.values()) {
    if (!a.isUs) continue;
    const o = document.createElement('option');
    o.value = a.code;
    o.label = `${a.place} – ${a.name}`;
    list.append(o);
  }
  $('picker').value = origin;
  $('picker').addEventListener('change', (e) => {
    const code = e.target.value.trim().toUpperCase();
    if (/^[A-Z0-9]{3}$/.test(code)) location.href = `/globe/${code}${toSearch(state)}`;
  });
}

async function showChooser() {
  const res = await fetchRows(queryUrl('top_us_airports', { year: '', sort_column: '' }));
  const box = $('chooser');
  box.append(Object.assign(document.createElement('summary'), { textContent: 'Pick an airport on the map, or choose from a list' }));
  for (const r of res.rows.slice(0, 24)) {
    const a = document.createElement('a');
    a.href = `/globe/${r.origin}`;
    a.textContent = `${r.origin} ${r.origin_city_name}`;
    box.append(a);
  }
  box.hidden = false;
  $('title').textContent = 'US airport network';
  chooserPoints = placePoints(res.rows, airports);
  dirty = true;
}

function bindControls() {
  const proj = $('proj');
  proj.value = state.proj;
  proj.addEventListener('change', () => {
    state.proj = proj.value === 'flat' ? 'flat' : 'globe';
    renderer.setMode(state.proj);
    pushState();
    dirty = true;
  });
  const tsel = $('theme');
  for (const id of THEME_ORDER) {
    const o = document.createElement('option');
    o.value = id; o.textContent = THEMES[id].label;
    tsel.append(o);
  }
  tsel.value = themeId;
  tsel.addEventListener('change', () => { applyTheme(tsel.value); pushState(); });
  const service = $('service');
  service.value = state.service;
  service.addEventListener('change', () => { state.service = service.value; hover = -1; selected = -1; $('panel').hidden = true; updateStats(); pushState(); dirty = true; });
  const width = $('width');
  width.value = state.width;
  width.addEventListener('change', () => { state.width = width.value; pushState(); dirty = true; });

  const slider = $('year');
  slider.min = '0';
  slider.max = String(years.length - 1);
  slider.value = String(years.indexOf(state.year));
  slider.addEventListener('input', async () => {
    state.year = years[Number(slider.value)];
    if (state.month !== null && (await loadMonths()) === false) return;
    refresh();
  });

  $('play').addEventListener('click', () => {
    if (playTimer) { clearInterval(playTimer); playTimer = null; $('play').textContent = '▶'; return; }
    $('play').textContent = '⏸';
    if (slider.value === slider.max) slider.value = '0';
    playTimer = setInterval(() => {
      if (Number(slider.value) >= years.length - 1) { clearInterval(playTimer); playTimer = null; $('play').textContent = '▶'; return; }
      slider.value = String(Number(slider.value) + 1);
      state.year = years[Number(slider.value)];
      state.month = null;
      $('month-toggle').checked = false;
      refresh();
    }, 700);
  });

  const toggle = $('month-toggle');
  toggle.checked = state.month !== null;
  toggle.addEventListener('change', async () => {
    if (toggle.checked) {
      state.month = state.month ?? 1;
      $('month').value = String(state.month);
      if ((await loadMonths()) === false) return;
    } else {
      state.month = null;
    }
    refresh();
  });
  $('month').addEventListener('input', () => { state.month = Number($('month').value); refresh(); });
}

function bindCanvas() {
  const hooks = {
    degPerPx: () => renderer.degPerPx(),
    onUserMove: () => { dirty = true; $('tooltip').hidden = true; },
    onReset: () => { Object.assign(view, defaultView()); dirty = true; },
    onHover: (x, y) => {
      if (!origin) {
        const i = renderer.hitTestPoints(x, y, chooserPoints);
        if (i !== hover) { hover = i; dirty = true; }
        canvas.style.cursor = i >= 0 ? 'pointer' : '';
        const tip = $('tooltip');
        if (i < 0) { tip.hidden = true; return; }
        tip.textContent = `${chooserPoints[i].code} · ${chooserPoints[i].city}`;
        tip.style.left = `${x + 14}px`;
        tip.style.top = `${y + 14}px`;
        tip.hidden = false;
        return;
      }
      const routes = currentRoutes();
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
      if (!origin) {
        const i = renderer.hitTestPoints(x, y, chooserPoints);
        if (i >= 0) location.href = `/globe/${encodeURIComponent(chooserPoints[i].code)}${toSearch(state)}`;
        return;
      }
      const routes = currentRoutes();
      const i = renderer.hitTest(x, y, routes, 10);
      selected = i;
      if (i >= 0) showPanel(routes[i]); else $('panel').hidden = true;
      dirty = true;
    },
  };
  attachInteraction(canvas, view, hooks);
}

function frame(last, now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  const moving = !view.dragging && (Math.abs(view.vel[0]) > 0.05 || Math.abs(view.vel[1]) > 0.05);
  applyInertia(view, dt);
  if (moving) dirty = true;
  if (dirty && renderer) {
    dirty = false;
    const routes = currentRoutes();
    const key = $('width').value;
    const a = airports.get(origin);
    renderer.draw(view, routes, {
      points: origin ? null : chooserPoints,
      highlightPoint: origin ? -1 : hover,
      origin: a ? { lon: a.lon, lat: a.lat, code: origin } : null,
      widthKey: key,
      max: maxOf(routes, key),
      highlight: selected >= 0 ? selected : hover,
      labels: 8,
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
  renderer.setMode(state.proj);
  applyTheme(themeId);
  const resize = () => { renderer.resize(); dirty = true; };
  window.addEventListener('resize', resize);
  resize();
  fillPicker();
  bindCanvas();
  requestAnimationFrame((n) => frame(n, n));

  if (!origin) { setStatus(''); $('controls').hidden = true; await showChooser(); return; }

  const a = airports.get(origin);
  $('title').textContent = a ? `${origin} · ${a.place}` : origin;
  const res = await fetchRows(queryUrl('routes_by_year', { origin }));
  truncated = res.truncated;
  const problem = originProblem(res.rows, airports, origin);
  if (problem) {
    $('controls').hidden = true;
    setStatus(problem === 'no-data' ? `No flights from ${origin} in the data.` : `No coordinates for ${origin}, so it can't be drawn.`);
    return;
  }
  yearRaw = res.rows;
  yearRoutes = placeRoutes(res.rows, origin, airports).routes;
  years = yearsIn(res.rows);
  if (state.year === null || !years.includes(state.year)) state.year = years[years.length - 1];
  if (state.month !== null) await loadMonths();
  if (a) view.rot = [-a.lon, clamp(-a.lat, -70, 70)];
  bindControls();
  refresh();
}

main().catch((err) => { console.error(err); setStatus(`Something went wrong: ${err.message}`, true); });
