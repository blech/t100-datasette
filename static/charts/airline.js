import * as Plot from '/static/charts/vendor/plot.js';
import { HEAT_MEASURES } from '/static/charts/src/heatmap.js';
import { classifyRoutes, summariseRoutes, formatYearMonth } from '/static/charts/src/airline.js';
import { shortName } from '/static/charts/src/names.js';
import { queryUrl, fetchRows } from '/static/globe/src/api.js';

const group = document.body.dataset.group;
const firstYear = Number(document.body.dataset.firstYear);
const lastYear = Number(document.body.dataset.lastYear);
const $ = (id) => document.getElementById(id);
const fmt = (v) => Math.round(v).toLocaleString('en-US');
const LB_PER_SHORT_TON = 2000;

let detail = [];
let places = new Map();
let routes = [];

const unit = (m) => HEAT_MEASURES[m].toLowerCase().replace(/ \(.*/, '');
const plot = (box, options) => box.replaceChildren(Plot.plot({
  width: Math.min(box.clientWidth || 900, 1100), height: 320, marginLeft: 64,
  style: { background: 'transparent', fontSize: '12px' }, ...options,
}));

function yearAxis(years) {
  const every = years.length <= 15 ? 1 : 5;
  return { type: 'band', domain: years.map(String), label: null, tickFormat: (d) => (Number(d) % every === 0 ? d : '') };
}

function drawSize() {
  const measure = $('al-measure').value, kind = $('al-kind').value, split = $('al-split').value;
  const data = [];
  const years = [];
  for (const r of detail) {
    if (kind !== 'all' && r.kind !== kind) continue;
    const v = (Number(r[measure]) || 0) / (measure === 'freight' ? LB_PER_SHORT_TON : 1);
    data.push({ year: String(r.year), series: split === 'kind' ? r.kind : r.service, value: v });
    if (!years.includes(r.year)) years.push(r.year);
  }
  const box = $('size-chart');
  if (!data.length) { box.textContent = `No ${unit(measure)} for this selection.`; return; }
  const series = split === 'kind' ? ['passenger', 'freight'] : ['domestic', 'international'];
  plot(box, {
    x: yearAxis(years), y: { label: HEAT_MEASURES[measure], tickFormat: '~s', grid: true },
    color: { domain: series, range: ['#4292c6', '#08306b'], legend: true },
    marks: [Plot.barY(data, { x: 'year', y: 'value', fill: 'series', order: series, title: (d) => `${d.year}, ${d.series}: ${fmt(d.value)} ${unit(measure)}`, tip: true }), Plot.ruleY([0])],
  });
}

async function drawPairs() {
  const min = $('al-min').value;
  const { rows } = await fetchRows(queryUrl('carrier_route_counts', { group, min }));
  const box = $('pairs-chart');
  if (!rows.length) { box.textContent = 'No airport pairs at that level.'; return; }
  const data = rows.map((r) => ({ year: String(r.year), pairs: r.pairs }));
  plot(box, {
    x: yearAxis(rows.map((r) => r.year)), y: { label: 'Airport pairs', grid: true },
    marks: [Plot.barY(data, { x: 'year', y: 'pairs', fill: '#4292c6', title: (d) => `${d.year}: ${fmt(d.pairs)} airport pairs`, tip: true }), Plot.ruleY([0])],
  });
}

const place = (code) => places.get(code) || '';
function routeCell(r) {
  const a = document.createElement('a');
  a.href = `/airports/${r.origin}/${r.dest}`;
  a.textContent = `${r.origin} – ${r.dest}`;
  a.title = `${place(r.origin)} – ${place(r.dest)}`;
  const td = document.createElement('td');
  td.className = 'left';
  const small = document.createElement('small');
  small.textContent = ` ${place(r.origin)} – ${place(r.dest)}`;
  td.append(a, small);
  return td;
}

function drawTable() {
  const status = $('al-status').value;
  const a = $('al-a').value, b = $('al-b').value;
  const shown = routes.filter((r) => r.status === status);
  if (status === 'added') shown.sort((x, y) => y.deps_b - x.deps_b);
  $('th-a').textContent = `${a} departures`;
  $('th-b').textContent = `${b} departures`;
  $('th-last').textContent = status === 'added' ? 'First flown' : 'Last flown';
  const tbody = $('change-table').tBodies[0];
  tbody.replaceChildren(...shown.map((r) => {
    const tr = document.createElement('tr');
    const cell = (text, cls) => { const td = document.createElement('td'); td.textContent = text; if (cls) td.className = cls; return td; };
    tr.append(routeCell(r), cell(fmt(r.deps_a), 'num'), cell(fmt(r.deps_b), 'num'), cell(formatYearMonth(status === 'added' ? r.first_ym : r.last_ym), 'left'));
    return tr;
  }));
  if (!shown.length) tbody.innerHTML = '<tr><td class="left" colspan="4">None.</td></tr>';
}

async function loadChanges() {
  const a = $('al-a').value, b = $('al-b').value, min = $('al-min').value;
  $('map-link').href = `/carriers/${group}/globe?year=${b}&compare=${a}${min === '12' ? '' : `&min=${min}`}`;
  const { rows } = await fetchRows(queryUrl('carrier_route_changes', { group, a, b, min }));
  routes = classifyRoutes(rows, { min: Number(min) });
  const c = summariseRoutes(routes);
  const total = c.kept + c.dropped;
  $('change-summary').textContent = total
    ? `In ${a} this airline flew ${fmt(total)} airport pairs at least ${min} time${min === '1' ? '' : 's'}. By ${b}, ${fmt(c.kept)} of them were still flown, ${fmt(c.dropped)} were dropped, and ${fmt(c.added)} new ones had been added.`
    : `No airport pairs reached ${min} flight${min === '1' ? '' : 's'} in ${a}.`;
  drawTable();
}

// the page is rendered with BTS's full name; show the short one as the heading and keep the full one underneath
function nameHeading() {
  const h1 = $('airline-name');
  const full = h1.textContent.trim();
  const short = shortName(full);
  if (short === full) return;
  h1.textContent = short;
  $('full-name').textContent = `Listed by BTS as ${full}`;
  $('full-name').hidden = false;
}

async function main() {
  nameHeading();
  const measure = $('al-measure');
  for (const [k, label] of Object.entries(HEAT_MEASURES)) measure.append(new Option(label.toLowerCase(), k));
  for (const sel of [$('al-a'), $('al-b')]) {
    for (let y = firstYear; y <= lastYear; y++) sel.append(new Option(String(y), String(y)));
  }
  const qs = new URLSearchParams(location.search);
  const within = (v, d) => (Number(v) >= firstYear && Number(v) <= lastYear ? String(Number(v)) : d);
  $('al-b').value = within(qs.get('to'), String(lastYear));
  $('al-a').value = within(qs.get('from'), String(Math.max(firstYear, lastYear - 6)));
  try {
    const [d, airports] = await Promise.all([fetchRows(queryUrl('carrier_group_detail', { group })), fetchRows(queryUrl('airports'))]);
    detail = d.rows;
    places = new Map(airports.rows.map((r) => [r.code, r.place]));
  } catch (err) {
    console.error(err);
    $('size-chart').textContent = 'Could not load the chart data.';
    return;
  }
  for (const id of ['al-measure', 'al-kind', 'al-split']) $(id).addEventListener('change', drawSize);
  $('al-min').addEventListener('change', () => { drawPairs(); loadChanges(); });
  for (const id of ['al-a', 'al-b']) $(id).addEventListener('change', loadChanges);
  $('al-status').addEventListener('change', drawTable);
  drawSize();
  await Promise.all([drawPairs(), loadChanges()]);
}

main();
