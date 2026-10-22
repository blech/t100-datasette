import * as Plot from '/static/charts/vendor/plot.js';
import { buildHeatmap, HEAT_MEASURES } from '/static/charts/src/heatmap.js';
import { rollupRows, routeRows } from '/static/charts/src/rollup.js';
import { sharedQuery } from '/static/charts/src/airlines.js';
import { shortNames } from '/static/charts/src/names.js';
import { queryUrl, fetchRows } from '/static/globe/src/api.js';
import { attachPopover } from '/static/common/popover.js';
import { formatCount, millionsAxis } from '/static/common/numbers.js';
import { replaceSearch } from '/static/nav/src/state.js';

const KINDS = {
  airlines: { query: 'carrier_group_by_year', key: 'group_name', noun: 'airline' },
  routes: { query: 'carrier_route_by_year', key: 'route', noun: 'route' },
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
  measure: pick('measure', Object.keys(HEAT_MEASURES), 'passengers'),
  flights: pick('flights', ['passenger', 'freight', 'all'], 'passenger'),
  service: pick('service', ['all', 'domestic', 'international'], 'all'),
  n: Number(pick('n', ['10', '25', '50'], '50')),
  rank: pick('rank', ['all', 'latest'], 'all'),
  scale: pick('scale', ['absolute', 'year', 'busiest'], 'year'),
};
let rows = [];

const ROW_PX = 20;
const unit = () => HEAT_MEASURES[state.measure].toLowerCase().replace(/ \(.*/, '');
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
  const s = q.toString();
  history.replaceState(null, '', `${location.pathname}${replaceSearch(location.search, ['measure', 'flights', 'service', 'n', 'rank', 'scale'], s ? `?${s}` : '')}`);
  carry();
}

// the views line: an airline's views pass their whole query, as its other pages do; the airlines heat map passes the
// settings the airlines table reads too
const carry = () => { for (const a of document.querySelectorAll('nav.views a')) a.search = kind === 'routes' ? location.search : sharedQuery(location.search); };

// a heat-map cell's popover rows: the amount, and the share the colour shows when it shows one
const cellRows = (c) => [
  { label: HEAT_MEASURES[state.measure].replace(/ \(.*/, ''), value: formatCount(c.value) },
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
  const id = rows.find((r) => r.group_name === name)?.group_id;
  return id ? `/airlines/${id}` : undefined;
}
const titleOf = (name) => (kind === 'routes' ? pairOf(name).map(place).join(' – ') : name);

function draw() {
  $('scale-note').hidden = !relative();
  $('scale-note').textContent = {
    absolute: '',
    year: `Colour shows each ${page.noun}'s share of all ${unit()} that year, counting every ${page.noun} (not just those listed), not the amount itself. Hover over a cell for both.`,
    busiest: `Colour compares each cell with the year's biggest ${page.noun}: the biggest is 100%, one with half as many ${unit()} is 50%. Each year is judged on its own. Hover over a cell for both.`,
  }[state.scale];
  $('heat-rank').options[1].textContent = `${latestFullYear} only`;
  $('rank-note').textContent = `Rows are ranked by the measure ${rankYear() === null ? 'summed over all years' : `in ${rankYear()} alone, so ones that did not fly then are not shown`}. Each cell is one ${page.noun} in one year; blank means none. Freight is in short tons (2,000 lb).${kind === 'airlines' ? ' Click an airline\'s name to see its routes. Airlines that merged are counted together for every year, including years before the merger.' : ''}${kind === 'routes' ? ' Each row is an airport pair, both directions together; a year shows when the airline flew it at least 12 times (12 departures). A merged airline counts its members together for every year. Click a route to see it with this airline picked out.' : ''}`;

  const box = $('heatmap');
  box.replaceChildren();
  const res = buildHeatmap(rollupRows(rows, { key: page.key, kind: kind === 'routes' ? 'all' : state.flights }), { ...state, rankYear: rankYear() });
  if (!res.cells.length) { box.textContent = 'Nothing to chart for this selection.'; return; }
  const years = res.years.map(String);
  const labelEvery = years.length <= 15 ? 1 : 5;
  const data = res.cells.map((c) => ({ ...c, year: String(c.year) }));
  const chart = Plot.plot({
    width: Math.min(box.clientWidth || 900, 1200),
    height: res.dests.length * ROW_PX + 90,
    marginLeft: 190,
    marginTop: 30,
    padding: 0.08,
    style: { background: 'transparent', fontSize: '12px' },
    x: { type: 'band', domain: years, label: null, axis: 'top', tickFormat: (d) => (Number(d) % labelEvery === 0 ? d : '') },
    y: { type: 'band', domain: res.dests, axis: null },
    color: relative()
      ? { type: 'sqrt', scheme: 'YlOrRd', legend: true, label: state.scale === 'year' ? `Share of the year's ${unit()}` : `% of the year's biggest`, tickFormat: '.0%' }
      : { type: 'sqrt', scheme: 'YlOrRd', legend: true, ...millionsAxis(Math.max(0, ...res.cells.map((c) => c.value)), HEAT_MEASURES[state.measure]) },
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
  const measure = $('heat-measure');
  for (const [k, label] of Object.entries(HEAT_MEASURES)) measure.append(new Option(label.toLowerCase(), k));
  measure.value = state.measure;
  if ($('heat-kind')) $('heat-kind').value = state.flights;
  $('heat-service').value = state.service;
  $('heat-n').value = String(state.n);
  $('heat-rank').value = state.rank;
  for (const radio of document.querySelectorAll('input[name="scale"]')) {
    radio.checked = radio.value === state.scale;
    radio.addEventListener('change', () => { state.scale = radio.value; pushState(); draw(); });
  }
  const bind = (id, field, convert = String) => $(id).addEventListener('change', (e) => { state[field] = convert(e.target.value); pushState(); draw(); });
  bind('heat-measure', 'measure');
  if ($('heat-kind')) bind('heat-kind', 'flights');
  bind('heat-service', 'service');
  bind('heat-n', 'n', Number);
  bind('heat-rank', 'rank');
}

async function main() {
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
    $('heatmap').textContent = 'Could not load the chart data.';
    return;
  }
  draw();
}

main();
