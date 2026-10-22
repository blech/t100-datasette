import { HEAT_MEASURES } from '/static/charts/src/heatmap.js';
import { groupAirlines, sortAirlines, sharedQuery, matchesElsewhere } from '/static/charts/src/airlines.js';
import { limitFamilies, limitOptions, DEFAULT_LIMIT } from '/static/charts/src/aircraft.js';
import { queryUrl, fetchRows } from '/static/globe/src/api.js';
import { formatCount, countLabel } from '/static/common/numbers.js';
import { replaceSearch } from '/static/nav/src/state.js';

const $ = (id) => document.getElementById(id);
const latest = Number(document.body.dataset.latestYear);
const params = new URLSearchParams(location.search);
const pick = (key, allowed, fallback) => (allowed.includes(params.get(key)) ? params.get(key) : fallback);
const years = ['all', ...Array.from({ length: latest - 1990 + 1 }, (_, i) => String(latest - i))];
const LIMITS = limitOptions('airlines', 'airline');
const DEFAULTS = { measure: 'passengers', year: String(latest), flights: 'passenger', service: 'all', limit: DEFAULT_LIMIT, q: '', sort: 'value', dir: 'desc' };
const state = {
  measure: pick('measure', Object.keys(HEAT_MEASURES), DEFAULTS.measure),
  year: pick('year', years, DEFAULTS.year),
  flights: pick('flights', ['passenger', 'freight', 'all'], DEFAULTS.flights),
  service: pick('service', ['all', 'domestic', 'international'], DEFAULTS.service),
  limit: pick('limit', LIMITS.map((o) => o.value), DEFAULTS.limit),
  q: params.get('q') || '',
  sort: pick('sort', ['name', 'firstYear', 'value'], DEFAULTS.sort),
  dir: pick('dir', ['asc', 'desc'], DEFAULTS.dir),
};
const open = new Set();
let rows = [];
let seq = 0;          // the newest year request; an older answer arriving late is ignored
let loading = false;  // while true the rows on hand belong to another year
let focusKey = null;  // the sort header or toggle just used, so keyboard focus survives the redraw

const pct = (v) => `${(v * 100).toFixed(v > 0 && v < 0.001 ? 2 : 1)}%`;
const span = (a, b) => (a ? (a === b ? String(a) : `${a}–${b}`) : '');
const unit = () => HEAT_MEASURES[state.measure].toLowerCase();

// the views line takes the settings the heat map reads too
const carry = () => { for (const a of document.querySelectorAll('nav.views a')) a.search = sharedQuery(location.search); };

function pushState() {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(state)) if (v !== DEFAULTS[k]) q.set(k, v);
  history.replaceState(null, '', `${location.pathname}${replaceSearch(location.search, Object.keys(DEFAULTS), `?${q}`)}`);
  carry();
}

const cell = (text, cls) => { const td = document.createElement('td'); td.textContent = text; if (cls) td.className = cls; return td; };
const link = (href, text) => { const a = document.createElement('a'); a.href = href; a.textContent = text; return a; };

function headerCell(key, label, cls) {
  const th = document.createElement('th');
  if (cls) th.className = cls;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'sort';
  b.dataset.focus = `sort:${key}`;
  b.textContent = label + (state.sort === key ? (state.dir === 'asc' ? ' ▲' : ' ▼') : '');
  b.addEventListener('click', () => {
    state.dir = state.sort === key && state.dir === 'desc' ? 'asc' : 'desc';
    if (state.sort !== key) state.dir = key === 'value' || key === 'firstYear' ? 'desc' : 'asc';
    state.sort = key;
    focusKey = `sort:${key}`;
    pushState(); draw();
  });
  th.append(b);
  return th;
}

function memberRow(m) {
  const tr = document.createElement('tr');
  tr.className = 'type-row';
  const name = cell('', 'left type-name');
  name.append(link(`/airlines/${m.id}`, m.name));
  tr.append(name, cell(span(m.firstYear, m.lastYear)), cell(formatCount(m.value)), cell(pct(m.share)));
  return tr;
}

function draw() {
  if (loading) return;
  const box = $('airline-table');
  const status = $('airline-status');
  const { groups, total } = groupAirlines(rows, state);
  box.replaceChildren();
  status.textContent = '';
  if (!groups.length) {
    box.textContent = state.q ? `Nothing matches "${state.q}"` : `No ${unit()} for this selection.`;
    if (state.q && matchesElsewhere(rows, state)) {
      // the airline is in the data, only not among these flights or routes (a freight airline among passenger flights)
      const widen = document.createElement('button');
      widen.type = 'button';
      widen.className = 'link';
      widen.textContent = 'show all flights and routes';
      widen.addEventListener('click', () => {
        state.flights = 'all'; state.service = 'all';
        $('airline-flights').value = 'all'; $('airline-service').value = 'all';
        pushState(); draw();
      });
      box.append(` among ${$('airline-flights').selectedOptions[0].text} on ${$('airline-service').selectedOptions[0].text}: `, widen, '.');
    } else if (state.q) box.append('.');
    return;
  }
  const { shown, hidden, shownShare } = limitFamilies(groups, state.limit, { searching: Boolean(state.q.trim()) });
  const sorted = sortAirlines(shown, state.sort, state.dir);
  const table = document.createElement('table');
  const head = document.createElement('tr');
  head.append(headerCell('name', 'Airline', 'left'), headerCell('firstYear', 'Flew'), headerCell('value', HEAT_MEASURES[state.measure]), document.createElement('th'));
  head.lastChild.textContent = 'Share';
  const thead = document.createElement('thead');
  thead.append(head);
  const tbody = document.createElement('tbody');
  for (const g of sorted) {
    const tr = document.createElement('tr');
    const first = document.createElement('td');
    first.className = 'left';
    const isOpen = open.has(g.id) || g.matched;
    if (g.members.length > 1 || g.matched) {
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'twist';
      toggle.dataset.focus = `twist:${g.id}`;
      toggle.textContent = isOpen ? '▾' : '▸';
      toggle.setAttribute('aria-expanded', String(isOpen));
      toggle.setAttribute('aria-label', `${isOpen ? 'Hide' : 'Show'} the airlines in ${g.name}`);
      toggle.addEventListener('click', () => { if (open.has(g.id)) open.delete(g.id); else open.add(g.id); focusKey = `twist:${g.id}`; draw(); });
      first.append(toggle, ' ');
    }
    first.append(link(`/airlines/${g.id}`, g.name));
    tr.append(first, cell(span(g.firstYear, g.lastYear)), cell(formatCount(g.value)), cell(pct(g.share)));
    tbody.append(tr);
    if (isOpen && (g.members.length > 1 || g.matched)) for (const m of g.members) tbody.append(memberRow(m));
  }
  table.append(thead, tbody);
  box.append(table);
  const when = state.year === 'all' ? 'across all years' : `in ${state.year}`;
  status.textContent = hidden
    ? `Showing ${shown.length} of ${groups.length} airlines, ${pct(shownShare)} of the ${countLabel(total)} ${unit()} ${when}.`
    : `${groups.length} airlines, ${countLabel(total)} ${unit()} ${when}.`;
  if (focusKey) {
    box.querySelector(`[data-focus="${CSS.escape(focusKey)}"]`)?.focus();
    focusKey = null;
  }
}

async function load() {
  const id = ++seq;
  loading = true;
  $('airline-table').textContent = 'Loading table…';
  $('airline-status').textContent = '';
  let fetched;
  try {
    fetched = (await fetchRows(queryUrl('airline_table', { year: state.year }))).rows;
  } catch (err) {
    if (id !== seq) return;
    console.error(err);
    $('airline-table').textContent = 'Could not load the table.';
    return;
  }
  if (id !== seq) return;
  rows = fetched;
  loading = false;
  draw();
}

function main() {
  for (const [k, label] of Object.entries(HEAT_MEASURES)) $('airline-measure').append(new Option(label.toLowerCase(), k));
  for (const y of years) $('airline-year').append(new Option(y === 'all' ? 'all years' : y, y));
  for (const o of LIMITS) $('airline-limit').append(new Option(o.label, o.value));
  for (const [id, field] of [['airline-measure', 'measure'], ['airline-year', 'year'], ['airline-flights', 'flights'], ['airline-service', 'service'], ['airline-limit', 'limit']]) {
    $(id).value = state[field];
    $(id).addEventListener('change', (e) => { state[field] = e.target.value; pushState(); if (field === 'year') load(); else draw(); });
  }
  $('airline-q').value = state.q;
  $('airline-q').addEventListener('input', (e) => { state.q = e.target.value; pushState(); draw(); });
  carry();
  load();
}

main();
