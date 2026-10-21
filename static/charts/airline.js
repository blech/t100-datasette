import * as Plot from '/static/charts/vendor/plot.js';
import { HEAT_MEASURES } from '/static/charts/src/heatmap.js';
import { classifyRoutes, summariseRoutes, formatYearMonth } from '/static/charts/src/airline.js';
import { shortName } from '/static/charts/src/names.js';
import { queryUrl, fetchRows } from '/static/globe/src/api.js';
import { periodRows, attachPopover } from '/static/common/popover.js';
import { palette, isDark } from '/static/common/palette.js';
import { formatCount, exactCount, millionsAxis } from '/static/common/numbers.js';

// the tallest stack, which sets the y axis's scale
const stackMax = (points, key, value = (p) => p.value) => {
  const sums = new Map();
  for (const p of points) sums.set(p[key], (sums.get(p[key]) || 0) + value(p));
  return Math.max(0, ...sums.values());
};

const group = document.body.dataset.group;
const airline = document.body.dataset.airline; // '' for a whole group, else one member of a merged group
const isGroup = Number(document.body.dataset.members) > 0; // a merged group: show who flew each route
const firstYear = Number(document.body.dataset.firstYear);
const lastYear = Number(document.body.dataset.lastYear);
const $ = (id) => document.getElementById(id);
const LB_PER_SHORT_TON = 2000;

let detail = [];
let places = new Map();
let routes = [];
const memberLabel = (name) => shortName(name);

const unit = (m) => HEAT_MEASURES[m].toLowerCase().replace(/ \(.*/, '');
const plot = (box, options, popover) => {
  const chart = Plot.plot({
    width: Math.min(box.clientWidth || 900, 1100), height: 320, marginLeft: 64,
    style: { background: 'transparent', fontSize: '12px' }, ...options,
  });
  box.replaceChildren(...(popover ? attachPopover(chart, popover) : [chart]));
};
const yearPopover = { content: (d) => ({ title: d.period, rows: d.rows }), at: (d) => [d.period, d.top] };

function yearAxis(years) {
  const every = years.length <= 15 ? 1 : 5;
  return { type: 'band', domain: years.map(String), label: null, tickFormat: (d) => (Number(d) % every === 0 ? d : '') };
}

function drawSize() {
  const measure = $('al-measure').value, kind = $('al-kind').value, split = $('al-split').value;
  const data = [];
  const years = [];
  const seriesOf = (r) => (split === 'kind' ? r.kind : r.service);
  for (const r of detail) {
    if (kind !== 'all' && r.kind !== kind) continue;
    const v = (Number(r[measure]) || 0) / (measure === 'freight' ? LB_PER_SHORT_TON : 1);
    data.push({ year: String(r.year), series: seriesOf(r), value: v });
    if (!years.includes(r.year)) years.push(r.year);
  }
  const box = $('size-chart');
  if (!data.length) { box.textContent = `No ${unit(measure)} for this selection.`; return; }
  const series = split === 'kind' ? ['passenger', 'freight'] : ['domestic', 'international'];
  const p = palette(isDark());
  const range = split === 'kind' ? [p.kind.passenger, p.kind.freight] : [p.service.domestic, p.service.international];
  plot(box, {
    x: yearAxis(years), y: { ...millionsAxis(stackMax(data, 'year'), HEAT_MEASURES[measure]), grid: true },
    color: { domain: series, range, legend: true },
    marks: [
      Plot.barY(data, { x: 'year', y: 'value', fill: 'series', order: series }),
      Plot.ruleY([0]),
      Plot.ruleX(periodRows(data, { key: (d) => d.year, order: series, format: (v) => formatCount(v) }), Plot.pointerX({ x: 'period', strokeOpacity: 0 })),
    ],
  }, yearPopover);
}

async function drawPairs() {
  const min = $('al-min').value;
  const { rows } = await fetchRows(queryUrl('carrier_route_counts', { group, airline, min }));
  const box = $('pairs-chart');
  if (!rows.length) { box.textContent = 'No airport pairs at that level.'; return; }
  const data = rows.map((r) => ({ year: String(r.year), pairs: r.pairs }));
  plot(box, {
    x: yearAxis(rows.map((r) => r.year)), y: { label: 'Airport pairs', grid: true },
    marks: [
      Plot.barY(data, { x: 'year', y: 'pairs', fill: palette(isDark()).single }),
      Plot.ruleY([0]),
      Plot.ruleX(periodRows(data.map((d) => ({ ...d, series: 'Airport pairs', value: d.pairs })), { key: (d) => d.year, format: (v) => exactCount(v) }),
        Plot.pointerX({ x: 'period', strokeOpacity: 0 })),
    ],
  }, { ...yearPopover, keyOf: () => ({ kind: 'square', colour: palette(isDark()).single }) });
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
    const deps = (n) => { const td = cell(formatCount(n), 'num'); td.title = `${exactCount(n)} departures`; return td; };
    tr.append(routeCell(r), ...(isGroup ? [cell(r.airlines.map(memberLabel).join(', '), 'left')] : []), deps(r.deps_a), deps(r.deps_b), cell(formatYearMonth(status === 'added' ? r.first_ym : r.last_ym), 'left'));
    return tr;
  }));
  if (!shown.length) tbody.innerHTML = `<tr><td class="left" colspan="${isGroup ? 5 : 4}">None.</td></tr>`;
}

async function loadChanges() {
  const a = $('al-a').value, b = $('al-b').value, min = $('al-min').value;
  // the views line's map link follows the years compared; a page without one (an old template) still gets its table
  const mapLink = $('map-link');
  if (mapLink) mapLink.href = `/airlines/${airline || group}/globe?year=${b}&compare=${a}${min === '12' ? '' : `&min=${min}`}`;
  const { rows } = await fetchRows(queryUrl('carrier_route_changes', { group, airline, a, b }));
  routes = classifyRoutes(rows, { min: Number(min) });
  const c = summariseRoutes(routes);
  const total = c.kept + c.dropped;
  $('change-summary').textContent = total
    ? `In ${a} this airline flew ${exactCount(total)} airport pairs at least ${min} time${min === '1' ? '' : 's'}. By ${b}, ${exactCount(c.kept)} of them were still flown, ${exactCount(c.dropped)} were dropped, and ${exactCount(c.added)} new ones had been added.`
    : `No airport pairs reached ${min} flight${min === '1' ? '' : 's'} in ${a}.`;
  drawTable();
}

// the page is rendered with BTS's full name; show the short one as the heading and keep the full one underneath
function nameHeading() {
  for (const a of document.querySelectorAll('.members a[data-name]')) {
    a.title = a.dataset.name;
    a.textContent = shortName(a.dataset.name);
  }
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
    const [d, airports] = await Promise.all([fetchRows(queryUrl('carrier_group_detail', { group, airline })), fetchRows(queryUrl('airports'))]);
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
  document.addEventListener('t100:theme', () => { drawSize(); drawPairs(); });
  await Promise.all([drawPairs(), loadChanges()]);
}

main();
