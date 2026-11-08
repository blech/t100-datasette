import * as Plot from '/static/charts/vendor/plot.js';
import { useLabelTips, attachLabelTips } from '/static/charts/labeltips.js';
import { airportTip, groupTip } from '/static/charts/src/labels.js';
import { setDataLink } from '/static/common/datalink.js';
import { buildMatrix, buildCityMatrix, percentTicks, disclosureArrows, ARROW_SLOT, labelMargin, textWidth, pointerReach, placeKey, fullYears, MATRIX_MEASURES as MEASURES, matrixMeasures, axisLabel, measureFormat } from '/static/charts/src/matrix.js';
import { FLIGHTS, defaultFlights, settle } from '/static/charts/src/flights.js';
import { setMenus } from '/static/common/menus.js';
import { rollupRows, routeRows, topRouteRows, topMarketRows, marketKey, marketLabel, marketPath, marketPairRows, rowsChoice, bandRange, BAND_FROM, BAND_TO, slugify } from '/static/charts/src/rollup.js';
import { aircraftHref, carriedSearch, airlineSearch, rowLabel } from '/static/charts/src/aircraft.js';
import { sharedQuery } from '/static/charts/src/airlines.js';
import { tableSearch, countrySlug } from '/static/landing/src/table.js';
import { shortNames } from '/static/charts/src/names.js';
import { queryUrl, fetchRows } from '/static/globe/src/api.js';
import { attachPopover } from '/static/common/popover.js';
import { formatCount, millionsAxis } from '/static/common/numbers.js';
import { replaceSearch } from '/static/nav/src/state.js';
import { parseDir, setDir } from '/static/common/direction.js';

const KINDS = {
  airlines: { query: 'carrier_group_by_year', key: 'group_name', noun: 'airline' },
  routes: { query: 'carrier_route_by_year', key: 'route', noun: 'route' },
  toproutes: { query: 'top_routes_by_year', key: 'route', noun: 'route' }, // every airline's busiest pairs, by distance
  citypair: { query: 'market_pairs_by_year', key: 'route', noun: 'route' }, // the airport pairs between two cities, at /airports/cities/ma/mb
  airports: { query: 'airport_by_year', key: 'airport', noun: 'airport' },
  aircraft: { query: 'aircraft_by_year', key: 'family', noun: 'family' },
  fleet: { query: 'carrier_aircraft_by_year', key: 'family', noun: 'family' }, // one airline's aircraft, drawn as the aircraft matrix is
};
const kind = document.body.dataset.kind;
const dir = parseDir(location.search); // only the airports matrix offers a direction
const abroad = kind === 'airports' && document.body.dataset.region === 'abroad'; // airports outside the US: every flight is to or from the US
// the flight count's name: the airports matrix's direction, or an airline's pairs (flights both ways) or each direction (departures)
const byYear = kind === 'toproutes' || kind === 'citypair'; // the matrices ranked by any full year, as the destinations matrix is
const MATRIX_MEASURES = kind === 'airports' ? matrixMeasures(dir, abroad) : byYear ? matrixMeasures('') : kind === 'routes' ? matrixMeasures(new URLSearchParams(location.search).get('dir') === 'each' ? 'out' : '') : MEASURES;
const page = KINDS[kind];
const body = document.body.dataset;
// an airline's routes: pairs both ways together, or with dir=each each direction as flown
const each = kind === 'routes' && new URLSearchParams(location.search).get('dir') === 'each';
const queryParams = kind === 'routes' ? { group: body.group, airline: body.airline, each: each ? 'each' : '' } : kind === 'fleet' ? { group: body.group, airline: body.airline }
  : kind === 'airports' ? { dir, region: abroad ? 'abroad' : '' } : kind === 'toproutes' ? { year: '' } : kind === 'citypair' ? { ma: body.ma, mb: body.mb } : {}; // the routes matrix's year is the one ranking it
const aircraftLike = kind === 'aircraft' || kind === 'fleet';
const latestFullYear = Number(document.body.dataset.latestYear);
const $ = (id) => document.getElementById(id);
$('dir')?.addEventListener('change', (e) => setDir(e.target.value));
$('each')?.addEventListener('change', (e) => setDir(e.target.value));
const params = new URLSearchParams(location.search);
const pick = (key, allowed, fallback) => (allowed.includes(params.get(key)) ? params.get(key) : fallback);
const state = {
  measure: pick('measure', Object.keys(MATRIX_MEASURES), 'passengers'),
  // a page without the menu (a city pair's: its cities settle the service, and a short list shows every row) holds it at the default
  service: $('matrix-service') ? pick('service', ['all', 'domestic', 'international'], 'all') : 'all',
  n: Number(pick('n', ['10', '25', '50'], '50')),
  rank: pick('rank', ['all', 'latest'], 'all'),
  // the routes matrix ranks by any full year (year=, or the old rank=latest), as the destinations matrix does; checked once loaded
  year: !byYear ? null : params.get('rank') === 'latest' ? latestFullYear : Number(params.get('year')) || null,
  scale: pick('scale', ['absolute', 'year', 'busiest'], 'year'),
  // the airports matrix can show cities, and abroad countries; the routes matrix pairs of cities, each a link to its own page
  group: kind === 'airports' ? pick('group', abroad ? ['airport', 'city', 'country'] : ['airport', 'city'], 'airport') : kind === 'toproutes' ? pick('group', ['airport', 'city'], 'airport') : 'airport',
  open: (params.get('open') || '').split(',').filter(Boolean), // the cities opened to list their airports
  ...(kind === 'toproutes' ? bandRange(params.get('from') ?? '0', params.get('to') ?? 'any') : {}), // the routes matrix's distances
};
state.flights = pick('flights', FLIGHTS, defaultFlights(state.measure));
let rows = [];
let loaded = []; // the routes matrix's rows as fetched: rows are those in its distance range
const markets = new Map(); // the routes matrix by city: a market pair's key -> its row (names, distance)
const routesQuery = () => (state.group === 'city' ? 'top_markets_by_year' : page.query);

const ROW_PX = 20;
const unit = () => MATRIX_MEASURES[state.measure].toLowerCase();
const fmtPct = (s) => `${(s * 100).toFixed(s < 0.1 ? 1 : 0)}%`;
const fillField = () => ({ absolute: 'value', year: 'share', busiest: 'peak' }[state.scale]);
const relative = () => state.scale !== 'absolute';
const rankYear = () => (byYear ? state.year : state.rank === 'latest' ? latestFullYear : null);
const grouped = () => (state.group !== 'airport' && kind !== 'toproutes') || aircraftLike; // the routes matrix's cities are rows of their own // rows that open into their parts: cities into airports, families into aircraft

function pushState() {
  const q = new URLSearchParams();
  if (state.measure !== 'passengers') q.set('measure', state.measure);
  if (state.flights !== defaultFlights(state.measure)) q.set('flights', state.flights);
  if (state.service !== 'all') q.set('service', state.service);
  if (state.n !== 50) q.set('n', state.n);
  if (byYear) { if (state.year !== null) q.set('year', state.year); } else if (state.rank !== 'all') q.set('rank', state.rank);
  if (state.scale !== 'year') q.set('scale', state.scale);
  if (state.group !== 'airport') q.set('group', state.group);
  if (abroad) q.set('region', 'abroad');
  if (grouped() && state.open.length) q.set('open', state.open.join(','));
  if (kind === 'toproutes' && state.from !== '0') q.set('from', state.from);
  if (kind === 'toproutes' && state.to !== 'any') q.set('to', state.to);
  const s = q.toString();
  history.replaceState(null, '', `${location.pathname}${replaceSearch(location.search, ['measure', 'flights', 'service', 'n', 'rank', 'year', 'scale', 'group', 'region', 'open', 'from', 'to'], s ? `?${s}` : '')}`);
  carry();
}

// the views line: an airline's views pass their whole query, as its other pages do; the airlines matrix passes the
// settings the airlines table reads too
const carry = () => {
  for (const a of document.querySelectorAll('nav.views a')) {
    if (kind === 'airports') { if (a.pathname === '/airports') a.search = tableSearch(location.search); } // the table takes the measure as its sort
    else if (kind === 'aircraft' || byYear) continue; // the aircraft views share no settings, nor the routes matrix the airports'
    else a.search = kind === 'routes' || kind === 'fleet' ? location.search : sharedQuery(location.search);
  }
};

// a matrix cell's popover rows: the amount, and the share the colour shows when it shows one
const cellRows = (c) => [
  { label: MATRIX_MEASURES[state.measure], value: measureFormat(state.measure, formatCount)(c.value) },
  ...(state.scale === 'year' ? [{ label: 'Share of the year', value: fmtPct(c.share) }] : []),
  ...(state.scale === 'busiest' ? [{ label: "Of the year's biggest", value: fmtPct(c.peak) }] : []),
];

// airlines are named by their legal entity, which is long: label rows with the short name (the full one is the hover text)
let shorts = new Map();
const labelOf = (name) => shorts.get(name) || name;

// a label opens the thing it names: an airline's own page, or a route with this airline picked out
let places = new Map();
let airportInfo = new Map(); // code -> the airports query's row (name, ICAO code, place), for an airport's hover text
const place = (code) => places.get(code) || code;
const pairOf = (route) => route.split(/ [↔→] /);
// the routes matrix's cells open their route with the year marked, as the destinations matrix's do, and a label the route
// with the ranking year marked, if any
function familyHref(name, year = null) {
  if (kind === 'routes') { const [o, d] = pairOf(name); return `/airports/${o}/${d}?split=carrier&highlight=airline:${body.group}${each ? '&dir=out' : ''}`; }
  if (kind === 'toproutes' && state.group === 'city') return markets.has(name) ? `${marketPath(markets.get(name))}${year === null ? '' : `?year=${year}`}` : undefined;
  if (byYear) { const [o, d] = pairOf(name); return `/airports/${o}/${d}${year === null ? '' : `?year=${year}`}`; }
  if (kind === 'airports') return `/airports/${name}/destinations`; // a matrix leads to a matrix
  const id = rows.find((r) => r.group_name === name)?.group_id;
  return id ? `/airlines/${id}` : undefined;
}
const airportTitle = (code) => (airportInfo.has(code) ? airportTip(code, airportInfo) : `${code} · ${rows.find((r) => r.airport === code)?.city || ''}`);
const miles = new Map(); // the routes matrix's route -> its distance
// a city pair: both markets' names, in the order its row's name has them, and its distance
function marketTitle(key) {
  const m = markets.get(key);
  if (!m) return key;
  const names = marketLabel(m).flip ? [m.name_b, m.name_a] : [m.name_a, m.name_b];
  return `${names.join(' – ')}\n${formatCount(m.distance)} miles, its airport pairs' distances weighted by passengers`;
}
const titleOf = (name) => (kind === 'toproutes' && state.group === 'city' ? marketTitle(name)
  : byYear ? `${pairOf(name).map(place).join(' – ')}${miles.has(name) ? `\n${formatCount(miles.get(name))} miles` : ''}`
  : kind === 'routes' ? pairOf(name).map(place).join(' – ') : kind === 'airports' ? airportTitle(name) : name);

// the grouped matrices: a city is its name, opening into its airports (each a link to its destinations matrix); a family is
// its name, opening into its aircraft (each a link to that aircraft's page). Both feed buildCityMatrix rows named dest and market_id
const cityOf = () => new Map(rows.map((r) => [r.airport, r.city]));
let aircraftInfo = new Map(); // aircraft id -> its maker, BTS type and name, for hover text
function groupedRows() {
  if (state.group === 'country') { // abroad: the country is what follows the first comma of the city name
    return rows.map((r) => {
      const country = String(r.city || '').split(', ').slice(1).join(', ');
      return { ...r, dest: r.airport, ...(country ? { market_id: `country:${country}`, group_label: country } : {}) };
    });
  }
  if (!aircraftLike) return rows.map((r) => ({ ...r, dest: r.airport }));
  return rows
    .filter((r) => state.flights === 'all' || r.kind === state.flights)
    .map((r) => ({ ...r, dest: r.aircraft, market_id: slugify(r.family), group_label: r.family, city: r.aircraft_name }));
}
const aircraftTitle = (code, name) => { const i = aircraftInfo.get(code); return i ? `${name}\n${i.maker} · ${i.aircraft_kind}` : name; };
// the airports matrix's city (a BTS market, /airports/cities/<market>, its destinations ranked by this ranking year) or country page,
// counted this way; a "solo:" airport with no market has none
function groupHref(r) {
  const q = new URLSearchParams(dir ? [['dir', dir]] : []);
  if (/^[0-9]{5}$/.test(r.key)) { if (rankYear() !== null) q.set('year', rankYear()); return `/airports/cities/${r.key}${q.size ? `?${q}` : ''}`; }
  if (r.key.startsWith('country:')) return `/countries/${countrySlug(r.key.slice('country:'.length))}${q.size ? `?${q}` : ''}`;
  return null;
}
function drawCities(box) {
  const aircraft = aircraftLike;
  const res = buildCityMatrix(groupedRows(), { ...state, rankYear: rankYear(), hideSmall: !aircraft });
  if (!res.cells.length) { box.textContent = 'Nothing to chart for this selection.'; return; }
  const city = cityOf();
  const byKey = new Map(res.rows.map((r) => [r.key, r]));
  const years = res.years.map(String);
  const labelEvery = years.length <= 15 ? 1 : 5;
  const labels = res.rows.map((r) => {
    if (aircraft) {
      const member = r.kind === 'airport';
      return {
        ...r,
        text: rowLabel(member ? r.name : r.label),
        // the family and aircraft pages read the same measure, flights and service; from an airline's, they pick it out too
        href: (member ? aircraftHref(r.groupKey, r.name) : `/aircraft/${r.key}`) + (kind === 'fleet' ? airlineSearch(body.group, state) : carriedSearch(state)),
        title: member ? aircraftTitle(r.code, r.name) : [r.label, `${r.codes.length} aircraft`, '', ...r.codes.slice(0, 12).map((c) => aircraftInfo.get(c)?.name || c), ...(r.codes.length > 12 ? ['…'] : [])].join('\n'),
      };
    }
    return {
      ...r,
      text: r.kind === 'airport' ? r.code : r.label,
      // a city's or country's name opens its own page, and its ▸ lists its airports here
      href: r.kind === 'airport' ? `/airports/${r.code}/destinations` : r.kind === 'others' ? undefined : groupHref(r) || `#toggle:${r.key}`,
      title: r.kind === 'others' ? [r.label, '', ...r.codes.map((c) => `${c}  ${city.get(c) || ''}`)].join('\n') : r.kind === 'airport' ? airportTitle(r.code) : airportInfo.size ? groupTip(r, airportInfo) : [r.label, '', ...r.codes.map((c) => `${c}  ${city.get(c) || ''}`)].join('\n'),
    };
  });
  const names = new Map(rows.map((r) => [r.aircraft, r.aircraft_name]));
  const data = res.cells.map((c) => {
    const row = byKey.get(c.row);
    const part = (p) => ({ label: aircraft ? names.get(p.dest) || p.dest : p.dest, value: measureFormat(state.measure, formatCount)(p.value) });
    const parts = c.parts && row.codes.length > 1 ? c.parts.slice(0, 5).map(part) : [];
    return { ...c, year: String(c.year), head: aircraft ? (row.kind === 'airport' ? row.name : row.label) : row.kind === 'airport' ? row.code : row.label, rows: [...cellRows(c), ...parts] };
  });
  const width = Math.min(box.clientWidth || 900, 1200);
  const marginLeft = labelMargin(labels.map((l) => l.text), textWidth(box)) + ARROW_SLOT;
  const chart = Plot.plot({
    width,
    height: res.rows.length * ROW_PX + 90,
    marginLeft,
    marginTop: 30,
    padding: 0.08,
    style: { background: 'transparent', fontSize: '12px' },
    x: { type: 'band', domain: years, label: null, axis: 'top', tickSize: 0, tickFormat: (d) => (Number(d) % labelEvery === 0 ? d : '') },
    y: { type: 'band', domain: res.rows.map((r) => r.key), axis: null },
    color: colourOptions(res.cells),
    marks: [
      Plot.cell(data, { x: 'year', y: 'row', fill: fillField() }),
      Plot.cell(data, Plot.pointer({ x: 'year', y: 'row', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, maxRadius: pointerReach({ width, marginLeft, years: years.length, rowPx: ROW_PX }) })),
      Plot.text(labels, {
        y: 'key', text: 'text', title: 'title', href: 'href', frameAnchor: 'left', textAnchor: 'end', dx: -8 - ARROW_SLOT,
        fontWeight: (d) => (d.kind === 'group' ? 600 : 400), fill: 'currentColor', fillOpacity: (d) => (d.kind === 'group' ? 1 : 0.65),
      }),
      disclosureArrows(Plot, labels, (d) => `${d.open ? 'Hide' : 'List'} ${d.label}'s ${aircraft ? 'aircraft' : 'airports'}`),
    ],
  });
  placeKey($('matrix-key'), chart);
  box.append(...attachPopover(chart, {
    content: (d) => ({ title: `${d.head} · ${d.year}`, rows: d.rows }), at: (d) => [d.year, d.row], keyOf: () => ({ kind: 'none' }),
  }));
}

const colourOptions = (cells) => (relative()
  ? { type: 'sqrt', scheme: 'YlOrRd', label: state.scale === 'year' ? `Share of the year's ${unit()}` : `% of the year's biggest`, tickFormat: percentTicks(Math.max(0, ...cells.map((c) => c[fillField()]))) }
  : { type: 'sqrt', scheme: 'YlOrRd', ...millionsAxis(Math.max(0, ...cells.map((c) => c.value)), axisLabel(state.measure, MATRIX_MEASURES[state.measure])) });

// a city pair page's "for the top 10 routes" / "for all 13 routes", for the `count` pairs the measure and year can show
function drawRowsChoice(count) {
  const choice = rowsChoice(count, state.n);
  const span = $('matrix-rows');
  if (!choice.options) { span.textContent = choice.text; return; }
  const select = Object.assign(document.createElement('select'), { id: 'matrix-n' });
  select.setAttribute('aria-label', 'Number of rows');
  for (const o of choice.options) select.append(new Option(o.label, o.value));
  select.value = choice.value;
  select.addEventListener('change', (e) => { state.n = Number(e.target.value); pushState(); draw(); });
  span.replaceChildren(select, ` ${choice.text}`);
}

function draw() {
  $('scale-note').hidden = !relative();
  $('scale-note').textContent = {
    absolute: '',
    year: `Colour shows each ${page.noun}'s share of all ${unit()} that year, counting every ${page.noun} (not just those listed), not the amount itself. Hover over a cell for both.`,
    busiest: `Colour compares each cell with the year's biggest ${page.noun}: the biggest is 100%, one with half as many ${unit()} is 50%. Each year is judged on its own. Hover over a cell for both.`,
  }[state.scale];
  if (!byYear) $('matrix-rank').options[1].textContent = `${latestFullYear} only`;
  $('rank-note').textContent = `Rows are ranked by the measure ${rankYear() === null ? 'summed over all years' : `in ${rankYear()} alone, so ones that did not fly then are not shown`}. Each cell is one ${page.noun} in one year; blank means none. Freight is in short tons (2,000 lb).${kind === 'airlines' ? ' Click an airline\'s name to see its routes. Airlines that merged are counted together for every year, including years before the merger.' : ''}${kind === 'airports' ? (state.group === 'country' ? ' A country adds up its airports; click one to see its page, or ▸ to list them here (any under 2% of the country\'s flights, passengers and freight are added up as "other airports"), and an airport\'s code to see which US airports it flies to.' : state.group === 'city' ? ' A city is a BTS city market (New York is JFK, LaGuardia and Newark); click one to see its page, or ▸ to list its airports here (any under 2% of the city\'s flights, passengers and freight are added up as "other airports"), and an airport\'s code to see where it flies.' : ' Click an airport\'s code to see where it flies.') : ''}${aircraftLike ? ' Each row is an aircraft family; ▸ opens it into the aircraft in it, BTS\'s own entries such as the Boeing 737-800. Each family is counted with all its versions.' : ''}${kind === 'fleet' ? ' Click a name to see that family or aircraft split by airline, with this one picked out.' : ''}${kind === 'routes' ? (each ? ' Each row is one direction of an airport pair, as flown; a year shows when the airline flew it at least 12 times.' : ' Each row is an airport pair, both directions together; a year shows when the airline flew it at least 24 times, roughly monthly each way.') + ' A merged airline counts its members together for every year. Click a route to see it with this airline picked out.' : ''}${kind === 'toproutes' ? (state.group === 'city'
    ? ' Each row is a pair of BTS city markets (New York is JFK, LaGuardia and Newark), both directions together, flown by any airline; flights within one market are left out. A pair\'s distance is its airport pairs\' distances weighted by passengers, which puts it in one distance range. Click one to see its airport pairs.'
    : ' Each row is an airport pair, both directions together, flown by any airline; its distance is in its hover text. Click a route to see it.') : ''}${kind === 'citypair' ? ' Each row is an airport pair, both directions together, flown by any airline, and each cell its share of all flying between the two cities that year' + (body.a || body.b ? ', counting the airports not shown' : '') + '; its distance is in its hover text. Click a route to see it.' : ''}`;

  const box = $('matrix');
  box.replaceChildren();
  placeKey($('matrix-key'), null);
  if (grouped()) { drawCities(box); useLabelTips(box); return; }
  if (kind === 'toproutes') rows = state.group === 'city' ? topMarketRows(loaded, state) : topRouteRows(loaded, state);
  const matrixRows = rollupRows(rows, { key: page.key, kind: kind === 'routes' || byYear ? 'all' : state.flights });
  if (kind === 'citypair') drawRowsChoice(buildMatrix(matrixRows, { ...state, n: Infinity, rankYear: rankYear() }).dests.length);
  const res = buildMatrix(matrixRows, { ...state, rankYear: rankYear() });
  if (!res.cells.length) { box.textContent = 'Nothing to chart for this selection.'; return; }
  const years = res.years.map(String);
  const labelEvery = years.length <= 15 ? 1 : 5;
  const data = res.cells.map((c) => ({ ...c, year: String(c.year), ...(byYear ? { href: familyHref(c.dest, c.year) } : {}) }));
  const width = Math.min(box.clientWidth || 900, 1200);
  const marginLeft = labelMargin(res.dests.map(labelOf), textWidth(box)); // as wide as the longest label, from airport codes to airline names
  const chart = Plot.plot({
    width,
    height: res.dests.length * ROW_PX + 90,
    marginLeft,
    marginTop: 30,
    padding: 0.08,
    style: { background: 'transparent', fontSize: '12px' },
    x: { type: 'band', domain: years, label: null, axis: 'top', tickSize: 0, tickFormat: (d) => (Number(d) % labelEvery === 0 ? d : '') },
    y: { type: 'band', domain: res.dests, axis: null },
    color: relative()
      ? { type: 'sqrt', scheme: 'YlOrRd', label: state.scale === 'year' ? `Share of the year's ${unit()}` : `% of the year's biggest`, tickFormat: percentTicks(Math.max(0, ...res.cells.map((c) => c[fillField()]))) }
      : { type: 'sqrt', scheme: 'YlOrRd', ...millionsAxis(Math.max(0, ...res.cells.map((c) => c.value)), axisLabel(state.measure, MATRIX_MEASURES[state.measure])) },
    marks: [
      Plot.cell(data, { x: 'year', y: 'dest', fill: fillField(), href: 'href' }),
      Plot.cell(data, Plot.pointer({ x: 'year', y: 'dest', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, maxRadius: pointerReach({ width, marginLeft, years: years.length, rowPx: ROW_PX }) })),
      Plot.text(res.dests.map((d) => ({ dest: d, label: labelOf(d), href: familyHref(d, byYear ? rankYear() : null), title: titleOf(d) })), { y: 'dest', text: 'label', title: 'title', href: 'href', frameAnchor: 'left', textAnchor: 'end', dx: -8, fill: 'currentColor' }),
    ],
  });
  placeKey($('matrix-key'), chart);
  box.append(...attachPopover(chart, {
    content: (d) => ({ title: `${labelOf(d.dest)} · ${d.year}`, rows: cellRows(d) }), at: (d) => [d.year, d.dest], keyOf: () => ({ kind: 'none' }),
    link: (d) => d.href || null,
  }));
  useLabelTips(box);
}

function fillControls() {
  const measure = $('matrix-measure');
  for (const [k, label] of Object.entries(MATRIX_MEASURES)) measure.append(new Option(label.toLowerCase(), k));
  measure.value = state.measure;
  if ($('matrix-kind')) $('matrix-kind').value = state.flights;
  if ($('matrix-service')) $('matrix-service').value = state.service;
  if ($('matrix-n') && kind !== 'citypair') $('matrix-n').value = String(state.n); // a city pair's is redrawn with the chart (drawRowsChoice)
  if (!byYear) $('matrix-rank').value = state.rank;
  for (const radio of document.querySelectorAll('input[name="scale"]')) {
    radio.checked = radio.value === state.scale;
    radio.addEventListener('change', () => { state.scale = radio.value; pushState(); draw(); });
  }
  const bind = (id, field, convert = String) => $(id).addEventListener('change', (e) => { state[field] = convert(e.target.value); pushState(); draw(); });
  // flights left at their default follow the measure (src/flights.js)
  const menus = { measure: $('matrix-measure'), flights: $('matrix-kind') };
  for (const [field, select] of Object.entries(menus)) {
    select?.addEventListener('change', (e) => {
      Object.assign(state, settle(state, { measure: state.measure, flights: state.flights, [field]: e.target.value }));
      setMenus(menus, state, field);
      pushState();
      draw();
    });
  }
  // US or abroad changes what the directions mean and what the page says, so the page reloads, with the way and flights back to their defaults
  $('matrix-region')?.addEventListener('change', (e) => {
    const q = new URLSearchParams(location.search);
    q.delete('dir'); q.delete('service'); q.delete('open');
    if (e.target.value === 'abroad') q.set('region', 'abroad'); else { q.delete('region'); if (q.get('group') === 'country') q.delete('group'); }
    location.search = q.size ? `?${q}` : '';
  });
  if ($('matrix-service')) bind('matrix-service', 'service');
  if ($('matrix-group') && kind === 'toproutes') {
    // airport pairs or city pairs are different queries: the new one is fetched
    $('matrix-group').value = state.group;
    $('matrix-group').addEventListener('change', async (e) => {
      state.group = e.target.value;
      pushState();
      $('matrix').textContent = 'Loading chart…';
      try { await loadRoutes(); } catch (err) { console.error(err); $('matrix').textContent = 'Could not load the chart data.'; return; }
      draw();
    });
  } else if ($('matrix-group')) { $('matrix-group').value = state.group; bind('matrix-group', 'group'); }
  if ($('matrix-n') && kind !== 'citypair') bind('matrix-n', 'n', Number);
  if (!byYear) bind('matrix-rank', 'rank');
  else if (kind === 'citypair') {
    // a city pair's page has all its rows already: a new year only ranks them again
    $('matrix-rank').addEventListener('change', (e) => { state.year = e.target.value ? Number(e.target.value) : null; pushState(); draw(); });
  } else {
    // a new year asks for the pairs that could be its top 50
    $('matrix-rank').addEventListener('change', async (e) => {
      state.year = e.target.value ? Number(e.target.value) : null;
      pushState();
      try { await loadRoutes(); } catch (err) { console.error(err); $('matrix').textContent = 'Could not load the chart data.'; return; }
      draw();
    });
  }
  if ($('matrix-from')) {
    for (const b of BAND_FROM) $('matrix-from').append(new Option(b.label, b.value));
    for (const b of BAND_TO) $('matrix-to').append(new Option(b.label, b.value));
    const showRange = () => { $('matrix-from').value = state.from; $('matrix-to').value = state.to; };
    showRange();
    for (const id of ['matrix-from', 'matrix-to']) {
      $(id).addEventListener('change', () => { Object.assign(state, bandRange($('matrix-from').value, $('matrix-to').value)); showRange(); pushState(); draw(); });
    }
  }
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

attachLabelTips($('matrix'), $('label-tip'));

// the routes matrix's rows for its ranking year: the pairs that could be among its top 50 then, with every year of each
async function loadRoutes() {
  queryParams.year = state.year ?? '';
  setDataLink(routesQuery(), queryParams);
  const res = await fetchRows(queryUrl(routesQuery(), queryParams));
  loaded = res.rows;
  if (state.group === 'city') {
    for (const r of loaded) {
      if (r.rest || markets.has(marketKey(r))) continue;
      markets.set(marketKey(r), r);
      shorts.set(marketKey(r), marketLabel(r).label); // a row is keyed by its market ids, and named by its cities
    }
  } else for (const r of topRouteRows(loaded)) if (!r.rest) miles.set(r.route, r.distance);
  return res;
}

async function main() {
  if (kind === 'toproutes') queryParams.year = state.year ?? '';
  setDataLink(kind === 'toproutes' ? routesQuery() : page.query, queryParams);
  fillControls();
  carry();
  try {
    const [res, airports] = await Promise.all([
      kind === 'toproutes' ? loadRoutes() : fetchRows(queryUrl(page.query, queryParams)),
      kind === 'routes' || byYear || kind === 'airports' ? fetchRows(queryUrl('airports')).catch(() => null) : null, // place and airport names are only hover text
    ]);
    rows = kind === 'routes' ? routeRows(res.rows, { each }) : kind === 'citypair' ? marketPairRows(res.rows, { a: body.a, b: body.b }) : res.rows;
    if (kind === 'citypair') for (const r of rows) if (r.distance && !r.rest) miles.set(r.route, r.distance);
    if (byYear) {
      // every full year can rank the routes (the totals rows have them all); a year from the address that isn't one ranks by all
      const years = fullYears(kind === 'toproutes' ? loaded : rows, latestFullYear);
      $('matrix-rank').append(...years.map((y) => new Option(String(y), String(y))));
      if (state.year !== null && !years.includes(state.year)) { state.year = null; pushState(); if (kind === 'toproutes') await loadRoutes(); }
      $('matrix-rank').value = state.year === null ? '' : String(state.year);
    }
    if (airports) places = new Map(airports.rows.map((r) => [r.code, r.place]));
    if (airports) airportInfo = new Map(airports.rows.map((r) => [r.code, r]));
    if (aircraftLike) aircraftInfo = new Map(rows.map((r) => [r.aircraft, { name: r.aircraft_name, maker: r.maker, aircraft_kind: r.aircraft_kind }]));
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
