import { queryUrl, fetchRows } from '/static/globe/src/api.js';
import { setDataLink } from '/static/common/datalink.js';
import { replaceSearch } from '/static/nav/src/state.js';
import { lowerFirst, airportHref, loadFactor, groupCities, yearLabel } from './src/table.js';
import { splitSmall, othersLabel } from '/static/common/small.js';
import { cell, countCell, tonsCell, percentCell, link } from './src/cells.js';
import { airportTip } from '/static/charts/src/labels.js';
import { parseDir, setDir, abroadCountWord } from '/static/common/direction.js';

const minYear = Number(document.body.dataset.minYear);
const maxYear = Number(document.body.dataset.maxYear);
const country = document.body.dataset.country;
const $ = (id) => document.getElementById(id);
const dir = parseDir(location.search);
const word = lowerFirst(abroadCountWord(dir));
const asked = Number.parseInt(new URLSearchParams(location.search).get('year'), 10);
let year = new URLSearchParams(location.search).get('year') === 'all' ? 'all' : asked >= minYear && asked <= maxYear ? asked : maxYear;
const group = new URLSearchParams(location.search).get('group') === 'city' ? 'city' : 'airport';
const open = new Set(); // the cities opened to list their airports
let airportInfo = new Map();
let rows = [];
let loadSeq = 0;

// the page is one country, so its cities need not say which
const place = (city) => String(city || '').replace(`, ${country}`, '');
const params = () => ({ year, dir, service: '', region: 'abroad' });

function airportRow(r, member) {
  const tr = document.createElement('tr');
  if (member) tr.className = 'member';
  const code = cell('', 'code');
  code.append(link(airportHref(r.airport, 'passengers'), r.airport, airportTip(r.airport, airportInfo)));
  const more = cell('', 'more');
  more.append(link(`/airports/${encodeURIComponent(r.airport)}/globe${year === 'all' ? '' : `?year=${year}`}`, 'Map →'));
  tr.append(code, cell(place(r.city), 'city'), countCell(r.passengers, 'passengers'), countCell(r.deps, word),
    percentCell(loadFactor(r)), cell(String(r.dests), 'num'), tonsCell(r.freight), more);
  return tr;
}

// the airports of a city too small to list, as one row
function othersRow(small) {
  const tr = document.createElement('tr');
  tr.className = 'member others';
  const total = { passengers: 0, deps: 0, seats: 0, freight: 0 };
  for (const r of small) for (const k of Object.keys(total)) total[k] += Number(r[k]) || 0;
  tr.append(cell('', 'code'), cell(othersLabel(small.length), 'city'), countCell(total.passengers, 'passengers'), countCell(total.deps, word),
    percentCell(loadFactor(total)), cell('', 'num'), tonsCell(total.freight), cell('', 'more'));
  return tr;
}

function render() {
  $('heading').textContent = `Airports in ${country}, ${yearLabel(year, minYear, maxYear)}`;
  const body = document.querySelector('#airports tbody');
  const foot = document.querySelector('#airports tfoot');
  body.replaceChildren();
  foot.replaceChildren();
  const mine = rows.filter((r) => r.country === country);
  if (group === 'airport') {
    for (const r of [...mine].sort((x, y) => (Number(y.passengers) || 0) - (Number(x.passengers) || 0) || x.airport.localeCompare(y.airport))) body.append(airportRow(r, false));
  } else {
    // a city's row opens to list its airports; a lone airport's city has nothing to open
    for (const c of groupCities(mine).sort((x, y) => y.passengers - x.passengers || x.name.localeCompare(y.name))) {
      const tr = document.createElement('tr');
      tr.className = 'city-row';
      const first = cell('', 'code');
      const isOpen = open.has(c.key);
      if (c.airports.length > 1) {
        const toggle = Object.assign(document.createElement('button'), { type: 'button', className: 'twist', textContent: isOpen ? '▾' : '▸' });
        toggle.setAttribute('aria-expanded', String(isOpen));
        toggle.setAttribute('aria-label', `${isOpen ? 'Hide' : 'Show'} ${place(c.name)}'s airports`);
        toggle.dataset.key = c.key;
        toggle.addEventListener('click', () => { if (open.has(c.key)) open.delete(c.key); else open.add(c.key); render(); body.querySelector(`[data-key="${c.key}"]`)?.focus(); });
        first.append(toggle);
      } else {
        first.append(link(airportHref(c.airports[0].airport, 'passengers'), c.airports[0].airport, airportTip(c.airports[0].airport, airportInfo)));
      }
      tr.append(first, cell(place(c.name), 'city'), countCell(c.passengers, 'passengers'), countCell(c.deps, word),
        percentCell(loadFactor(c)), cell(String(c.dests), 'num'), tonsCell(c.freight), cell('', 'more'));
      body.append(tr);
      if (!isOpen) continue;
      const { shown, small } = splitSmall(c.airports);
      for (const a of shown) body.append(airportRow(a, true));
      if (small.length) body.append(othersRow(small));
    }
  }
  if (!mine.length) return;
  const total = { passengers: 0, deps: 0, seats: 0, freight: 0 };
  for (const r of mine) for (const k of Object.keys(total)) total[k] += Number(r[k]) || 0;
  const tr = document.createElement('tr');
  tr.className = 'city-row';
  tr.append(cell('', 'code'), cell(`All of ${country}`, 'city'), countCell(total.passengers, 'passengers'), countCell(total.deps, word),
    percentCell(loadFactor(total)), cell(String(mine[0].country_dests), 'num'), tonsCell(total.freight), cell('', 'more'));
  foot.append(tr);
}

async function load() {
  setDataLink('top_airports', params());
  const id = ++loadSeq;
  $('status').textContent = 'Loading…';
  try {
    const res = await fetchRows(queryUrl('top_airports', params()));
    if (id !== loadSeq) return;
    rows = res.rows;
    $('status').textContent = rows.some((r) => r.country === country) ? '' : `No flights to or from ${country} in ${yearLabel(year, minYear, maxYear)}.`;
  } catch (err) {
    if (id !== loadSeq) return;
    console.error(err);
    rows = [];
    $('status').textContent = 'Could not load the table. Try again in a moment.';
  }
  render();
}

$('group').value = group;
$('group').addEventListener('change', () => {
  const q = new URLSearchParams(location.search);
  if ($('group').value === 'city') q.set('group', 'city'); else q.delete('group');
  location.search = q.size ? `?${q}` : '';
});
$('dir').addEventListener('change', (e) => setDir(e.target.value));
$('year').value = String(year);
$('year').addEventListener('change', () => {
  year = $('year').value === 'all' ? 'all' : Number($('year').value);
  history.replaceState(null, '', `${location.pathname}${replaceSearch(location.search, ['year'], year === maxYear ? '' : `?year=${year}`)}`);
  load();
});
load();
fetchRows(queryUrl('airports')).then((res) => { airportInfo = new Map(res.rows.map((a) => [a.code, a])); render(); }, (err) => console.error(err));
