import { THEMES, DEFAULT_THEME, resolveTheme, themeChoice } from './src/themes.js';
import { setDataLink } from '/static/common/datalink.js';
import { placePopover } from '/static/common/popover.js';
import { defaultView, glide } from './src/camera.js';
import { openingRot, centreRot, fillMapTypeMenu, bindMapKeys, fitRoutes } from './src/maptypes.js';
import { attachInteraction, applyInertia } from './src/interaction.js';
import { parseState, toSearch } from './src/state.js';
import { queryUrl, fetchRows } from './src/api.js';
import { indexAirports, placeRoutes, yearsIn, forYear, forMonth, skippedFor, originProblem } from './src/adapter.js';
import { pickerOptions } from './src/picker.js';
import { createLatest } from './src/latest.js';
import { NetworkRenderer } from './src/renderer.js';
import { maxOf } from './src/scale.js';
import { colourMode, rangeHint, toggleHide, visibleRoutes, styleRoutes, legendItems } from './src/routestyle.js';
import { compareYears, countStatuses, changeText, moveRange, playStep } from './src/compare.js';
import { renderLegend, syncRange } from './src/controls.js';
import { formatCount as fmt, countLabel } from '/static/common/numbers.js';
import { routeFigures } from './src/panel.js';
import { countWord, setDir } from '/static/common/direction.js';

const $ = (id) => document.getElementById(id);
const origin = document.body.dataset.origin || '';
const state = parseState(location.search);
// The info panel sits just below the header, whatever height it ends up.
new ResizeObserver(() => {
  document.documentElement.style.setProperty('--below-header', `${Math.ceil($('header').getBoundingClientRect().bottom) + 8}px`);
}).observe($('header'));

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
function storedTheme() {
  try { return localStorage.getItem('t100-theme'); } catch (e) { return null; }
}
let themeId = resolveTheme(location.search, storedTheme(), matchMedia('(prefers-color-scheme: dark)').matches);
let themeChosen = themeChoice(location.search, storedTheme()); // 'auto' stays out of the URL
let dirty = true;
let hover = -1;
let selected = -1;
let playTimer = null;
const view = defaultView();
// what the map is centred on: the airport, once its coordinates are known (until then the default view's middle)
let home = [-view.rot[0], -view.rot[1]];

const canvas = $('globe');
let renderer;

function setStatus(text, warn = false) {
  const el = $('status');
  el.textContent = text;
  el.className = warn ? 'warn' : '';
}

// the page chrome is themed by the shared header (static/nav/main.js); the canvas follows its choice
function applyTheme(id) {
  themeId = THEMES[id] ? id : DEFAULT_THEME;
  if (renderer) renderer.setTheme(THEMES[themeId]);
  dirty = true;
}
document.addEventListener('t100:theme', (e) => { themeChosen = e.detail.choice; applyTheme(e.detail.id); drawLegend(); pushState(); });

// routes (placed or raw) of the years strictly between the two being compared; none when not comparing
const inBetween = (routes) => (state.compare ? routes.filter((r) => r.year > state.compare && r.year < state.year) : []);

function recompute() {
  if (state.year === null) { periodRoutes = []; shown = []; return; }
  periodRoutes = state.month !== null
    ? compareYears(forMonth(monthRoutes, state.month), null, destKey)
    : compareYears(forYear(yearRoutes, state.year), state.compare ? forYear(yearRoutes, state.compare) : null, destKey, inBetween(yearRoutes));
  shown = visibleRoutes(periodRoutes, state.hide, Boolean(state.compare), colourMode(state.colour, Boolean(state.compare)));
}

function pushState() {
  const extra = themeChosen === 'auto' ? {} : { theme: themeChosen };
  history.replaceState(null, '', `${location.pathname}${toSearch(state, extra)}`);
}

function updateStats() {
  const comparing = Boolean(state.compare);
  const pax = shown.reduce((s, r) => s + (r.status === 'dropped' ? 0 : Number(r.passengers || 0)), 0);
  const deps = shown.reduce((s, r) => s + (r.status === 'dropped' ? 0 : Number(r.deps || 0)), 0);
  const label = state.month !== null ? `${state.year}-${String(state.month).padStart(2, '0')}` : comparing ? `${state.compare} → ${state.year}` : `${state.year}`;
  const c = countStatuses(periodRoutes);
  const places = document.body.dataset.foreign ? 'US destinations' : 'destinations';
  // in one colour, comparing is every destination flown across the years, so a plain total
  $('stats').textContent = comparing && colourMode(state.colour, comparing) === 'single' ? `${label} · ${shown.length} ${places}`
    : comparing ? `${state.year} compared with ${state.compare} · ${c.kept} kept · ${c.dropped} dropped · ${c.added} added${c.between ? ` · ${c.between} added then dropped` : ''}`
    : `${label} · ${shown.length} ${places} · ${countLabel(deps)} ${countWord(state.dir).toLowerCase()} · ${countLabel(pax)} passengers`;
  $('year-label').textContent = label;
  const periodRows = state.month !== null
    ? monthRaw.filter((r) => r.month === state.month)
    : [...yearRaw.filter((r) => r.year === state.year || r.year === state.compare), ...inBetween(yearRaw)];
  const skipped = skippedFor(periodRows.filter((r) => !state.hide.includes(r.service)), airports);
  const notes = [];
  if (skipped.length) notes.push(`${skipped.length} destination${skipped.length === 1 ? '' : 's'} not shown (no coordinates): ${skipped.slice(0, 12).join(', ')}${skipped.length > 12 ? '…' : ''}`);
  $('footnote').textContent = notes.join(' · ');
  if (loadError) setStatus(loadError, true);
  else if (truncated) setStatus('Too many rows: some routes are missing from this view.', true);
  else if (!periodRoutes.length) setStatus(`No flights ${{ '': 'to or from', out: 'from', in: 'to' }[state.dir]} this airport in this period.`);
  else if (!shown.length) setStatus('Every route here is hidden: click a legend entry to show it again.');
  else setStatus('');
}

function tooltipText(r) {
  const change = changeText(r, state.compare);
  return `${r.dest} · ${r.destCity || ''}\n${change || `${fmt(r.passengers)} passengers · ${fmt(r.deps)} ${countWord(state.dir).toLowerCase()}`}\n${r.service}`;
}

function showPanel(r) {
  const p = $('panel');
  const routePath = `/airports/${encodeURIComponent(origin)}/${encodeURIComponent(r.dest)}`;
  const keepDir = state.dir ? `?dir=${state.dir}` : ''; // departing here is the route's out, arriving its in
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
  h.append(`${origin} ${{ '': '↔', out: '→', in: '←' }[state.dir]} `, destLink);
  const sub = document.createElement('div');
  // a route added then dropped shows its busiest year, so the figures and the month-by-month link are that year's
  const figuresYear = r.status === 'between' ? r.peakYear : state.year;
  const status = r.status === 'between' ? `added then dropped, figures for ${figuresYear}` : r.status;
  sub.textContent = `${r.destCity || ''} (${r.service}${status ? `, ${status}` : ''})`;
  const dl = document.createElement('dl');
  // the month rows have no distance; the pair's yearly rows do
  const distance = r.distance ?? yearRaw.find((y) => y.dest === r.dest)?.distance;
  for (const f of routeFigures({ ...r, distance }, state.dir)) {
    const dd = Object.assign(document.createElement('dd'), { title: f.title, textContent: f.shown });
    dl.append(Object.assign(document.createElement('dt'), { textContent: f.label }), dd);
  }
  const a1 = document.createElement('a');
  a1.href = `${routePath}${keepDir}`;
  a1.textContent = 'This route over time →';
  const a2 = document.createElement('a');
  a2.href = `${routePath}/${figuresYear}${keepDir}`;
  a2.textContent = `Month by month in ${figuresYear} →`;
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
    const res = await fetchRows(queryUrl('routes_by_month', { origin, year: state.year, dir: state.dir }));
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

// the legend's chips, coloured for the current theme
function drawLegend() {
  const comparing = Boolean(state.compare);
  const mode = colourMode(state.colour, comparing);
  renderLegend($('legend-chips'), legendItems({ mode, comparing, hide: state.hide, routes: periodRoutes, dark: THEMES[themeId].dark }), (key) => { state.hide = toggleHide(state.hide, key); refresh(); });
}

function refresh() {
  setDataLink('routes_by_year', { origin, min_deps: '', dir: state.dir });
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
  $('range-hint').textContent = rangeHint(mode);
  drawLegend();
  if (years.length) syncRange(range, years, state.year, state.compare);
  updateStats();
  // the views line's Changes page, between the same two years
  const changes = $('changes-link');
  if (changes) changes.href = `${new URL(changes.href).pathname}${state.compare ? `?from=${state.compare}&to=${state.year}` : ''}`;
  pushState();
  dirty = true;
}

function fillPicker() {
  const list = $('airport-list');
  for (const { value, label } of pickerOptions(airports.values())) list.append(Object.assign(document.createElement('option'), { value, label }));
  $('picker').value = origin;
  $('picker').addEventListener('change', (e) => {
    const code = e.target.value.trim().toUpperCase();
    if (/^[A-Z0-9]{3}$/.test(code)) location.href = `/airports/${code}/globe${toSearch(state)}`;
  });
}

// a new map type opens afresh on the airport: the azimuthal map is centred on it, so its distances and directions are true
function setProj(p) {
  state.proj = p;
  $('proj').value = p;
  renderer.setMode(p);
  Object.assign(view, { rot: openingRot(p, home), zoom: 1, vel: [0, 0], target: null });
  pushState();
  dirty = true;
}

// ← → step the year (in the month view, the month), as the sliders do; space plays; 1–3 pick the map type
function stepPeriod(by) {
  const el = state.month !== null ? $('month') : range.to;
  const v = Number(el.value) + by;
  if (v < Number(el.min) || v > Number(el.max)) return;
  el.value = String(v);
  el.dispatchEvent(new Event('input'));
}

function bindControls() {
  const proj = $('proj');
  fillMapTypeMenu(proj, state.proj, `Centred on ${origin}, so distances and directions from it are true`);
  proj.addEventListener('change', () => setProj(proj.value));
  const width = $('width');
  width.value = state.width;
  width.addEventListener('change', () => { state.width = width.value; pushState(); dirty = true; });
  $('dir')?.addEventListener('change', (e) => setDir(e.target.value)); // only an airport's map has one; a new direction reloads
  $('colour').addEventListener('change', () => { state.colour = $('colour').value; refresh(); });
  $('centre').addEventListener('click', () => { view.vel = [0, 0]; view.target = { rot: centreRot(state.proj, home), zoom: view.zoom }; });
  // the azimuthal map keeps the airport in the middle and only zooms; the others move their middle too
  $('fit').addEventListener('click', () => {
    const fit = fitRoutes(renderer, [home, ...shown.map((r) => r.to)], { keepCentre: state.proj === 'azimuthal' });
    if (fit) { view.vel = [0, 0]; view.target = fit; }
  });
  bindMapKeys({ step: stepPeriod, play: () => $('play').click(), mapType: setProj });

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
    onReset: () => { Object.assign(view, defaultView(), { rot: openingRot(state.proj, home) }); dirty = true; },
    onHover: (x, y) => {
      const routes = shown;
      const i = renderer.hitTest(x, y, routes);
      if (i !== hover) { hover = i; dirty = true; }
      const tip = $('tooltip');
      if (i < 0) { tip.hidden = true; return; }
      tip.textContent = tooltipText(routes[i]);
      placePopover(tip, x, y, { dx: 14, dy: 14 });
    },
    onTap: (x, y) => {
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
  if (glide(view, dt) || moving) dirty = true;
  if (dirty && renderer) {
    dirty = false;
    const routes = shown;
    const key = $('width').value;
    const a = airports.get(origin);
    renderer.draw(view, routes, {
      origin: a ? { lon: a.lon, lat: a.lat, code: origin } : null,
      widthKey: key,
      max: maxOf(routes, key),
      highlight: selected >= 0 ? selected : hover,
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
  renderer.panFlat = true;
  renderer.setMode(state.proj);
  view.rot = openingRot(state.proj, home);
  applyTheme(themeId);
  const resize = () => { renderer.resize(); dirty = true; };
  window.addEventListener('resize', resize);
  resize();
  fillPicker();
  bindCanvas();
  requestAnimationFrame((n) => frame(n, n));

  const a = airports.get(origin);
  const res = await fetchRows(queryUrl('routes_by_year', { origin, dir: state.dir }));
  truncated = res.truncated;
  const problem = originProblem(res.rows, airports, origin);
  if (problem) {
    $('controls').classList.add('bare');
    setStatus(problem === 'no-data' ? `No flights from ${origin} in the data.` : `No coordinates for ${origin}, so it can't be drawn.`);
    return;
  }
  yearRaw = res.rows;
  yearRoutes = placeRoutes(res.rows, origin, airports).routes;
  years = yearsIn(res.rows);
  if (state.year === null || !years.includes(state.year)) state.year = years[years.length - 1];
  if (!years.includes(state.compare) || state.compare >= state.year || state.month !== null) state.compare = null;
  if (state.month !== null) await loadMonths();
  if (a) { home = [a.lon, a.lat]; view.rot = openingRot(state.proj, home); }
  bindControls();
  refresh();
}

main().catch((err) => { console.error(err); setStatus(`Something went wrong: ${err.message}`, true); });
