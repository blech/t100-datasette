import * as Plot from '/static/charts/vendor/plot.js';
import { shortenField } from '/static/charts/src/names.js';
import { slugify } from '/static/charts/src/rollup.js';
import { buildSeries, aggregateTable, labelFor, MEASURES, SPLITS } from '/static/charts/src/series.js';
import { formatCount, formatTons, exactCount, millionsAxis } from '/static/common/numbers.js';
import { queryUrl, fetchRows } from '/static/globe/src/api.js';
import { parseSpan, yearDomain } from '/static/charts/src/span.js';
import { periodRows, attachPopover } from '/static/common/popover.js';
import { attachHighlight, parseHighlight, highlightedSeries, highlightMessage } from '/static/common/highlight.js';
import { seriesColours, isDark } from '/static/common/palette.js';
import { setDataLink } from '/static/common/datalink.js';
import { parseDir, routeCountWord, noFlights, setDir } from '/static/common/direction.js';

// the tallest stack, which sets the y axis's scale
const stackMax = (points, key, value = (p) => p.value) => {
  const sums = new Map();
  for (const p of points) sums.set(p[key], (sums.get(p[key]) || 0) + value(p));
  return Math.max(0, ...sums.values());
};

const { origin, dest, year: yearText, dir } = document.body.dataset;
const year = yearText ? Number(yearText) : null;
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
// the server wrote the headings for this direction; changing it reloads the page
const measures = { ...MEASURES, deps: routeCountWord(dir) };
const state = {
  measure: Object.hasOwn(measures, params.get('measure')) ? params.get('measure') : 'passengers',
  split: Object.hasOwn(SPLITS, params.get('split')) ? params.get('split') : 'carrier',
  span: parseSpan(params.get('span')),
};
const bounds = { min: Number(document.body.dataset.minYear), max: Number(document.body.dataset.maxYear) };
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const routePath = (y) => `/airports/${origin}/${dest}${y ? `/${y}` : ''}`;
// the route's two views share this script: over time (the chart) and the table
const onTable = !document.getElementById('route-chart');
const viewPath = (y) => `${routePath(y)}${onTable ? '/table' : ''}`;

// links to the route's other views, years and reverse direction keep the current settings (measure, split, span)
function carryQuery() {
  for (const a of document.querySelectorAll('nav.views a, #years a, #reverse-link')) a.search = location.search;
}

let allRows = [];   // the route, every year
let viewRows = [];  // the rows behind the chart and table: all years, or one year by month
const fullNames = new Map(); // short carrier name -> BTS's full name

function pushState() {
  const q = new URLSearchParams(location.search);
  q.set('measure', state.measure);
  q.set('split', state.split);
  if (state.span === 'flown') q.delete('span'); else q.set('span', state.span);
  history.replaceState(null, '', `${location.pathname}?${q}`);
  carryQuery();
}

// with one direction chosen and nothing in it (the controls stay hidden), point the way back to both, keeping the other settings
function offerBothWays() {
  if (!dir) return;
  const q = new URLSearchParams(location.search);
  q.delete('dir');
  const both = Object.assign(document.createElement('a'), { href: `${location.pathname}${q.size ? `?${q}` : ''}`, textContent: 'both directions' });
  $('status').append(' See ', both, '.');
}

function fillSelect(select, options, value) {
  for (const [k, label] of Object.entries(options)) select.append(new Option(label, k));
  select.value = value;
}

// "Highlighting Delta (incl. Northwest) · clear", or why it isn't shown; hidden when there is nothing to say
// the data behind the page, narrowed to the airline it's highlighting, if any
function dataLink() {
  const group = parseHighlight(location.search)?.id ?? '';
  if (year === null) setDataLink('route', { origin, dest, dir, group });
  else setDataLink('route_year', { origin, dest, year, dir, group });
}

function highlightLine(highlight, wanted, byAirline) {
  const line = $('highlight-line');
  if (!line) return;
  const name = highlight && allRows.find((r) => r.group_id === highlight.id)?.group_name;
  const msg = highlightMessage({ highlight, name, byAirline, splitLabel: SPLITS[state.split].toLowerCase(), shown: wanted.size > 0, dir });
  line.hidden = !msg;
  if (!msg) return;
  const clear = Object.assign(document.createElement('a'), { href: '#', textContent: 'clear' });
  clear.addEventListener('click', (e) => {
    e.preventDefault();
    const q = new URLSearchParams(location.search);
    q.delete('highlight');
    history.replaceState(null, '', `${location.pathname}${q.size ? `?${q}` : ''}`);
    carryQuery();
    dataLink();
    drawChart();
  });
  // the other way, with the highlight: the reverse-direction link in the sentence below carries the query
  const other = () => Object.assign(document.createElement('a'), { href: $('reverse-link').href, textContent: $('reverse-link').textContent });
  line.replaceChildren(msg.text, ...(msg.reverse ? ['; try the other way, ', other()] : []), ' · ', clear);
}

function drawChart() {
  const monthly = year !== null;
  // an airline carried here by ?highlight= (from its own pages) is picked out, and never folded into Other
  const highlight = parseHighlight(location.search);
  const byAirline = state.split === 'carrier' || state.split === 'both';
  const wanted = byAirline ? highlightedSeries(viewRows, highlight, (r) => labelFor(r, state.split)) : new Set();
  // split by carrier the airline is kept as a series of its own; split by carrier and aircraft it may fly a dozen
  // types, so only its pairings already among the largest are picked out, and the chart keeps its shape
  const res = buildSeries(viewRows, { ...state, periodKey: monthly ? 'month' : 'year', keep: state.split === 'carrier' ? wanted : new Set() });
  const pinned = new Set([...wanted].filter((l) => res.series.includes(l)));
  highlightLine(highlight, pinned, byAirline);
  const box = $('route-chart-plot');
  box.replaceChildren();
  if (!res.points.length) { box.textContent = 'No data to chart for this selection.'; return; }
  const domain = monthly ? MONTHS.map((_, i) => String(i + 1)) : yearDomain(res.periods, { span: state.span, ...bounds }).map(String);
  const labelEvery = monthly || domain.length <= 15 ? 1 : 5;
  const data = res.points.map((p) => ({ ...p, x: String(p.period), href: monthly ? null : routePath(p.period) }));
  const x = {
    label: null, domain,
    tickFormat: (d) => (monthly ? MONTHS[Number(d) - 1] : Number(d) % labelEvery === 0 ? d : ''),
  };
  const fmt = state.measure === 'load_factor' ? (v) => `${v.toFixed(1)}%` : (v) => formatCount(v);
  const tips = periodRows(data, { key: (p) => p.x, order: res.stackable ? res.series : null, format: fmt });
  const pointer = Plot.ruleX(tips, Plot.pointerX({ x: 'period', strokeOpacity: 0 }));
  // stacked in the legend's order, biggest at the bottom and "Other" on top
  const bars = Plot.barY(data, { x: 'x', y: 'value', fill: 'series', order: res.series, ...(monthly ? {} : { href: 'href' }) });
  const marks = res.stackable
    ? [bars, Plot.ruleY([0]), pointer]
    : [Plot.lineY(data, { x: 'x', y: 'value', stroke: 'series' }), Plot.dot(data, { x: 'x', y: 'value', stroke: 'series' }), Plot.ruleY([0]), pointer];
  const chart = Plot.plot({
    width: Math.min(box.clientWidth || 800, 1000),
    height: 420,
    marginLeft: 64,
    style: { background: 'transparent', fontSize: '12px' },
    x: { ...x, type: res.stackable ? 'band' : 'point' },
    y: state.measure === 'load_factor'
      ? { grid: true, label: measures.load_factor, tickFormat: 'd', domain: [0, 100] }
      : { grid: true, ...millionsAxis(res.stackable ? stackMax(res.points, 'period') : Math.max(0, ...res.points.map((p) => p.value)), measures[state.measure]) },
    color: { legend: true, ...seriesColours(res.series, isDark()) },
    marks,
  });
  if (res.stackable) attachHighlight(chart, { pinned }); // load factor's lines aren't a stack
  box.append(...attachPopover(chart, {
    content: (d) => ({ title: monthly ? `${MONTH_NAMES[Number(d.period) - 1]} ${year}` : d.period, rows: d.rows }),
    at: (d) => [d.period, d.top],
    keyOf: res.stackable ? null : (label) => ({ kind: 'line', colour: chart.scale('color').apply(label) }),
    link: (d) => (monthly ? null : routePath(Number(d.period))),
  }));
  $('chart-note').textContent = monthly ? '' : 'Click a bar to see that year month by month.';
}

function cell(text, className, title) {
  const td = document.createElement('td');
  td.textContent = text;
  if (className) td.className = className;
  if (title !== undefined) td.title = title;
  return td;
}

// a measured count, rounded, with the exact figure on hover
const countCell = (n, noun) => cell(formatCount(n), 'num', `${exactCount(n)} ${noun}`);
const tonsCell = (pounds) => cell(formatTons(pounds), 'num', `${exactCount(pounds)} lb`);

// a name that opens the airline's or aircraft family's own page, when the data says which it is
function linkCell(text, href, title) {
  const td = cell('', 'left');
  if (!href) { td.textContent = text; return td; }
  const a = document.createElement('a');
  a.href = href;
  a.textContent = text;
  a.title = title;
  td.append(a);
  return td;
}

// the table follows the chart's split: its name columns, and its heading
const TABLE_NAMES = { carrier: ['Carrier'], aircraft: ['Aircraft'], both: ['Carrier', 'Aircraft'], none: [''] };
const TABLE_HEADINGS = { carrier: 'Carriers', aircraft: 'Aircraft', both: 'Carriers and aircraft', none: 'Totals' };
const NUMBER_COLUMNS = [routeCountWord(dir), 'Seats', 'Passengers', 'Load factor', 'Freight'];

function th(text, className) {
  const el = Object.assign(document.createElement('th'), { scope: 'col', className, textContent: text });
  return el;
}

function drawTable() {
  const head = document.querySelector('#route-table thead');
  const headRow = document.createElement('tr');
  headRow.append(...TABLE_NAMES[state.split].map((n) => th(n, 'left')), ...NUMBER_COLUMNS.map((n) => th(n, 'num')));
  head.replaceChildren(headRow);
  const body = document.querySelector('#route-table tbody');
  body.replaceChildren();
  for (const t of aggregateTable(viewRows, state.split)) {
    const tr = document.createElement('tr');
    const names = state.split === 'none' ? [cell('All', 'left')] : [
      ...(t.carrier !== null ? [linkCell(t.carrier, t.groupId && `/airlines/${t.groupId}`, `${fullNames.get(t.carrier) || t.carrier}: all of this airline's flying`)] : []),
      ...(t.aircraft !== null ? [linkCell(t.aircraft, t.family && `/aircraft/${slugify(t.family)}${t.groupId ? `?split=airline&highlight=airline:${t.groupId}` : ''}`, `${t.family}, all versions`)] : []),
    ];
    tr.append(
      ...names,
      countCell(t.deps, routeCountWord(dir).toLowerCase()),
      countCell(t.seats, 'seats'),
      countCell(t.passengers, 'passengers'),
      cell(t.loadFactor === null ? '–' : `${t.loadFactor.toFixed(1)}%`, 'num'),
      tonsCell(t.freight * 2000),
    );
    body.append(tr);
  }
  $('table-heading').textContent = `${TABLE_HEADINGS[state.split]}${year === null ? ', all years' : ` in ${year}`}`;
}

function drawYears(years) {
  const nav = $('years');
  nav.replaceChildren();
  const add = (href, text, current) => {
    const a = document.createElement('a');
    a.href = href;
    a.textContent = text;
    if (current) a.setAttribute('aria-current', 'page');
    nav.append(a);
  };
  if (year !== null) {
    const i = years.indexOf(year);
    if (i > 0) add(viewPath(years[i - 1]), `‹ ${years[i - 1]}`);
    add(viewPath(null), 'All years');
    if (i >= 0 && i < years.length - 1) add(viewPath(years[i + 1]), `${years[i + 1]} ›`);
  } else if (years.length) {
    add(viewPath(years.at(-1)), `Latest: ${years.at(-1)}`);
  }
  carryQuery();
}

async function main() {
  try {
    const all = await fetchRows(queryUrl('route', { origin, dest, dir }));
    allRows = all.rows;
    viewRows = allRows;
    if (year !== null) {
      const monthly = await fetchRows(queryUrl('route_year', { origin, dest, year, dir }));
      viewRows = monthly.rows;
    }
    // long legal names ("Hyannis Air Service, Inc. dba Cape Air") crowd the chart and table: show short ones, keep the full as hover text
    for (const [short, full] of shortenField([allRows, viewRows], 'carrier')) fullNames.set(short, full);
  } catch (err) {
    console.error(err);
    $('status').textContent = 'Could not load the data. Try again in a moment.';
    $('route-chart-plot').textContent = '';
    return;
  }
  if (!allRows.length) {
    $('status').textContent = `${noFlights(origin, dest, dir)} in the data.`;
    carryQuery();
    offerBothWays();
    return;
  }
  const years = [...new Set(allRows.map((r) => Number(r.year)))].sort((a, b) => a - b);
  drawYears(years);
  if (year !== null && !viewRows.length) {
    $('status').textContent = `${noFlights(origin, dest, dir)} in ${year}.`;
    offerBothWays();
    return;
  }
  const mapLink = $('map-link');
  if (mapLink) mapLink.href = `/airports/${origin}/globe${year !== null ? `?year=${year}` : ''}`;
  dataLink();
  fillSelect($('chart-split'), SPLITS, state.split);
  $('chart-dir').addEventListener('change', (e) => setDir(e.target.value));
  $('chart-split').addEventListener('change', (e) => { state.split = e.target.value; pushState(); if (onTable) drawTable(); else drawChart(); });
  if (onTable) {
    $('route-table').hidden = false;
    drawTable();
    return;
  }
  fillSelect($('chart-measure'), measures, state.measure);
  $('chart-measure').addEventListener('change', (e) => { state.measure = e.target.value; pushState(); drawChart(); });
  document.addEventListener('t100:theme', () => drawChart());
  $('chart-span').value = state.span;
  $('chart-span').addEventListener('change', (e) => { state.span = e.target.value; pushState(); drawChart(); });
  $('chart-span-label').hidden = year !== null;  // a single year is shown by month; there is no span to choose
  $('route-chart').hidden = false;
  drawChart();
}

main();
