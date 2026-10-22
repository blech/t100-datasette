import * as Plot from '/static/charts/vendor/plot.js';
import { setDataLink } from '/static/common/datalink.js';
import { buildMatrix, buildCityMatrix, labelMargin, textWidth, MATRIX_MEASURES } from '/static/charts/src/matrix.js';
import { rollupRows, routeRows } from '/static/charts/src/rollup.js';
import { sharedQuery } from '/static/charts/src/airlines.js';
import { tableSearch } from '/static/landing/src/table.js';
import { shortNames } from '/static/charts/src/names.js';
import { queryUrl, fetchRows } from '/static/globe/src/api.js';
import { attachPopover } from '/static/common/popover.js';
import { formatCount, millionsAxis } from '/static/common/numbers.js';
import { replaceSearch } from '/static/nav/src/state.js';

const KINDS = {
  airlines: { query: 'carrier_group_by_year', key: 'group_name', noun: 'airline' },
  routes: { query: 'carrier_route_by_year', key: 'route', noun: 'route' },
  airports: { query: 'airport_by_year', key: 'origin', noun: 'airport' },
};
const kind = document.body.dataset.kind;
const page = KINDS[kind];
const body = document.body.dataset;
const queryParams = kind === 'routes' ? { group: body.group, airline: body.airline } : {};
const latestFullYear = Number(document.body.dataset.latestYear);
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const pick = (key, allowed, fallback) => (allowed.includes(params.get(key)) ? params.get(key) : fallback);
const state = {
  measure: pick('measure', Object.keys(MATRIX_MEASURES), 'passengers'),
  flights: pick('flights', ['passenger', 'freight', 'all'], 'passenger'),
  service: pick('service', ['all', 'domestic', 'international'], 'all'),
  n: Number(pick('n', ['10', '25', '50'], '50')),
  rank: pick('rank', ['all', 'latest'], 'all'),
  scale: pick('scale', ['absolute', 'year', 'busiest'], 'year'),
  group: kind === 'airports' ? pick('group', ['airport', 'city'], 'airport') : 'airport', // the airports matrix can show cities
  open: (params.get('open') || '').split(',').filter(Boolean), // the cities opened to list their airports
};
let rows = [];

const ROW_PX = 20;
const unit = () => MATRIX_MEASURES[state.measure].toLowerCase().replace(/ \(.*/, '');
const fmtPct = (s) => `${(s * 100).toFixed(s < 0.1 ? 1 : 0)}%`;
const fillField = () => ({ absolute: 'value', year: 'share', busiest: 'peak' }[state.scale]);
const relative = () => state.scale !== 'absolute';
const rankYear = () => (state.rank === 'latest' ? latestFullYear : null);

function pushState() {
  const q = new URLSearchParams();
  if (state.measure !== 'passengers') q.set('measure', state.measure);
  if (state.flights !== 'passenger') q.set('flights', state.flights);
  if (state.service !== 'all') q.set('service', state.service);
  if (state.n !== 50) q.set('n', state.n);
  if (state.rank !== 'all') q.set('rank', state.rank);
  if (state.scale !== 'year') q.set('scale', state.scale);
  if (state.group === 'city') q.set('group', 'city');
  if (state.group === 'city' && state.open.length) q.set('open', state.open.join(','));
  const s = q.toString();
  history.replaceState(null, '', `${location.pathname}${replaceSearch(location.search, ['measure', 'flights', 'service', 'n', 'rank', 'scale', 'group', 'open'], s ? `?${s}` : '')}`);
  carry();
}

// the views line: an airline's views pass their whole query, as its other pages do; the airlines matrix passes the
// settings the airlines table reads too
const carry = () => {
  for (const a of document.querySelectorAll('nav.views a')) {
    if (kind === 'airports') { if (a.pathname === '/airports') a.search = tableSearch(location.search); } // the table takes the measure as its sort
    else a.search = kind === 'routes' ? location.search : sharedQuery(location.search);
  }
};

// a matrix cell's popover rows: the amount, and the share the colour shows when it shows one
const cellRows = (c) => [
  { label: MATRIX_MEASURES[state.measure].replace(/ \(.*/, ''), value: formatCount(c.value) },
  ...(state.scale === 'year' ? [{ label: 'Share of the year', value: fmtPct(c.share) }] : []),
  ...(state.scale === 'busiest' ? [{ label: "Of the year's biggest", value: fmtPct(c.peak) }] : []),
];

// airlines are named by their legal entity, which is long: label rows with the short name (the full one is the hover text)
let shorts = new Map();
const labelOf = (name) => shorts.get(name) || name;

// a label opens the thing it names: an airline's own page, or a route with this airline picked out
let places = new Map();
const place = (code) => places.get(code) || code;
const pairOf = (route) => route.split(' – ');
function familyHref(name) {
  if (kind === 'routes') { const [o, d] = pairOf(name); return `/airports/${o}/${d}?split=carrier&highlight=airline:${body.group}`; }
  if (kind === 'airports') return `/airports/${name}/destinations`; // a matrix leads to a matrix
  const id = rows.find((r) => r.group_name === name)?.group_id;
  return id ? `/airlines/${id}` : undefined;
}
const titleOf = (name) => (kind === 'routes' ? pairOf(name).map(place).join(' – ') : kind === 'airports' ? `${name} · ${rows.find((r) => r.origin === name)?.city || ''}` : name);

// the airports matrix by city: a city is its name, opening into its airports (each a link to its destinations matrix)
const cityOf = () => new Map(rows.map((r) => [r.origin, r.city]));
function drawCities(box) {
  const res = buildCityMatrix(rows.map((r) => ({ ...r, dest: r.origin })), { ...state, service: 'all', rankYear: rankYear() });
  if (!res.cells.length) { box.textContent = 'Nothing to chart for this selection.'; return; }
  const city = cityOf();
  const byKey = new Map(res.rows.map((r) => [r.key, r]));
  const years = res.years.map(String);
  const labelEvery = years.length <= 15 ? 1 : 5;
  const labels = res.rows.map((r) => ({
    ...r,
    text: r.kind === 'airport' ? r.code : `${r.open ? '▾' : '▸'} ${r.label}`,
    href: r.kind === 'airport' ? `/airports/${r.code}/destinations` : `#toggle:${r.key}`,
    title: r.kind === 'airport' ? `${r.code} · ${city.get(r.code) || ''}` : [r.label, '', ...r.codes.map((c) => `${c}  ${city.get(c) || ''}`)].join('\n'),
  }));
  const data = res.cells.map((c) => {
    const row = byKey.get(c.row);
    const parts = c.parts && row.codes.length > 1 ? c.parts.slice(0, 5).map((p) => ({ label: p.dest, value: formatCount(p.value) })) : [];
    return { ...c, year: String(c.year), head: row.kind === 'airport' ? row.code : row.label, rows: [...cellRows(c), ...parts] };
  });
  const chart = Plot.plot({
    width: Math.min(box.clientWidth || 900, 1200),
    height: res.rows.length * ROW_PX + 90,
    marginLeft: labelMargin(labels.map((l) => l.text), textWidth(box)),
    marginTop: 30,
    padding: 0.08,
    style: { background: 'transparent', fontSize: '12px' },
    x: { type: 'band', domain: years, label: null, axis: 'top', tickFormat: (d) => (Number(d) % labelEvery === 0 ? d : '') },
    y: { type: 'band', domain: res.rows.map((r) => r.key), axis: null },
    color: colourOptions(res.cells),
    marks: [
      Plot.cell(data, { x: 'year', y: 'row', fill: fillField() }),
      Plot.cell(data, Plot.pointer({ x: 'year', y: 'row', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 })),
      Plot.text(labels, {
        y: 'key', text: 'text', title: 'title', href: 'href', frameAnchor: 'left', textAnchor: 'end', dx: -8,
        fontWeight: (d) => (d.kind === 'group' ? 600 : 400), fill: 'currentColor', fillOpacity: (d) => (d.kind === 'group' ? 1 : 0.65),
      }),
    ],
  });
  box.append(...attachPopover(chart, {
    content: (d) => ({ title: `${d.head} · ${d.year}`, rows: d.rows }), at: (d) => [d.year, d.row], keyOf: () => ({ kind: 'none' }),
  }));
}

const colourOptions = (cells) => (relative()
  ? { type: 'sqrt', scheme: 'YlOrRd', legend: true, label: state.scale === 'year' ? `Share of the year's ${unit()}` : `% of the year's biggest`, tickFormat: '.0%' }
  : { type: 'sqrt', scheme: 'YlOrRd', legend: true, ...millionsAxis(Math.max(0, ...cells.map((c) => c.value)), MATRIX_MEASURES[state.measure]) });

function draw() {
  $('scale-note').hidden = !relative();
  $('scale-note').textContent = {
    absolute: '',
    year: `Colour shows each ${page.noun}'s share of all ${unit()} that year, counting every ${page.noun} (not just those listed), not the amount itself. Hover over a cell for both.`,
    busiest: `Colour compares each cell with the year's biggest ${page.noun}: the biggest is 100%, one with half as many ${unit()} is 50%. Each year is judged on its own. Hover over a cell for both.`,
  }[state.scale];
  $('matrix-rank').options[1].textContent = `${latestFullYear} only`;
  $('rank-note').textContent = `Rows are ranked by the measure ${rankYear() === null ? 'summed over all years' : `in ${rankYear()} alone, so ones that did not fly then are not shown`}. Each cell is one ${page.noun} in one year; blank means none. Freight is in short tons (2,000 lb).${kind === 'airlines' ? ' Click an airline\'s name to see its routes. Airlines that merged are counted together for every year, including years before the merger.' : ''}${kind === 'airports' ? (state.group === 'city' ? ' A city is a BTS city market (New York is JFK, LaGuardia and Newark); click one to list its airports, and an airport\'s code to see where it flies.' : ' Click an airport\'s code to see where it flies.') : ''}${kind === 'routes' ? ' Each row is an airport pair, both directions together; a year shows when the airline flew it at least 12 times (12 departures). A merged airline counts its members together for every year. Click a route to see it with this airline picked out.' : ''}`;

  const box = $('matrix');
  box.replaceChildren();
  if (state.group === 'city') { drawCities(box); return; }
  const res = buildMatrix(rollupRows(rows, { key: page.key, kind: kind === 'routes' ? 'all' : state.flights }), { ...state, rankYear: rankYear() });
  if (!res.cells.length) { box.textContent = 'Nothing to chart for this selection.'; return; }
  const years = res.years.map(String);
  const labelEvery = years.length <= 15 ? 1 : 5;
  const data = res.cells.map((c) => ({ ...c, year: String(c.year) }));
  const chart = Plot.plot({
    width: Math.min(box.clientWidth || 900, 1200),
    height: res.dests.length * ROW_PX + 90,
    marginLeft: kind === 'airports' ? 48 : 190, // airport codes are short; airline names and routes aren't
    marginTop: 30,
    padding: 0.08,
    style: { background: 'transparent', fontSize: '12px' },
    x: { type: 'band', domain: years, label: null, axis: 'top', tickFormat: (d) => (Number(d) % labelEvery === 0 ? d : '') },
    y: { type: 'band', domain: res.dests, axis: null },
    color: relative()
      ? { type: 'sqrt', scheme: 'YlOrRd', legend: true, label: state.scale === 'year' ? `Share of the year's ${unit()}` : `% of the year's biggest`, tickFormat: '.0%' }
      : { type: 'sqrt', scheme: 'YlOrRd', legend: true, ...millionsAxis(Math.max(0, ...res.cells.map((c) => c.value)), MATRIX_MEASURES[state.measure]) },
    marks: [
      Plot.cell(data, { x: 'year', y: 'dest', fill: fillField() }),
      Plot.cell(data, Plot.pointer({ x: 'year', y: 'dest', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 })),
      Plot.text(res.dests.map((d) => ({ dest: d, label: labelOf(d), href: familyHref(d), title: titleOf(d) })), { y: 'dest', text: 'label', title: 'title', href: 'href', frameAnchor: 'left', textAnchor: 'end', dx: -8, fill: 'currentColor' }),
    ],
  });
  box.append(...attachPopover(chart, {
    content: (d) => ({ title: `${d.dest} · ${d.year}`, rows: cellRows(d) }), at: (d) => [d.year, d.dest], keyOf: () => ({ kind: 'none' }),
  }));
}

function fillControls() {
  const measure = $('matrix-measure');
  for (const [k, label] of Object.entries(MATRIX_MEASURES)) measure.append(new Option(label.toLowerCase(), k));
  measure.value = state.measure;
  if ($('matrix-kind')) $('matrix-kind').value = state.flights;
  if ($('matrix-service')) $('matrix-service').value = state.service;
  $('matrix-n').value = String(state.n);
  $('matrix-rank').value = state.rank;
  for (const radio of document.querySelectorAll('input[name="scale"]')) {
    radio.checked = radio.value === state.scale;
    radio.addEventListener('change', () => { state.scale = radio.value; pushState(); draw(); });
  }
  const bind = (id, field, convert = String) => $(id).addEventListener('change', (e) => { state[field] = convert(e.target.value); pushState(); draw(); });
  bind('matrix-measure', 'measure');
  if ($('matrix-kind')) bind('matrix-kind', 'flights');
  if ($('matrix-service')) bind('matrix-service', 'service');
  if ($('matrix-group')) { $('matrix-group').value = state.group; bind('matrix-group', 'group'); }
  bind('matrix-n', 'n', Number);
  bind('matrix-rank', 'rank');
}

// a city's ▸ (a #toggle: link) opens or closes it
$('matrix').addEventListener('click', (e) => {
  const a = e.target.closest && e.target.closest('a');
  const href = a && (a.getAttribute('href') || a.getAttribute('xlink:href'));
  if (!href || !href.startsWith('#toggle:')) return;
  e.preventDefault();
  const key = href.slice('#toggle:'.length);
  state.open = state.open.includes(key) ? state.open.filter((k) => k !== key) : [...state.open, key];
  pushState();
  draw();
});

async function main() {
  setDataLink(page.query, queryParams);
  fillControls();
  carry();
  try {
    const [res, airports] = await Promise.all([
      fetchRows(queryUrl(page.query, queryParams)),
      kind === 'routes' ? fetchRows(queryUrl('airports')).catch(() => null) : null, // place names are only hover text
    ]);
    rows = kind === 'routes' ? routeRows(res.rows) : res.rows;
    if (airports) places = new Map(airports.rows.map((r) => [r.code, r.place]));
    if (kind === 'airlines') shorts = shortNames(rows.map((r) => r.group_name));
    if (res.truncated) $('rank-note').textContent = 'Too many rows: some are missing from this chart.';
  } catch (err) {
    console.error(err);
    $('matrix').textContent = 'Could not load the chart data.';
    return;
  }
  draw();
}

main();
