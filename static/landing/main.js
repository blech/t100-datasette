import { queryUrl, fetchRows } from '/static/globe/src/api.js';
import { setDataLink } from '/static/common/datalink.js';
import { replaceSearch } from '/static/nav/src/state.js';
import { sortLabels, lowerFirst, topBy, parseState, toSearch, airportHref, loadFactor, matrixSearch, groupCities, yearLabel } from './src/table.js';
import { formatCount, formatTons, exactCount } from '/static/common/numbers.js';
import { airportTip, groupTip } from '/static/charts/src/labels.js';
import { parseDir, setDir } from '/static/common/direction.js';

const minYear = Number(document.body.dataset.minYear);
const maxYear = Number(document.body.dataset.maxYear);
const state = parseState(location.search, minYear, maxYear);
const $ = (id) => document.getElementById(id);

let rows = [];
let airportInfo = new Map(); // code -> name, ICAO code and city, for the hovers; until it loads they show the code alone
const open = new Set(); // the cities opened to list their airports
let loadSeq = 0;

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
const percentCell = (pct) => cell(pct === null ? '–' : `${pct.toFixed(1)}%`, 'num');

function link(href, text, title) {
  const a = document.createElement('a');
  a.href = href;
  a.textContent = text;
  if (title !== undefined) a.title = title;
  return a;
}

const dir = parseDir(location.search);
const abroad = state.region === 'abroad';
const labels = sortLabels(dir, abroad);
const word = lowerFirst(labels.deps);
$('dir').addEventListener('change', (e) => setDir(e.target.value));

function render() {
  for (const th of document.querySelectorAll('th[data-sort]')) {
    if (th.dataset.sort === state.sort) th.setAttribute('aria-sort', 'descending');
    else th.removeAttribute('aria-sort');
  }
  $('heading').textContent = `Busiest ${{ city: 'cities', country: 'countries' }[state.group] || 'airports'}${abroad ? ' abroad' : ''} by ${lowerFirst(labels[state.sort])}, ${yearLabel(state.year, minYear, maxYear)}${state.service === 'all' ? '' : `, ${state.service} flights`}`;
  const body = document.querySelector('#airports tbody');
  body.replaceChildren();
  // an airport's row: its code (to its page), name, figures and map; under an opened city it's indented
  const airportRow = (r, member) => {
    const tr = document.createElement('tr');
    if (member) tr.className = 'member';
    const code = cell('', 'code');
    code.append(link(airportHref(r.airport, state.sort), r.airport, airportTip(r.airport, airportInfo)));
    const more = cell('', 'more');
    more.append(link(`/airports/${encodeURIComponent(r.airport)}/globe${state.year === 'all' ? '' : `?year=${state.year}`}`, 'Map →')); // all years: the map's latest
    tr.append(code, cell(r.city || '', 'city'), countCell(r.passengers, 'passengers'), countCell(r.deps, word),
      percentCell(loadFactor(r)), cell(exactCount(r.dests), 'num'), tonsCell(r.freight), more);
    return tr;
  };
  if (state.group === 'airport') {
    for (const r of topBy(rows, state.sort, state.n)) body.append(airportRow(r, false));
    return;
  }
  // a city's row: a ▸ that opens it, its name, and its airports' totals (destinations counted once for the city)
  for (const c of topBy(groupCities(rows, state.group), state.sort, state.n)) {
    const tip = groupTip({ label: c.name, codes: c.airports.map((a) => a.airport) }, airportInfo);
    const tr = document.createElement('tr');
    tr.className = 'city-row';
    const isOpen = open.has(c.key);
    const toggle = Object.assign(document.createElement('button'), { type: 'button', className: 'twist', textContent: isOpen ? '▾' : '▸' });
    toggle.setAttribute('aria-expanded', String(isOpen));
    toggle.setAttribute('aria-label', `${isOpen ? 'Hide' : 'Show'} ${c.name}'s airports`);
    toggle.title = tip;
    toggle.addEventListener('click', () => { if (open.has(c.key)) open.delete(c.key); else open.add(c.key); render(); body.querySelector(`[data-key="${c.key}"]`)?.focus(); });
    toggle.dataset.key = c.key;
    const first = cell('', 'code');
    first.append(toggle);
    const name = cell(c.name, 'city');
    name.title = tip;
    tr.append(first, name, countCell(c.passengers, 'passengers'), countCell(c.deps, word), percentCell(loadFactor(c)),
      cell(exactCount(c.dests), 'num'), tonsCell(c.freight), cell('', 'more'));
    body.append(tr);
    if (isOpen) for (const a of c.airports) body.append(airportRow(a, true));
  }
}

// the views line's matrix takes the sort as its measure
const carryToMatrix = () => { const a = document.querySelector('nav.views a[href^="/airports/over-time"]'); if (a) a.href = `/airports/over-time${matrixSearch(state.sort, state.group, state)}`; };

function pushState() {
  history.replaceState(null, '', `${location.pathname}${replaceSearch(location.search, ['year', 'sort', 'group', 'region', 'n', 'service'], toSearch(state, maxYear))}`);
  carryToMatrix();
}

// every flight is the query's default, so an empty service
const queryParams = () => ({ year: state.year, dir, service: state.service === 'all' ? '' : state.service, region: abroad ? 'abroad' : '' });

async function load() {
  setDataLink('top_airports', queryParams());
  const id = ++loadSeq;
  $('status').textContent = 'Loading…';
  try {
    const res = await fetchRows(queryUrl('top_airports', queryParams()));
    if (id !== loadSeq) return;
    rows = res.rows;
    $('status').textContent = rows.length ? '' : `No data for ${yearLabel(state.year, minYear, maxYear)}.`;
  } catch (err) {
    if (id !== loadSeq) return;
    console.error(err);
    rows = [];
    $('status').textContent = 'Could not load the table. Try again in a moment.';
  }
  render();
}

carryToMatrix();
const ranking = $('table-rank');
ranking.value = String(state.year);
ranking.addEventListener('change', () => { state.year = ranking.value === 'all' ? 'all' : Number(ranking.value); pushState(); load(); });
const grouping = $('table-group');
grouping.value = state.group;
grouping.addEventListener('change', () => { state.group = grouping.value; pushState(); render(); });
const rowCount = $('table-n');
rowCount.value = String(state.n);
rowCount.addEventListener('change', () => { state.n = Number(rowCount.value); pushState(); render(); });
if (!abroad) { // abroad, the flights menu is only words
  const service = $('table-service');
  service.value = state.service;
  service.addEventListener('change', () => { state.service = service.value; pushState(); load(); });
}
// US or abroad changes what the directions mean and what the page says, so the page reloads, with the way and flights back to their defaults
$('table-region').addEventListener('change', (e) => {
  const q = new URLSearchParams(location.search);
  q.delete('dir'); q.delete('service');
  if (e.target.value === 'abroad') q.set('region', 'abroad'); else q.delete('region');
  location.search = q.size ? `?${q}` : '';
});

for (const th of document.querySelectorAll('th[data-sort]')) {
  th.querySelector('button').addEventListener('click', () => { state.sort = th.dataset.sort; pushState(); render(); });
}

load();
// the names for the hovers come once, for every year; the table doesn't wait for them
fetchRows(queryUrl('airports')).then((res) => { airportInfo = new Map(res.rows.map((a) => [a.code, a])); render(); }, (err) => console.error(err));
