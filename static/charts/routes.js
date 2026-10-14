import * as Plot from '/static/charts/vendor/plot.js';
import { buildHeatmap, buildCityHeatmap, HEAT_MEASURES } from '/static/charts/src/heatmap.js';
import { airportTip, groupTip } from '/static/charts/src/labels.js';
import { queryUrl, fetchRows } from '/static/globe/src/api.js';
import { replaceSearch } from '/static/nav/src/state.js';

const origin = document.body.dataset.origin;
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const pick = (key, allowed, fallback) => (allowed.includes(params.get(key)) ? params.get(key) : fallback);
const state = {
  measure: pick('measure', Object.keys(HEAT_MEASURES), 'passengers'),
  service: pick('service', ['all', 'domestic', 'international'], 'all'),
  n: Number(pick('n', ['10', '25', '50'], '25')),
  group: pick('group', ['airport', 'city'], 'airport'),
  rank: pick('rank', ['all', 'latest'], 'all'),
  scale: pick('scale', ['absolute', 'year', 'busiest'], 'absolute'),
  open: (params.get('open') || '').split(',').filter(Boolean),
};
let rows = [];
let cities = new Map();
let airportInfo = new Map();

const ROW_PX = 20;
const latestFullYear = Number(document.body.dataset.latestYear);

// the latest full year this airport has data for (an airport that stopped before it uses its own last year)
function latestYear() {
  const years = rows.map((r) => Number(r.year)).filter((y) => y <= latestFullYear);
  return years.length ? Math.max(...years) : null;
}

// the year that ranks the destinations, or null for all years
const rankYear = () => (state.rank === 'latest' ? latestYear() : null);

function pushState() {
  const q = new URLSearchParams();
  if (state.measure !== 'passengers') q.set('measure', state.measure);
  if (state.service !== 'all') q.set('service', state.service);
  if (state.n !== 25) q.set('n', state.n);
  if (state.group !== 'airport') q.set('group', state.group);
  if (state.rank !== 'all') q.set('rank', state.rank);
  if (state.scale !== 'absolute') q.set('scale', state.scale);
  if (state.group === 'city' && state.open.length) q.set('open', state.open.join(','));
  const s = q.toString();
  history.replaceState(null, '', `${location.pathname}${replaceSearch(location.search, ['measure', 'service', 'n', 'group', 'rank', 'scale', 'open'], s ? `?${s}` : '')}`);
}

function drawAirports() {
  const box = $('heatmap');
  box.replaceChildren();
  const res = buildHeatmap(rows, { ...state, rankYear: rankYear() });
  if (!res.cells.length) {
    box.textContent = 'No routes to chart for this selection.';
    return;
  }
  const years = res.years.map(String);
  const labelEvery = years.length <= 15 ? 1 : 5;
  const data = res.cells.map((c) => ({
    ...c,
    year: String(c.year),
    label: `${c.dest}${cities.get(c.dest) ? ` · ${cities.get(c.dest)}` : ''}\n${withShare(c, `${c.year}: ${Math.round(c.value).toLocaleString('en-US')} ${unit()}`)}`,
    href: routeYearHref(c.dest, c.year),
  }));
  box.append(Plot.plot({
    width: Math.min(box.clientWidth || 900, 1100),
    height: res.dests.length * ROW_PX + 90,
    marginLeft: 48,
    marginTop: 30,
    padding: 0.08,
    style: { background: 'transparent', fontSize: '12px' },
    x: { type: 'band', domain: years, label: null, axis: 'top', tickFormat: (d) => (Number(d) % labelEvery === 0 ? d : '') },
    y: { type: 'band', domain: res.dests, axis: null },
    color: colourScale(),
    marks: [
      Plot.cell(data, { x: 'year', y: 'dest', fill: fillField(), title: 'label', href: 'href', tip: true }),
      Plot.text(res.dests.map((d) => ({ dest: d, tip: airportTip(d, airportInfo), href: airportHref(d) })), {
        y: 'dest', text: 'dest', title: 'tip', href: 'href', frameAnchor: 'left', textAnchor: 'end', dx: -8,
      }),
    ],
  }));
}

const routeYearHref = (dest, year) => `/route/${encodeURIComponent(origin)}/${encodeURIComponent(dest)}/${year}`;
const airportHref = (code) => `/routes/${encodeURIComponent(code)}`;
const relative = () => state.scale !== 'absolute';
const fillField = () => ({ absolute: 'value', year: 'share', busiest: 'peak' }[state.scale]);
const fmtPct = (s) => `${(s * 100).toFixed(s < 0.1 ? 1 : 0)}%`;
const SCALE_LEGEND = () => ({ year: `Share of the year's ${unit()}`, busiest: `% of the year's top destination` });
const colourScale = () => (relative()
  ? { type: 'sqrt', scheme: 'YlOrRd', legend: true, label: SCALE_LEGEND()[state.scale], tickFormat: '.0%' }
  : { type: 'sqrt', scheme: 'YlOrRd', legend: true, label: HEAT_MEASURES[state.measure], tickFormat: '~s' });
const withShare = (c, text) => ({
  absolute: text,
  year: `${text} (${fmtPct(c.share)} of the year)`,
  busiest: `${text} (${fmtPct(c.peak)} of the year's top)`,
}[state.scale]);
const unit = () => HEAT_MEASURES[state.measure].toLowerCase().replace(/ \(.*/, '');
const fmtValue = (v) => Math.round(v).toLocaleString('en-US');

function toggle(key) {
  state.open = state.open.includes(key) ? state.open.filter((k) => k !== key) : [...state.open, key];
  pushState();
  draw();
}

function drawCities() {
  const box = $('heatmap');
  box.replaceChildren();
  const res = buildCityHeatmap(rows, { ...state, rankYear: rankYear() });
  if (!res.cells.length) {
    box.textContent = 'No routes to chart for this selection.';
    return;
  }
  const byKey = new Map(res.rows.map((r) => [r.key, r]));
  const years = res.years.map(String);
  const labelEvery = years.length <= 15 ? 1 : 5;
  const data = res.cells.map((c) => {
    const row = byKey.get(c.row);
    const lines = c.parts ? c.parts.slice(0, 5).map((p) => `${p.dest}  ${fmtValue(p.value)}`) : [];
    const more = c.parts && c.parts.length > 5 ? [`+${c.parts.length - 5} more`] : [];
    const head = row.kind === 'airport' ? `${row.code}${row.name ? ` · ${row.name}` : ''}` : row.label;
    const href = row.kind === 'airport' ? routeYearHref(row.code, c.year) : row.expandable ? `#toggle:${row.key}` : routeYearHref(row.codes[0], c.year);
    return { ...c, year: String(c.year), href, title: [head, withShare(c, `${c.year}: ${fmtValue(c.value)} ${unit()}`), ...lines, ...more].join('\n') };
  });
  const labels = res.rows.map((r) => ({
    ...r,
    text: r.kind === 'airport' ? `${r.code}${r.name ? ` · ${r.name}` : ''}` : `${r.expandable ? (r.open ? '▾' : '▸') : '\u2003'} ${r.label}`,
    href: r.kind === 'airport' ? airportHref(r.code) : r.expandable ? `#toggle:${r.key}` : airportHref(r.codes[0]),
    tip: r.kind === 'airport' ? airportTip(r.code, airportInfo) : groupTip(r, airportInfo),
  }));
  box.append(Plot.plot({
    width: Math.min(box.clientWidth || 900, 1200),
    height: res.rows.length * ROW_PX + 90,
    marginLeft: 280,
    marginTop: 30,
    padding: 0.08,
    style: { background: 'transparent', fontSize: '12px' },
    x: { type: 'band', domain: years, label: null, axis: 'top', tickFormat: (d) => (Number(d) % labelEvery === 0 ? d : '') },
    y: { type: 'band', domain: res.rows.map((r) => r.key), axis: null },
    color: colourScale(),
    marks: [
      Plot.cell(data, { x: 'year', y: 'row', fill: fillField(), title: 'title', href: 'href', tip: true }),
      Plot.text(labels, {
        y: 'key', text: 'text', title: 'tip', href: 'href', frameAnchor: 'left', textAnchor: 'end', dx: -8,
        fontWeight: (d) => (d.kind === 'group' ? 600 : 400), fill: (d) => (d.kind === 'group' ? '#1a1a1a' : '#666'),
      }),
    ],
  }));
}

// Row labels carry their hover text in an SVG <title>; move it into our own tooltip so it shows at once
// and the same way in every browser.
function useLabelTips() {
  for (const text of $('heatmap').querySelectorAll('svg text')) {
    const title = text.querySelector(':scope > title');
    if (!title) continue;
    text.dataset.tip = title.textContent;
    title.remove();
  }
}

function draw() {
  const note = $('scale-note');
  note.hidden = !relative();
  note.textContent = {
    absolute: '',
    year: `Colour shows each destination's share of ${origin}'s ${unit()} in that year, counting every destination (not just those listed), not the amount itself. A route can keep its colour while carrying more if the airport grew as fast. Hover over a cell for both.`,
    busiest: `Colour compares each cell with ${origin}'s top ${state.group === 'city' ? 'city' : 'destination'} that year, the one with the most ${unit()}: the top one is 100%, one with half as many ${unit()} is 50%. Each year is judged on its own, so colours show how a destination ranked then, not how much it carried. Hover over a cell for both.`,
  }[state.scale];
  const year = latestYear();
  if (year !== null) $('heat-rank').options[1].textContent = `${year} only`;
  $('rank-note').textContent = rankYear() === null
    ? 'Destinations are ranked by the measure summed over all years.'
    : `Destinations are ranked by the measure in ${rankYear()} alone, so ones that did not fly then are not shown.`;
  if (state.group === 'city') drawCities();
  else drawAirports();
  useLabelTips();
}

const labelTip = $('label-tip');
$('heatmap').addEventListener('mousemove', (e) => {
  const text = e.target.closest && e.target.closest('text[data-tip]');
  $('heatmap').classList.toggle('over-label', Boolean(text));
  if (!text) { labelTip.hidden = true; return; }
  labelTip.textContent = text.dataset.tip;
  labelTip.style.left = `${Math.min(e.clientX + 14, window.innerWidth - 320)}px`;
  labelTip.style.top = `${e.clientY + 14}px`;
  labelTip.hidden = false;
});
$('heatmap').addEventListener('mouseleave', () => { labelTip.hidden = true; $('heatmap').classList.remove('over-label'); });

$('heatmap').addEventListener('click', (e) => {
  const a = e.target.closest && e.target.closest('a');
  const href = a && (a.getAttribute('href') || a.getAttribute('xlink:href'));
  if (href && href.startsWith('#toggle:')) {
    e.preventDefault();
    toggle(href.slice('#toggle:'.length));
  }
});

async function main() {
  fillControls();
  try {
    const [byYear, airports] = await Promise.all([
      fetchRows(queryUrl('routes_by_year', { origin })),
      fetchRows(queryUrl('airports')),
    ]);
    rows = byYear.rows;
    cities = new Map(airports.rows.map((a) => [a.code, a.place]));
    airportInfo = new Map(airports.rows.map((a) => [a.code, a]));
    const here = airports.rows.find((a) => a.code === origin);
    if (here) $('title').textContent = `${origin} (${here.place}): routes over time`;
    if (byYear.truncated) $('subtitle').textContent = 'Too many rows: some routes are missing from this chart.';
  } catch (err) {
    console.error(err);
    $('heatmap').textContent = 'Could not load the chart data.';
    return;
  }
  if (!rows.length) { $('heatmap').textContent = `No flights from ${origin} in the data.`; return; }
  draw();
}

function fillControls() {
  const measure = $('heat-measure');
  for (const [k, label] of Object.entries(HEAT_MEASURES)) measure.append(new Option(label, k));
  measure.value = state.measure;
  $('heat-service').value = state.service;
  $('heat-n').value = String(state.n);
  $('heat-group').value = state.group;
  $('heat-rank').value = state.rank;
  $('heat-scale').value = state.scale;
  $('heat-scale').addEventListener('change', (e) => { state.scale = e.target.value; pushState(); draw(); });
  $('heat-rank').addEventListener('change', (e) => { state.rank = e.target.value; pushState(); draw(); });
  $('heat-group').addEventListener('change', (e) => { state.group = e.target.value; pushState(); draw(); });
  measure.addEventListener('change', (e) => { state.measure = e.target.value; pushState(); draw(); });
  $('heat-service').addEventListener('change', (e) => { state.service = e.target.value; pushState(); draw(); });
  $('heat-n').addEventListener('change', (e) => { state.n = Number(e.target.value); pushState(); draw(); });
}

main();
