import { MATRIX_MEASURES } from '/static/charts/src/matrix.js';
import { setDataLink } from '/static/common/datalink.js';
import { groupFamilies, sortFamilies, limitFamilies, LIMIT_OPTIONS, DEFAULT_LIMIT, kindOptions, makerOptions } from '/static/charts/src/aircraft.js';
import { queryUrl, fetchRows } from '/static/globe/src/api.js';
import { formatCount, countLabel } from '/static/common/numbers.js';
import { replaceSearch } from '/static/nav/src/state.js';

const $ = (id) => document.getElementById(id);
const latest = Number(document.body.dataset.latestYear);
const params = new URLSearchParams(location.search);
const pick = (key, allowed, fallback) => (allowed.includes(params.get(key)) ? params.get(key) : fallback);
const years = ['all', ...Array.from({ length: latest - 1990 + 1 }, (_, i) => String(latest - i))];
const state = {
  measure: pick('measure', Object.keys(MATRIX_MEASURES), 'passengers'),
  year: pick('year', years, String(latest)),
  kind: params.get('kind') || 'all',   // checked against the menus once the data is in
  maker: params.get('maker') || 'all',
  limit: pick('limit', LIMIT_OPTIONS.map((o) => o.value), DEFAULT_LIMIT),
  q: params.get('q') || '',
  sort: pick('sort', ['family', 'maker', 'aircraftKind', 'firstYear', 'lastYear', 'value'], 'value'),
  dir: pick('dir', ['asc', 'desc'], 'desc'),
};
const open = new Set();
let rows = [];
let seq = 0;          // the newest year request; an older answer arriving late is ignored
let loading = false;  // while true the rows on hand belong to another year
let focusKey = null;  // the sort header or toggle just used, so keyboard focus survives the redraw

const pct = (v) => `${(v * 100).toFixed(v > 0 && v < 0.001 ? 2 : 1)}%`;
const span = (a, b) => (a ? (a === b ? String(a) : `${a}–${b}`) : '');
const unit = () => MATRIX_MEASURES[state.measure].toLowerCase();

function pushState() {
  const q = new URLSearchParams();
  const defaults = { measure: 'passengers', year: String(latest), kind: 'all', maker: 'all', limit: DEFAULT_LIMIT, q: '', sort: 'value', dir: 'desc' };
  for (const [k, v] of Object.entries(state)) if (v !== defaults[k]) q.set(k, v);
  history.replaceState(null, '', `${location.pathname}${replaceSearch(location.search, Object.keys(defaults), `?${q}`)}`);
}

const cell = (text, cls) => { const td = document.createElement('td'); td.textContent = text; if (cls) td.className = cls; return td; };

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

function typeRow(x) {
  const tr = document.createElement('tr');
  tr.className = 'type-row';
  tr.append(cell(x.name, 'left type-name'), cell(x.maker, 'left'), cell(x.aircraftKind, 'left'), cell(span(x.firstYear, x.lastYear)), cell(formatCount(x.value)), cell(pct(x.share)));
  return tr;
}

function draw() {
  if (loading) return;
  const box = $('aircraft-table');
  const status = $('at-status');
  const { families, total } = groupFamilies(rows, state);
  box.replaceChildren();
  status.textContent = '';
  if (!families.length) { box.textContent = state.q ? `Nothing matches "${state.q}".` : `No ${unit()} for this selection.`; return; }
  const { shown, hidden, shownShare } = limitFamilies(families, state.limit, { searching: Boolean(state.q.trim()) });
  const sorted = sortFamilies(shown, state.sort, state.dir);
  const table = document.createElement('table');
  const head = document.createElement('tr');
  head.append(headerCell('family', 'Family', 'left'), headerCell('maker', 'Maker', 'left'), headerCell('aircraftKind', 'Kind', 'left'),
    headerCell('firstYear', 'Flew'), headerCell('value', MATRIX_MEASURES[state.measure]), document.createElement('th'));
  head.lastChild.textContent = 'Share';
  const thead = document.createElement('thead');
  thead.append(head);
  const tbody = document.createElement('tbody');
  for (const f of sorted) {
    const tr = document.createElement('tr');
    const first = document.createElement('td');
    first.className = 'left';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'twist';
    toggle.dataset.focus = `twist:${f.family}`;
    const isOpen = open.has(f.family) || f.matched;
    toggle.textContent = isOpen ? '▾' : '▸';
    toggle.setAttribute('aria-expanded', String(isOpen));
    toggle.setAttribute('aria-label', `${isOpen ? 'Hide' : 'Show'} the types in ${f.family}`);
    toggle.addEventListener('click', () => { if (open.has(f.family)) open.delete(f.family); else open.add(f.family); focusKey = `twist:${f.family}`; draw(); });
    const link = document.createElement('a');
    link.href = `/aircraft/${f.slug}`;
    link.textContent = f.family;
    first.append(toggle, ' ', link);
    tr.append(first, cell(f.maker, 'left'), cell(f.aircraftKind, 'left'), cell(span(f.firstYear, f.lastYear)), cell(formatCount(f.value)), cell(pct(f.share)));
    tbody.append(tr);
    if (isOpen) for (const x of f.types) tbody.append(typeRow(x));
  }
  table.append(thead, tbody);
  box.append(table);
  const when = state.year === 'all' ? 'across all years' : `in ${state.year}`;
  status.textContent = hidden
    ? `Showing ${shown.length} of ${families.length} families, ${pct(shownShare)} of the ${countLabel(total)} ${unit()} ${when}.`
    : `${families.length} families, ${countLabel(total)} ${unit()} ${when}.`;
  if (focusKey) {
    box.querySelector(`[data-focus="${CSS.escape(focusKey)}"]`)?.focus();
    focusKey = null;
  }
}

async function load() {
  setDataLink('type_table', { year: state.year });
  const id = ++seq;
  loading = true;
  $('aircraft-table').textContent = 'Loading table…';
  $('at-status').textContent = '';
  let fetched;
  try {
    fetched = (await fetchRows(queryUrl('type_table', { year: state.year }))).rows;
  } catch (err) {
    if (id !== seq) return;
    console.error(err);
    $('aircraft-table').textContent = 'Could not load the table.';
    return;
  }
  if (id !== seq) return;
  rows = fetched;
  loading = false;
  for (const [id, field, opts] of [['at-kind', 'kind', kindOptions(rows)], ['at-maker', 'maker', makerOptions(rows)]]) {
    $(id).replaceChildren(...opts.map((o) => new Option(o.label, o.value)));
    if (!opts.some((o) => o.value === state[field])) { state[field] = 'all'; pushState(); }
    $(id).value = state[field];
  }
  draw();
}

function main() {
  for (const [k, label] of Object.entries(MATRIX_MEASURES)) $('at-measure').append(new Option(label.toLowerCase(), k));
  for (const y of years) $('at-year').append(new Option(y === 'all' ? 'all years' : y, y));
  $('at-measure').value = state.measure;
  $('at-year').value = state.year;
  for (const o of LIMIT_OPTIONS) $('at-limit').append(new Option(o.label, o.value));
  $('at-limit').value = state.limit;
  $('at-limit').addEventListener('change', (e) => { state.limit = e.target.value; pushState(); draw(); });
  $('at-q').value = state.q;
  $('at-measure').addEventListener('change', (e) => { state.measure = e.target.value; pushState(); draw(); });
  $('at-kind').addEventListener('change', (e) => { state.kind = e.target.value; pushState(); draw(); });
  $('at-maker').addEventListener('change', (e) => { state.maker = e.target.value; pushState(); draw(); });
  $('at-q').addEventListener('input', (e) => { state.q = e.target.value; pushState(); draw(); });
  $('at-year').addEventListener('change', (e) => { state.year = e.target.value; pushState(); load(); });
  load();
}

main();
