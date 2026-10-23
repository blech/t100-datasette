import { queryUrl, fetchRows } from '/static/globe/src/api.js';
import { setDataLink } from '/static/common/datalink.js';
import { replaceSearch } from '/static/nav/src/state.js';
import { SORTS, topBy, parseState, toSearch, airportHref, loadFactor, matrixSearch } from './src/table.js';
import { formatCount, formatTons, exactCount } from '/static/common/numbers.js';

const ROWS_SHOWN = 20;
const minYear = Number(document.body.dataset.minYear);
const maxYear = Number(document.body.dataset.maxYear);
const state = parseState(location.search, minYear, maxYear);
const $ = (id) => document.getElementById(id);

let rows = [];
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

function link(href, text) {
  const a = document.createElement('a');
  a.href = href;
  a.textContent = text;
  return a;
}

function render() {
  for (const th of document.querySelectorAll('th[data-sort]')) {
    if (th.dataset.sort === state.sort) th.setAttribute('aria-sort', 'descending');
    else th.removeAttribute('aria-sort');
  }
  $('heading').textContent = `Busiest airports by ${SORTS[state.sort].toLowerCase()}, ${state.year}`;
  const body = document.querySelector('#airports tbody');
  body.replaceChildren();
  for (const r of topBy(rows, state.sort, ROWS_SHOWN)) {
    const tr = document.createElement('tr');
    const code = cell('', 'code');
    code.append(link(airportHref(r.origin, state.sort), r.origin));
    const more = cell('', 'more');
    more.append(link(`/airports/${encodeURIComponent(r.origin)}/globe?year=${state.year}`, 'Map →'));
    tr.append(
      code,
      cell(r.origin_city_name || '', 'city'),
      countCell(r.passengers, 'passengers'),
      countCell(r.deps, 'departures'),
      percentCell(loadFactor(r)),
      cell(exactCount(r.dests), 'num'),
      tonsCell(r.freight),
      more,
    );
    body.append(tr);
  }
}

// the views line's matrix takes the sort as its measure
const carryToMatrix = () => { const a = document.querySelector('nav.views a[href^="/airports/over-time"]'); if (a) a.href = `/airports/over-time${matrixSearch(state.sort)}`; };

function pushState() {
  history.replaceState(null, '', `${location.pathname}${replaceSearch(location.search, ['year', 'sort'], toSearch(state, maxYear))}`);
  carryToMatrix();
}

async function load() {
  setDataLink('top_airports', { year: state.year });
  const id = ++loadSeq;
  $('status').textContent = 'Loading…';
  try {
    const res = await fetchRows(queryUrl('top_airports', { year: state.year }));
    if (id !== loadSeq) return;
    rows = res.rows;
    $('status').textContent = rows.length ? '' : `No data for ${state.year}.`;
  } catch (err) {
    if (id !== loadSeq) return;
    console.error(err);
    rows = [];
    $('status').textContent = 'Could not load the table. Try again in a moment.';
  }
  render();
}

const select = $('year');
for (let y = maxYear; y >= minYear; y--) select.append(new Option(String(y), String(y)));
select.value = String(state.year);
carryToMatrix();
select.addEventListener('change', () => { state.year = Number(select.value); pushState(); load(); });

for (const th of document.querySelectorAll('th[data-sort]')) {
  th.querySelector('button').addEventListener('click', () => { state.sort = th.dataset.sort; pushState(); render(); });
}

load();
