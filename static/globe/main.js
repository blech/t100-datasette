import { THEMES, resolveTheme } from './src/themes.js';
import { defaultView, clamp } from './src/camera.js';
import { attachInteraction, applyInertia } from './src/interaction.js';
import { parseState, toSearch } from './src/state.js';
import { queryUrl, fetchRows } from './src/api.js';
import { indexAirports, placeRoutes, placePoints, yearsIn, forYear, forMonth, skippedFor, originProblem } from './src/adapter.js';
import { createLatest } from './src/latest.js';
import { NetworkRenderer } from './src/renderer.js';
import { maxOf } from './src/scale.js';
import { colourMode, toggleHide, visibleRoutes, styleRoutes, legendItems } from './src/routestyle.js';
import { compareYears, countStatuses, changeText, moveRange, playStep } from './src/compare.js';
import { renderLegend, syncRange } from './src/controls.js';
import { routesByOrigin, chooserTap } from './src/chooser.js';

const $ = (id) => document.getElementById(id);
const origin = document.body.dataset.origin || '';
const state = parseState(location.search);
// The chooser and info panel sit just below the header, whatever height it ends up.
new ResizeObserver(() => {
  document.documentElement.style.setProperty('--below-header', `${Math.ceil($('header').getBoundingClientRect().bottom) + 8}px`);
}).observe($('header'));
const fmt = (n) => Number(n || 0).toLocaleString('en-US');

let airports = new Map();
let yearRoutes = [];     // placed routes, all years
let monthRoutes = [];    // placed routes for the selected year, all months
let years = [];
let yearRaw = [];        // raw routes_by_year rows
let monthRaw = [];       // raw routes_by_month rows for the selected year
let periodRoutes = [];   // the period on screen, with kept/added/dropped when comparing
let shown = [];          // periodRoutes after the legend's filters: what is drawn and hit-tested
const range = { from: $('year-from'), to: $('year'), fill: $('range-fill') };
const destKey = (r) => r.dest;
let truncated = false;
let loadError = '';
const monthSeq = createLatest();
let themeId = resolveTheme(location.search, localStorage.getItem('t100-theme'), matchMedia('(prefers-color-scheme: dark)').matches);
let dirty = true;
let hover = -1;
let chooserPoints = []; // airport dots on the chooser page (no origin selected)
let chooserRoutes = new Map(); // the latest year's domestic routes by origin, for the hovered dot
const chooserPlaced = new Map(); // ...placed on the map, filled as dots are hovered
const latestYear = document.body.dataset.maxYear;
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

// the page chrome is themed by the shared header (static/nav/main.js); the canvas follows its choice
function applyTheme(id) {
  themeId = THEMES[id] ? id : 'paper';
  if (renderer) renderer.setTheme(THEMES[themeId]);
  dirty = true;
}
document.addEventListener('t100:theme', (e) => { applyTheme(e.detail.id); pushState(); });

function recompute() {
  if (state.year === null) { periodRoutes = []; shown = []; return; }
  periodRoutes = state.month !== null
    ? compareYears(forMonth(monthRoutes, state.month), null, destKey)
    : compareYears(forYear(yearRoutes, state.year), state.compare ? forYear(yearRoutes, state.compare) : null, destKey);
  shown = visibleRoutes(periodRoutes, state.hide, Boolean(state.compare));
}

function pushState() {
  const extra = themeId === 'paper' ? {} : { theme: themeId };
  history.replaceState(null, '', `${location.pathname}${toSearch(state, extra)}`);
}

function updateStats() {
  const comparing = Boolean(state.compare);
  const pax = shown.reduce((s, r) => s + (r.status === 'dropped' ? 0 : Number(r.passengers || 0)), 0);
  const deps = shown.reduce((s, r) => s + (r.status === 'dropped' ? 0 : Number(r.deps || 0)), 0);
  const label = state.month !== null ? `${state.year}-${String(state.month).padStart(2, '0')}` : comparing ? `${state.compare} → ${state.year}` : `${state.year}`;
  const c = countStatuses(periodRoutes);
  $('stats').textContent = comparing
    ? `${state.year} compared with ${state.compare} · ${c.kept} kept · ${c.dropped} dropped · ${c.added} added`
    : `${label} · ${shown.length} ${document.body.dataset.foreign ? 'US destinations' : 'destinations'} · ${fmt(deps)} departures · ${fmt(pax)} passengers`;
  $('year-label').textContent = label;
  const periodRows = state.month !== null
    ? monthRaw.filter((r) => r.month === state.month)
    : yearRaw.filter((r) => r.year === state.year || r.year === state.compare);
  const skipped = skippedFor(periodRows.filter((r) => !state.hide.includes(r.service)), airports);
  const notes = [];
  if (skipped.length) notes.push(`${skipped.length} destination${skipped.length === 1 ? '' : 's'} not shown (no coordinates): ${skipped.slice(0, 12).join(', ')}${skipped.length > 12 ? '…' : ''}`);
  $('footnote').textContent = notes.join(' · ');
  if (loadError) setStatus(loadError, true);
  else if (truncated) setStatus('Too many rows: some routes are missing from this view.', true);
  else if (!periodRoutes.length) setStatus('No flights from this airport in this period.');
  else if (!shown.length) setStatus('Every route here is hidden: click a legend entry to show it again.');
  else setStatus('');
}

function tooltipText(r) {
  const change = changeText(r, state.compare);
  return `${r.dest} · ${r.destCity || ''}\n${change || `${fmt(r.passengers)} passengers · ${fmt(r.deps)} departures`}\n${r.service}`;
}

function showPanel(r) {
  const p = $('panel');
  const routePath = `/airports/${encodeURIComponent(origin)}/${encodeURIComponent(r.dest)}`;
  p.innerHTML = '';
  const close = document.createElement('button');
  close.className = 'close';
  close.textContent = '×';
  close.setAttribute('aria-label', 'Close');
  close.onclick = () => { selected = -1; p.hidden = true; dirty = true; };
  const h = document.createElement('h2');
  const destLink = document.createElement('a');
  destLink.href = `/airports/${encodeURIComponent(r.dest)}/globe${toSearch(state)}`;
  destLink.textContent = r.dest;
  destLink.title = `Show routes from ${r.dest}`;
  h.append(`${origin} → `, destLink);
  const sub = document.createElement('div');
  sub.textContent = `${r.destCity || ''} (${r.service}${r.status ? `, ${r.status}` : ''})`;
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
  recompute();
  const comparing = Boolean(state.compare);
  const mode = colourMode(state.colour, comparing);
  $('colour').value = mode;
  $('colour').querySelector('option[value="change"]').disabled = !comparing;
  renderLegend($('legend-chips'), legendItems({ mode, comparing, hide: state.hide, routes: periodRoutes }), (key) => { state.hide = toggleHide(state.hide, key); refresh(); });
  if (years.length) syncRange(range, years, state.year, state.compare);
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
    if (/^[A-Z0-9]{3}$/.test(code)) location.href = `/airports/${code}/globe${toSearch(state)}`;
  });
}

async function showChooser() {
  const res = await fetchRows(queryUrl('top_us_airports', { year: '', sort_column: '' }));
  const box = $('chooser');
  box.append(Object.assign(document.createElement('summary'), { textContent: 'Pick an airport on the map, or choose from a list' }));
  for (const r of res.rows.slice(0, 24)) {
    const a = document.createElement('a');
    a.href = `/airports/${r.origin}/globe`;
    a.textContent = `${r.origin} ${r.origin_city_name}`;
    box.append(a);
  }
  box.hidden = false;
  $('title').textContent = 'US airport network';
  chooserPoints = placePoints(res.rows, airports);
  dirty = true;
  // without these the dots still work; hovering just shows no routes
  try {
    chooserRoutes = routesByOrigin((await fetchRows(queryUrl('domestic_routes', { year: latestYear, _size: 'max' }))).rows);
  } catch (e) {
    console.error(e);
  }
  dirty = true;
}

// the hovered dot's domestic routes, as its own map draws them with international hidden
function chooserRoutesFor(i) {
  if (i < 0) return [];
  const code = chooserPoints[i].code;
  if (!chooserPlaced.has(code)) chooserPlaced.set(code, placeRoutes(chooserRoutes.get(code) || [], code, airports).routes);
  return chooserPlaced.get(code);
}

function showChooserTip(i, x, y) {
  const tip = $('tooltip');
  if (i < 0) { tip.hidden = true; return; }
  const p = chooserPoints[i];
  const n = chooserRoutesFor(i).length; // the routes drawn: a destination without coordinates can't be
  tip.textContent = chooserRoutes.size ? `${p.code} · ${p.city} · ${n} domestic route${n === 1 ? '' : 's'} in ${latestYear}` : `${p.code} · ${p.city}`;
  tip.style.left = `${x + 14}px`;
  tip.style.top = `${y + 14}px`;
  tip.hidden = false;
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
  const width = $('width');
  width.value = state.width;
  width.addEventListener('change', () => { state.width = width.value; pushState(); dirty = true; });
  $('colour').addEventListener('change', () => { state.colour = $('colour').value; refresh(); });

  for (const el of [range.from, range.to]) { el.min = '0'; el.max = String(years.length - 1); }
  const move = (which, el) => async () => {
    Object.assign(state, moveRange(years, state, which, Number(el.value)));
    $('month-toggle').checked = state.month !== null;
    if (state.month !== null && (await loadMonths()) === false) return;
    refresh();
  };
  range.to.addEventListener('input', move('year', range.to));
  range.from.addEventListener('input', move('compare', range.from));

  $('play').addEventListener('click', () => {
    if (playTimer) { clearInterval(playTimer); playTimer = null; $('play').textContent = '▶'; return; }
    $('play').textContent = '⏸';
    state.month = null;
    $('month-toggle').checked = false;
    // play moves the solid handle on, keeping the hollow one where it is; from the end, start again from it
    const base = state.compare;
    if (state.year === years.at(-1)) { state.year = base ?? years[0]; state.compare = null; refresh(); }
    playTimer = setInterval(() => {
      const step = playStep(years, state.year, base);
      if (!step) { clearInterval(playTimer); playTimer = null; $('play').textContent = '▶'; return; }
      Object.assign(state, step);
      refresh();
    }, 700);
  });

  const toggle = $('month-toggle');
  toggle.checked = state.month !== null;
  toggle.addEventListener('change', async () => {
    // play steps through whole years, so a month view stops it
    if (playTimer) { clearInterval(playTimer); playTimer = null; $('play').textContent = '▶'; }
    if (toggle.checked) {
      state.compare = null;
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
        showChooserTip(i, x, y);
        return;
      }
      const routes = shown;
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
        const action = chooserTap(hover, i);
        if (action === 'open') { location.href = `/airports/${encodeURIComponent(chooserPoints[i].code)}/globe${toSearch(state)}`; return; }
        hover = action === 'show' ? i : -1;
        showChooserTip(hover, x, y);
        dirty = true;
        return;
      }
      const routes = shown;
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
    const routes = origin ? shown : chooserRoutesFor(hover);
    const key = $('width').value;
    // on the chooser the hovered airport is drawn as its own map draws it, routes and all
    const code = origin || (hover >= 0 ? chooserPoints[hover].code : '');
    const a = airports.get(code);
    renderer.draw(view, routes, {
      points: origin ? null : chooserPoints,
      highlightPoint: origin || a ? -1 : hover,
      origin: a ? { lon: a.lon, lat: a.lat, code } : null,
      widthKey: key,
      max: maxOf(routes, key),
      highlight: origin ? (selected >= 0 ? selected : hover) : -1,
      labels: 8,
      styles: styleRoutes(routes, { mode: colourMode(state.colour, Boolean(state.compare)), theme: THEMES[themeId], widthKey: key }),
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
  if (!years.includes(state.compare) || state.compare >= state.year || state.month !== null) state.compare = null;
  if (state.month !== null) await loadMonths();
  if (a) view.rot = [-a.lon, clamp(-a.lat, -70, 70)];
  bindControls();
  refresh();
}

main().catch((err) => { console.error(err); setStatus(`Something went wrong: ${err.message}`, true); });
