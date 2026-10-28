import * as Plot from '/static/charts/vendor/plot.js';
import { setDataLink } from '/static/common/datalink.js';
import { MATRIX_MEASURES } from '/static/charts/src/matrix.js';
import { sizeSeries, placeCounts, classifyChanges, summariseChanges, airlineList, changeSort, sortChanges } from '/static/charts/src/airport.js';
import { formatYearMonth } from '/static/charts/src/airline.js';
import { airportGone, flownText, mostText } from '/static/charts/src/gone.js';
import { shortName } from '/static/charts/src/names.js';
import { queryUrl, fetchRows } from '/static/globe/src/api.js';
import { periodRows, attachPopover } from '/static/common/popover.js';
import { attachHighlight } from '/static/common/highlight.js';
import { palette, seriesColours, isDark } from '/static/common/palette.js';
import { formatCount, exactCount, millionsAxis } from '/static/common/numbers.js';
import { replaceSearch } from '/static/nav/src/state.js';

// the airport's two new views share this script: over time (how big, how many places) and what changed
const origin = document.body.dataset.origin;
const firstYear = Number(document.body.dataset.firstYear) || null;
const lastYear = Number(document.body.dataset.lastYear) || null;
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const pick = (key, allowed, fallback) => (allowed.includes(params.get(key)) ? params.get(key) : fallback);

const unit = (m) => MATRIX_MEASURES[m].toLowerCase().replace(/ \(.*/, '');
const yearPopover = { content: (d) => ({ title: d.period, rows: d.rows }), at: (d) => [d.period, d.top] };
const plot = (box, options, popover) => {
  const chart = Plot.plot({
    width: Math.min(box.clientWidth || 900, 1100), height: 320, marginLeft: 64,
    style: { background: 'transparent', fontSize: '12px' }, ...options,
  });
  attachHighlight(chart);
  box.replaceChildren(...(popover ? attachPopover(chart, popover) : [chart]));
  return chart;
};
// the tallest stack, which sets the y axis's scale
const stackMax = (points) => {
  const sums = new Map();
  for (const p of points) sums.set(p.year, (sums.get(p.year) || 0) + p.value);
  return Math.max(0, ...sums.values());
};
function yearAxis(years) {
  const shown = [...new Set(years)].sort((a, b) => a - b).map(String);
  const every = shown.length <= 15 ? 1 : 5;
  return { type: 'band', domain: shown, label: null, tickFormat: (d) => (Number(d) % every === 0 ? d : '') };
}

// the page's own settings in the address, defaults left out; the theme and anything carried stay
function remember(keys, values) {
  const q = new URLSearchParams();
  for (const [k, [v, fallback]] of Object.entries(values)) if (v !== fallback) q.set(k, v);
  const s = q.toString();
  history.replaceState(null, '', `${location.pathname}${replaceSearch(location.search, keys, s ? `?${s}` : '')}`);
}

// --- over time ---

let size = [];
let places = [];

function drawSize() {
  const measure = $('ap-measure').value, flights = $('ap-flights').value, split = $('ap-split').value;
  const res = sizeSeries(size, { measure, flights, split });
  const box = $('size-chart');
  if (!res.points.length) { box.textContent = `No ${unit(measure)} for this selection.`; return; }
  const names = split === 'airline' ? res.series.map((n) => (n === 'Other' ? n : shortName(n))) : res.series;
  const nameOf = new Map(res.series.map((n, i) => [n, names[i]]));
  const data = res.points.map((p) => ({ year: String(p.year), series: nameOf.get(p.series), value: p.value }));
  const p = palette(isDark());
  const colour = split === 'airline' ? seriesColours(names, isDark())
    : { domain: names, range: names.map((n) => (split === 'kind' ? p.kind[n] : p.service[n])) };
  const chart = plot(box, {
    x: yearAxis(res.points.map((pt) => pt.year)),
    y: { ...millionsAxis(stackMax(data), MATRIX_MEASURES[measure]), grid: true },
    color: { ...colour, legend: true },
    marks: [
      Plot.barY(data, { x: 'year', y: 'value', fill: 'series', order: names }),
      Plot.ruleY([0]),
      Plot.ruleX(periodRows(data, { key: (d) => d.year, order: names, format: (v) => formatCount(v) }), Plot.pointerX({ x: 'period', strokeOpacity: 0 })),
    ],
  }, yearPopover);
  // each named airline in the legend opens its page, showing the same measure for the same flights
  if (split !== 'airline') return;
  const idOf = new Map([...res.links].map(([name, id]) => [nameOf.get(name), id]));
  const q = new URLSearchParams();
  if (measure !== 'passengers') q.set('measure', measure);
  if (flights !== 'passenger') q.set('flights', flights);
  const search = q.size ? `?${q}` : '';
  for (const sw of chart.querySelectorAll('[class*="-swatch"]:not([class*="-swatches"])')) {
    const id = idOf.get(sw.textContent.trim());
    const text = [...sw.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
    if (!id || !text) continue;
    const a = Object.assign(document.createElement('a'), { href: `/airlines/${id}${search}`, textContent: text.textContent });
    text.replaceWith(a);
  }
}

function drawPlaces() {
  const counts = placeCounts(places, { min: Number($('ap-min').value) });
  const box = $('places-chart');
  if (!counts.length) { box.textContent = 'No destinations at that level.'; return; }
  const series = ['domestic', 'international'].filter((s) => counts.some((c) => c.service === s));
  const p = palette(isDark());
  const data = counts.map((c) => ({ year: String(c.year), series: c.service, value: c.count }));
  plot(box, {
    x: yearAxis(counts.map((c) => c.year)), y: { label: 'Destinations', grid: true },
    color: { domain: series, range: series.map((s) => p.service[s]), legend: true },
    marks: [
      Plot.barY(data, { x: 'year', y: 'value', fill: 'series', order: series }),
      Plot.ruleY([0]),
      Plot.ruleX(periodRows(data, { key: (d) => d.year, order: series, format: (v) => exactCount(v) }), Plot.pointerX({ x: 'period', strokeOpacity: 0 })),
    ],
  }, yearPopover);
}

async function overTime() {
  for (const [k, label] of Object.entries(MATRIX_MEASURES)) $('ap-measure').append(new Option(label.toLowerCase(), k));
  $('ap-measure').value = pick('measure', Object.keys(MATRIX_MEASURES), 'passengers');
  $('ap-flights').value = pick('flights', ['passenger', 'freight', 'all'], 'passenger');
  $('ap-split').value = pick('split', ['service', 'kind', 'airline'], 'service');
  $('ap-min').value = pick('min', ['1', '12', '52', '365'], '12');
  const save = () => remember(['measure', 'flights', 'split', 'min'], {
    measure: [$('ap-measure').value, 'passengers'], flights: [$('ap-flights').value, 'passenger'],
    split: [$('ap-split').value, 'service'], min: [$('ap-min').value, '12'],
  });
  setDataLink('airport_size', { origin, group: '' });
  try {
    const [s, p] = await Promise.all([
      fetchRows(queryUrl('airport_size', { origin })),
      fetchRows(queryUrl('routes_by_year', { origin, min_deps: 1 })),
    ]);
    size = s.rows;
    places = p.rows;
  } catch (err) {
    $('size-chart').textContent = $('places-chart').textContent = 'Could not load the chart data.';
    return;
  }
  drawSize();
  drawPlaces();
  for (const id of ['ap-measure', 'ap-flights', 'ap-split']) $(id).addEventListener('change', () => { save(); drawSize(); });
  $('ap-min').addEventListener('change', () => { save(); drawPlaces(); });
  document.addEventListener('t100:theme', () => { drawSize(); drawPlaces(); });
}

// --- what changed ---

let changes = [];
let sortChoice = null; // the column last asked for; each status falls back to its own default where it can't sort by it

const cell = (text, cls) => { const td = document.createElement('td'); td.textContent = text; if (cls) td.className = cls; return td; };
const deps = (n) => { const td = cell(formatCount(n), 'num'); td.title = `${exactCount(n)} departures`; return td; };
// a header row; a column with a sort key is a button (the busiest-airports table's), marked when the list is sorted by it
const head = (labels, { sortable = [], sorted = null, onSort = () => {} } = {}) => {
  const tr = document.createElement('tr');
  for (const [text, cls, key] of labels) {
    const th = document.createElement('th');
    th.className = cls;
    th.scope = 'col';
    if (key && sortable.includes(key)) {
      const button = Object.assign(document.createElement('button'), { type: 'button', textContent: text });
      button.addEventListener('click', () => onSort(key));
      th.append(button);
      if (key === sorted) th.setAttribute('aria-sort', 'descending');
    } else th.textContent = text;
    tr.append(th);
  }
  return tr;
};

let saveChanges = () => {};

// "dropped at any point" (airport_gone), fetched the first time it's wanted for the years, minimum and view on screen
const gone = new Map();
const goneParams = (show) => ({ origin, a: $('ap-a').value, b: $('ap-b').value, min: $('ap-min').value, show });
function goneRows(show) {
  const params = goneParams(show);
  const key = JSON.stringify(params);
  if (!gone.has(key)) {
    gone.set(key, fetchRows(queryUrl('airport_gone', params)).then((res) => res.rows, (err) => { gone.delete(key); throw err; }));
  }
  return gone.get(key);
}

// the name cell: an airline group (linked unless unknown), or a destination with its city
function nameCell(show, id, name) {
  const td = cell('', 'left');
  if (show === 'airlines') {
    if (id === 'unknown') td.textContent = shortName(name);
    else td.append(Object.assign(document.createElement('a'), { href: `/airlines/${id}`, textContent: shortName(name), title: name }));
  } else {
    td.append(Object.assign(document.createElement('a'), { href: `/airports/${origin}/${id}`, textContent: id }),
      Object.assign(document.createElement('small'), { textContent: name ? ` ${name}` : '' }));
  }
  return td;
}

let drawing = 0;
async function drawTable() {
  const id = ++drawing;
  const show = $('ap-show').value, status = $('ap-status').value, min = Number($('ap-min').value);
  const a = $('ap-a').value, b = $('ap-b').value;
  const table = $('change-table');
  const sorted = changeSort(status, sortChoice);
  const third = show === 'airlines' ? 'Destinations' : 'Airlines';
  let items, columns, row;
  if (status === 'gone') {
    setDataLink('airport_gone', goneParams(show));
    try {
      items = airportGone(await goneRows(show), { min });
    } catch (err) {
      console.error(err);
      if (id === drawing) table.tBodies[0].innerHTML = '<tr><td class="left" colspan="5">Could not load the data.</td></tr>';
      return;
    }
    if (id !== drawing) return;
    columns = [[show === 'airlines' ? 'Airline' : 'Destination', 'left'], [`${a} departures`, 'num'], ['Most in a year', 'num', 'peak'],
      [third, show === 'airlines' ? 'num' : 'left'], [show === 'airlines' ? 'Flown here' : 'Flown', 'left', 'when']];
    row = (x) => {
      const most = cell(mostText(x), 'num');
      most.title = `${exactCount(x.peakDeps)} departures in ${x.peakYear}`;
      return [nameCell(show, x.code, x.name), deps(x.deps_a), most,
        show === 'airlines' ? cell(exactCount(x.places), 'num') : cell(airlineList(x.members.map(shortName)), 'left'), cell(flownText(x), 'left')];
    };
  } else {
    setDataLink('airport_changes', { origin, a, b, group: '' });
    items = classifyChanges(changes, { min, show }).filter((x) => x.status === status);
    const when = status === 'added' ? 'First flown' : 'Last flown';
    columns = [[show === 'airlines' ? 'Airline' : 'Destination', 'left'], [`${a} departures`, 'num', 'a'], [`${b} departures`, 'num', 'b'],
      [third, show === 'airlines' ? 'num' : 'left'], [show === 'airlines' ? `${when} here` : when, 'left', 'when']];
    row = (x) => (show === 'airlines'
      ? [nameCell(show, x.id, x.name), deps(x.deps_a), deps(x.deps_b), cell(exactCount(x.places), 'num'), cell(String(x.year), 'left')]
      : [nameCell(show, x.code, x.city), deps(x.deps_a), deps(x.deps_b), cell(airlineList(x.airlines.map(shortName)), 'left'), cell(formatYearMonth(x.ym), 'left')]);
  }
  const shown = sortChanges(items, status, sorted);
  const sortable = ['a', 'b', 'peak', 'when'].filter((k) => changeSort(status, k) === k);
  table.tHead.replaceChildren(head(columns, { sortable, sorted, onSort: (key) => { sortChoice = key; saveChanges(); drawTable(); } }));
  table.tBodies[0].replaceChildren(...shown.map((x) => {
    const tr = document.createElement('tr');
    tr.append(...row(x));
    return tr;
  }));
  if (!shown.length) table.tBodies[0].innerHTML = '<tr><td class="left" colspan="5">None.</td></tr>';
}

// the comparison in a sentence, and how many destinations came and went in between (from airport_gone)
async function summarise() {
  const a = $('ap-a').value, b = $('ap-b').value, min = $('ap-min').value;
  const c = summariseChanges(classifyChanges(changes, { min: Number(min), show: 'destinations' }));
  const total = c.kept + c.dropped;
  const times = min === '1' ? 'once' : `${min} times`;
  const text = total
    ? `In ${a} ${origin} had flights to ${exactCount(total)} destination${total === 1 ? '' : 's'} at least ${times}. By ${b}, ${exactCount(c.kept)} were still served, ${exactCount(c.dropped)} were dropped and ${exactCount(c.added)} new ones had been added.`
    : `No destinations were flown to ${times} in ${a}.`;
  $('change-summary').textContent = text;
  const key = JSON.stringify(goneParams('destinations'));
  let between = 0;
  try {
    between = airportGone(await goneRows('destinations'), { min: Number(min) }).filter((x) => x.status === 'between').length;
  } catch (err) {
    console.error(err);
  }
  if (between && key === JSON.stringify(goneParams('destinations'))) {
    $('change-summary').textContent = `${text} ${exactCount(between)} more ${between === 1 ? 'was' : 'were'} added and dropped again in between.`;
  }
}

async function loadChanges() {
  const a = $('ap-a').value, b = $('ap-b').value;
  try {
    changes = (await fetchRows(queryUrl('airport_changes', { origin, a, b }))).rows;
  } catch (err) {
    $('change-summary').textContent = 'Could not load the data.';
    return;
  }
  summarise();
  drawTable();
}

async function whatChanged() {
  for (const sel of [$('ap-a'), $('ap-b')]) {
    for (let y = firstYear; y <= lastYear; y++) sel.append(new Option(String(y), String(y)));
  }
  const within = (v, d) => (Number(v) >= firstYear && Number(v) <= lastYear ? String(Number(v)) : d);
  const defaultFrom = String(Math.max(firstYear, lastYear - 6));
  $('ap-b').value = within(params.get('to'), String(lastYear));
  $('ap-a').value = within(params.get('from'), defaultFrom);
  $('ap-min').value = pick('min', ['1', '12', '52', '365'], '12');
  $('ap-show').value = pick('show', ['destinations', 'airlines'], 'destinations');
  $('ap-status').value = pick('status', ['dropped', 'gone', 'added', 'kept'], 'dropped');
  sortChoice = pick('sort', ['a', 'b', 'peak', 'when'], null);
  // the sort is kept in the address only where it isn't the status's own default
  const save = () => remember(['min', 'from', 'to', 'show', 'status', 'sort'], {
    min: [$('ap-min').value, '12'], from: [$('ap-a').value, defaultFrom], to: [$('ap-b').value, String(lastYear)],
    show: [$('ap-show').value, 'destinations'], status: [$('ap-status').value, 'dropped'],
    sort: [changeSort($('ap-status').value, sortChoice), changeSort($('ap-status').value, null)],
  });
  saveChanges = save;
  for (const id of ['ap-a', 'ap-b']) $(id).addEventListener('change', () => { save(); loadChanges(); });
  $('ap-min').addEventListener('change', () => { save(); summarise(); drawTable(); });
  for (const id of ['ap-show', 'ap-status']) $(id).addEventListener('change', () => { save(); drawTable(); });
  await loadChanges();
}

if (!firstYear) {
  const box = $('size-chart') ? $('size-chart') : $('change-summary');
  box.textContent = `No flights from ${origin} in the data.`;
  if ($('places-chart')) $('places-chart').textContent = '';
} else if ($('size-chart')) {
  overTime();
} else {
  whatChanged();
}
