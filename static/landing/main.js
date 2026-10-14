import { queryUrl, fetchRows } from '/static/globe/src/api.js';
import { replaceSearch } from '/static/nav/src/state.js';
import { SORTS, formatCount, formatTons, topBy, parseState, toSearch } from './src/table.js';

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
    code.append(link(`/airports/${encodeURIComponent(r.origin)}`, r.origin));
    const more = cell('', 'more');
    more.append(link(`/airports/${encodeURIComponent(r.origin)}/globe?year=${state.year}`, 'Map →'));
    tr.append(
      code,
      cell(r.origin_city_name || '', 'city'),
      cell(formatCount(r.passengers), 'num', Number(r.passengers).toLocaleString('en-US')),
      cell(formatCount(r.deps), 'num', Number(r.deps).toLocaleString('en-US')),
      cell(formatCount(r.seats), 'num', Number(r.seats).toLocaleString('en-US')),
      cell(formatTons(r.freight), 'num', `${Number(r.freight).toLocaleString('en-US')} lb`),
      more,
    );
    body.append(tr);
  }
}

function pushState() {
  history.replaceState(null, '', `${location.pathname}${replaceSearch(location.search, ['year', 'sort'], toSearch(state, maxYear))}`);
}

async function load() {
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
select.addEventListener('change', () => { state.year = Number(select.value); pushState(); load(); });

for (const th of document.querySelectorAll('th[data-sort]')) {
  th.querySelector('button').addEventListener('click', () => { state.sort = th.dataset.sort; pushState(); render(); });
}

load();
