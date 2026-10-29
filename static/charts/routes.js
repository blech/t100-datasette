import * as Plot from '/static/charts/vendor/plot.js';
import { useLabelTips, attachLabelTips } from '/static/charts/labeltips.js';
import { setDataLink } from '/static/common/datalink.js';
import { buildMatrix, buildCityMatrix, disclosureArrows, ARROW_SLOT, matrixMeasures, FLOWN, labelMargin, textWidth, pointerReach, placeKey } from '/static/charts/src/matrix.js';
import { airportTip, groupTip } from '/static/charts/src/labels.js';
import { queryUrl, fetchRows } from '/static/globe/src/api.js';
import { attachPopover } from '/static/common/popover.js';
import { formatCount, millionsAxis } from '/static/common/numbers.js';
import { replaceSearch } from '/static/nav/src/state.js';
import { parseDir, setDir } from '/static/common/direction.js';

const origin = document.body.dataset.origin;
const dir = parseDir(location.search);
const MATRIX_MEASURES = matrixMeasures(dir);
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const pick = (key, allowed, fallback) => (allowed.includes(params.get(key)) ? params.get(key) : fallback);
const state = {
  measure: pick('measure', Object.keys(MATRIX_MEASURES), 'passengers'),
  service: pick('service', ['all', 'domestic', 'international'], 'all'),
  n: Number(pick('n', ['10', '25', '50'], '25')),
  group: pick('group', ['airport', 'city'], 'airport'),
  rank: pick('rank', ['all', 'latest'], 'all'),
  flown: pick('flown', FLOWN, 'ever'),
  scale: pick('scale', ['absolute', 'year', 'busiest'], 'absolute'),
  open: (params.get('open') || '').split(',').filter(Boolean),
};
let rows = [];
let cities = new Map();
let airportInfo = new Map();

const ROW_PX = 20;
const latestFullYear = Number(document.body.dataset.latestYear);
const firstDataYear = Number(document.body.dataset.minYear);
// which destinations are listed, judged by the data's first and last years, not the airport's own
const flownSpan = () => ({ flown: state.flown, firstYear: firstDataYear, lastYear: latestFullYear });

// the latest full year this airport has data for (an airport that stopped before it uses its own last year)
function latestYear() {
  const years = rows.map((r) => Number(r.year)).filter((y) => y <= latestFullYear);
  return years.length ? Math.max(...years) : null;
}

// the year that ranks the destinations, or null for all years; a destination dropped by then has nothing to rank in it
const rankYear = () => (state.rank === 'latest' && state.flown !== 'dropped' ? latestYear() : null);

function pushState() {
  const q = new URLSearchParams();
  if (state.measure !== 'passengers') q.set('measure', state.measure);
  if (state.service !== 'all') q.set('service', state.service);
  if (state.n !== 25) q.set('n', state.n);
  if (state.group !== 'airport') q.set('group', state.group);
  if (state.rank !== 'all') q.set('rank', state.rank);
  if (state.flown !== 'ever') q.set('flown', state.flown);
  if (state.scale !== 'absolute') q.set('scale', state.scale);
  if (state.group === 'city' && state.open.length) q.set('open', state.open.join(','));
  const s = q.toString();
  history.replaceState(null, '', `${location.pathname}${replaceSearch(location.search, ['measure', 'service', 'n', 'group', 'rank', 'flown', 'scale', 'open'], s ? `?${s}` : '')}`);
}

function drawAirports() {
  const box = $('matrix');
  box.replaceChildren();
  placeKey($('matrix-key'), null);
  const res = buildMatrix(rows, { ...state, ...flownSpan(), rankYear: rankYear() });
  if (!res.cells.length) {
    box.textContent = 'No routes to chart for this selection.';
    return;
  }
  const years = res.years.map(String);
  const labelEvery = years.length <= 15 ? 1 : 5;
  const data = res.cells.map((c) => ({
    ...c,
    year: String(c.year),
    head: `${c.dest}${cities.get(c.dest) ? ` · ${cities.get(c.dest)}` : ''}`,
    rows: cellRows(c),
    href: routeYearHref(c.dest, c.year),
  }));
  const width = Math.min(box.clientWidth || 900, 1100);
  const marginLeft = 48;
  const chart = Plot.plot({
    width,
    height: res.dests.length * ROW_PX + 90,
    marginLeft,
    marginTop: 30,
    padding: 0.08,
    style: { background: 'transparent', fontSize: '12px' },
    x: { type: 'band', domain: years, label: null, axis: 'top', tickFormat: (d) => (Number(d) % labelEvery === 0 ? d : '') },
    y: { type: 'band', domain: res.dests, axis: null },
    color: colourScale(Math.max(0, ...res.cells.map((c) => c.value))),
    marks: [
      Plot.cell(data, { x: 'year', y: 'dest', fill: fillField(), href: 'href' }),
      Plot.cell(data, Plot.pointer({ x: 'year', y: 'dest', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, maxRadius: pointerReach({ width, marginLeft, years: years.length, rowPx: ROW_PX }) })),
      Plot.text(res.dests.map((d) => ({ dest: d, tip: airportTip(d, airportInfo), href: routeHref(d) })), {
        y: 'dest', text: 'dest', title: 'tip', href: 'href', frameAnchor: 'left', textAnchor: 'end', dx: -8,
      }),
    ],
  });
  placeKey($('matrix-key'), chart);
  box.append(...attachPopover(chart, cellPopover('dest')));
}

// links keep the direction: departing here is the route's out, arriving its in
const keepDir = dir ? `?dir=${dir}` : '';
const routeYearHref = (dest, year) => `/airports/${encodeURIComponent(origin)}/${encodeURIComponent(dest)}/${year}${keepDir}`;
const routeHref = (dest) => `/airports/${encodeURIComponent(origin)}/${encodeURIComponent(dest)}${keepDir}`; // a row opens its route, whose heading leads on to the other airport
const relative = () => state.scale !== 'absolute';
const fillField = () => ({ absolute: 'value', year: 'share', busiest: 'peak' }[state.scale]);
const fmtPct = (s) => `${(s * 100).toFixed(s < 0.1 ? 1 : 0)}%`;
const SCALE_LEGEND = () => ({ year: `Share of the year's ${unit()}`, busiest: `% of the year's top destination` });
const colourScale = (max) => (relative()
  ? { type: 'sqrt', scheme: 'YlOrRd', label: SCALE_LEGEND()[state.scale], tickFormat: '.0%' }
  : { type: 'sqrt', scheme: 'YlOrRd', ...millionsAxis(max, MATRIX_MEASURES[state.measure]) });
// a matrix cell's popover rows: the amount, and the share the colour shows when it shows one
const cellRows = (c) => [
  { label: MATRIX_MEASURES[state.measure].replace(/ \(.*/, ''), value: formatCount(c.value) },
  ...(state.scale === 'year' ? [{ label: 'Share of the year', value: fmtPct(c.share) }] : []),
  ...(state.scale === 'busiest' ? [{ label: "Of the year's top", value: fmtPct(c.peak) }] : []),
];
const unit = () => MATRIX_MEASURES[state.measure].toLowerCase().replace(/ \(.*/, '');

function toggle(key) {
  state.open = state.open.includes(key) ? state.open.filter((k) => k !== key) : [...state.open, key];
  pushState();
  draw();
}

function drawCities() {
  const box = $('matrix');
  box.replaceChildren();
  placeKey($('matrix-key'), null);
  const res = buildCityMatrix(rows, { ...state, ...flownSpan(), rankYear: rankYear() });
  if (!res.cells.length) {
    box.textContent = 'No routes to chart for this selection.';
    return;
  }
  const byKey = new Map(res.rows.map((r) => [r.key, r]));
  const years = res.years.map(String);
  const labelEvery = years.length <= 15 ? 1 : 5;
  const data = res.cells.map((c) => {
    const row = byKey.get(c.row);
    const parts = c.parts ? c.parts.slice(0, 5).map((p) => ({ label: p.dest, value: formatCount(p.value) })) : [];
    const more = c.parts && c.parts.length > 5 ? [{ label: `+${c.parts.length - 5} more`, value: '' }] : [];
    const head = row.kind === 'airport' ? `${row.code}${row.name ? ` · ${row.name}` : ''}` : row.label;
    // a city's cell opens the route in that year when the city has one airport; a city with several opens into them
    const href = row.kind === 'airport' ? routeYearHref(row.code, c.year) : row.codes.length === 1 ? routeYearHref(row.codes[0], c.year) : `#toggle:${row.key}`;
    return { ...c, year: String(c.year), href, head, rows: [...cellRows(c), ...parts, ...more] };
  });
  // a city is its name, opening into its airports (the links); an airport under it is its code, named on hover
  const labels = res.rows.map((r) => ({
    ...r,
    text: r.kind === 'airport' ? r.code : r.label,
    href: r.kind === 'airport' ? routeHref(r.code) : `#toggle:${r.key}`,
    tip: r.kind === 'airport' ? airportTip(r.code, airportInfo) : groupTip(r, airportInfo),
  }));
  const width = Math.min(box.clientWidth || 900, 1200);
  const marginLeft = labelMargin(labels.map((l) => l.text), textWidth(box)) + ARROW_SLOT;
  const chart = Plot.plot({
    width,
    height: res.rows.length * ROW_PX + 90,
    marginLeft,
    marginTop: 30,
    padding: 0.08,
    style: { background: 'transparent', fontSize: '12px' },
    x: { type: 'band', domain: years, label: null, axis: 'top', tickFormat: (d) => (Number(d) % labelEvery === 0 ? d : '') },
    y: { type: 'band', domain: res.rows.map((r) => r.key), axis: null },
    color: colourScale(Math.max(0, ...res.cells.map((c) => c.value))),
    marks: [
      Plot.cell(data, { x: 'year', y: 'row', fill: fillField(), href: 'href' }),
      Plot.cell(data, Plot.pointer({ x: 'year', y: 'row', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, maxRadius: pointerReach({ width, marginLeft, years: years.length, rowPx: ROW_PX }) })),
      Plot.text(labels, {
        y: 'key', text: 'text', title: 'tip', href: 'href', frameAnchor: 'left', textAnchor: 'end', dx: -8 - ARROW_SLOT,
        fontWeight: (d) => (d.kind === 'group' ? 600 : 400), fill: 'currentColor', fillOpacity: (d) => (d.kind === 'group' ? 1 : 0.65),
      }),
      disclosureArrows(Plot, labels, (d) => `${d.open ? 'Hide' : 'List'} ${d.label}'s airports`),
    ],
  });
  placeKey($('matrix-key'), chart);
  box.append(...attachPopover(chart, cellPopover('row')));
}

// a cell's popover: its row and year, its rows, and its link (a city group's toggle isn't a link to follow)
const cellPopover = (y) => ({
  content: (d) => ({ title: `${d.head} · ${d.year}`, rows: d.rows }),
  at: (d) => [d.year, d[y]],
  keyOf: () => ({ kind: 'none' }),
  link: (d) => (d.href && !d.href.startsWith('#') ? d.href : null),
});

function draw() {
  const note = $('scale-note');
  note.hidden = !relative();
  note.textContent = {
    absolute: '',
    year: `Colour shows each destination's share of ${origin}'s ${unit()} in that year, counting every destination (not just those listed), not the amount itself. A route can keep its colour while carrying more if the airport grew as fast. Hover over a cell for both.`,
    busiest: `Colour compares each cell with ${origin}'s top ${state.group === 'city' ? 'city' : 'destination'} that year, the one with the most ${unit()}: the top one is 100%, one with half as many ${unit()} is 50%. Each year is judged on its own, so colours show how a destination ranked then, not how much it carried. Hover over a cell for both.`,
  }[state.scale];
  const year = latestYear();
  if (year !== null) $('matrix-rank').options[1].textContent = `${year} only`;
  const rankLatest = $('matrix-rank').options[1];
  rankLatest.disabled = state.flown === 'dropped';
  $('matrix-rank').value = rankYear() === null ? 'all' : 'latest';
  $('flown-note').innerHTML = {
    ever: '',
    after: `"First flown after ${firstDataYear}" lists destinations with no flights in ${firstDataYear}, the first year of the data. Small airports and commuter routes join the data in October 2002, so many seem to start then (<a href="/about#breaks">known gaps</a>).`,
    dropped: `"Dropped by ${latestFullYear}" lists destinations with no flights in ${latestFullYear}, including any that started and stopped since ${firstDataYear}.`,
  }[state.flown];
  $('rank-note').textContent = rankYear() === null
    ? 'Destinations are ranked by the measure summed over all years.'
    : `Destinations are ranked by the measure in ${rankYear()} alone, so ones that did not fly then are not shown.`;
  if (state.group === 'city') drawCities();
  else drawAirports();
  useLabelTips($('matrix'));
}

attachLabelTips($('matrix'), $('label-tip'));

$('matrix').addEventListener('click', (e) => {
  const a = e.target.closest && e.target.closest('a');
  const href = a && (a.getAttribute('href') || a.getAttribute('xlink:href'));
  if (href && href.startsWith('#toggle:')) {
    e.preventDefault();
    toggle(href.slice('#toggle:'.length));
  }
});

$('dir').addEventListener('change', (e) => setDir(e.target.value));

async function main() {
  setDataLink('routes_by_year', { origin, min_deps: '', dir });
  fillControls();
  try {
    const [byYear, airports] = await Promise.all([
      fetchRows(queryUrl('routes_by_year', { origin, dir })),
      fetchRows(queryUrl('airports')),
    ]);
    rows = byYear.rows;
    cities = new Map(airports.rows.map((a) => [a.code, a.place]));
    airportInfo = new Map(airports.rows.map((a) => [a.code, a]));
    $('truncated').hidden = !byYear.truncated;
  } catch (err) {
    console.error(err);
    $('matrix').textContent = 'Could not load the chart data.';
    return;
  }
  if (!rows.length) { $('matrix').textContent = `No flights ${{ '': 'to or from', out: 'from', in: 'to' }[dir]} ${origin} in the data.`; return; }
  draw();
}

function fillControls() {
  const measure = $('matrix-measure');
  for (const [k, label] of Object.entries(MATRIX_MEASURES)) measure.append(new Option(label.toLowerCase(), k)); // reads mid-sentence
  measure.value = state.measure;
  $('matrix-service').value = state.service;
  $('matrix-n').value = String(state.n);
  $('matrix-group').value = state.group;
  $('matrix-rank').value = state.rank;
  $('matrix-flown').value = state.flown;
  for (const radio of document.querySelectorAll('input[name="scale"]')) {
    radio.checked = radio.value === state.scale;
    radio.addEventListener('change', () => { state.scale = radio.value; pushState(); draw(); });
  }
  $('matrix-rank').addEventListener('change', (e) => { state.rank = e.target.value; pushState(); draw(); });
  $('matrix-flown').addEventListener('change', (e) => { state.flown = e.target.value; pushState(); draw(); });
  $('matrix-group').addEventListener('change', (e) => { state.group = e.target.value; pushState(); draw(); });
  measure.addEventListener('change', (e) => { state.measure = e.target.value; pushState(); draw(); });
  $('matrix-service').addEventListener('change', (e) => { state.service = e.target.value; pushState(); draw(); });
  $('matrix-n').addEventListener('change', (e) => { state.n = Number(e.target.value); pushState(); draw(); });
}

main();
