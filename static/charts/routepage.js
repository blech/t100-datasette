import * as Plot from '/static/charts/vendor/plot.js';
import { buildSeries, aggregateTable, MEASURES, SPLITS } from '/static/charts/src/series.js';
import { formatCount, formatTons } from '/static/landing/src/table.js';
import { queryUrl, fetchRows } from '/static/globe/src/api.js';

const { origin, dest, year: yearText } = document.body.dataset;
const year = yearText ? Number(yearText) : null;
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const state = {
  measure: Object.hasOwn(MEASURES, params.get('measure')) ? params.get('measure') : 'passengers',
  split: Object.hasOwn(SPLITS, params.get('split')) ? params.get('split') : 'carrier',
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const routePath = (y) => `/route/${origin}/${dest}${y ? `/${y}` : ''}`;

let allRows = [];   // the route, every year
let viewRows = [];  // the rows behind the chart and table: all years, or one year by month

function pushState() {
  const q = new URLSearchParams(location.search);
  q.set('measure', state.measure);
  q.set('split', state.split);
  history.replaceState(null, '', `${location.pathname}?${q}`);
}

function fillSelect(select, options, value) {
  for (const [k, label] of Object.entries(options)) select.append(new Option(label, k));
  select.value = value;
}

function drawChart() {
  const monthly = year !== null;
  const res = buildSeries(viewRows, { ...state, periodKey: monthly ? 'month' : 'year' });
  const box = $('route-chart-plot');
  box.replaceChildren();
  if (!res.points.length) { box.textContent = 'No data to chart for this selection.'; return; }
  const domain = monthly ? MONTHS.map((_, i) => String(i + 1)) : res.periods.map(String);
  const labelEvery = monthly || domain.length <= 15 ? 1 : 5;
  const data = res.points.map((p) => ({
    ...p,
    x: String(p.period),
    href: monthly ? null : routePath(p.period),
  }));
  const x = {
    label: null, domain,
    tickFormat: (d) => (monthly ? MONTHS[Number(d) - 1] : Number(d) % labelEvery === 0 ? d : ''),
  };
  const bars = Plot.barY(data, { x: 'x', y: 'value', fill: 'series', tip: true, ...(monthly ? {} : { href: 'href' }) });
  const marks = res.stackable
    ? [bars, Plot.ruleY([0])]
    : [Plot.lineY(data, { x: 'x', y: 'value', stroke: 'series' }), Plot.dot(data, { x: 'x', y: 'value', stroke: 'series', tip: true }), Plot.ruleY([0])];
  box.append(Plot.plot({
    width: Math.min(box.clientWidth || 800, 1000),
    height: 420,
    marginLeft: 64,
    style: { background: 'transparent', fontSize: '12px' },
    x: { ...x, type: res.stackable ? 'band' : 'point' },
    y: { grid: true, label: MEASURES[state.measure], tickFormat: state.measure === 'load_factor' ? 'd' : '~s', ...(state.measure === 'load_factor' ? { domain: [0, 100] } : {}) },
    color: { legend: true, domain: res.series, scheme: 'tableau10' },
    marks,
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

function drawTable() {
  const body = document.querySelector('#route-table tbody');
  body.replaceChildren();
  for (const t of aggregateTable(viewRows)) {
    const tr = document.createElement('tr');
    tr.append(
      cell(t.carrier, 'left'), cell(t.aircraft, 'left'),
      cell(formatCount(t.deps), 'num', t.deps.toLocaleString('en-US')),
      cell(formatCount(t.seats), 'num', t.seats.toLocaleString('en-US')),
      cell(formatCount(t.passengers), 'num', t.passengers.toLocaleString('en-US')),
      cell(t.loadFactor === null ? '–' : `${t.loadFactor.toFixed(1)}%`, 'num'),
      cell(formatTons(t.freight * 2000), 'num', `${Math.round(t.freight * 2000).toLocaleString('en-US')} lb`),
    );
    body.append(tr);
  }
  $('table-heading').textContent = year === null ? 'Carriers and aircraft, all years' : `Carriers and aircraft in ${year}`;
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
    if (i > 0) add(routePath(years[i - 1]), `‹ ${years[i - 1]}`);
    add(routePath(null), 'All years');
    if (i >= 0 && i < years.length - 1) add(routePath(years[i + 1]), `${years[i + 1]} ›`);
  } else if (years.length) {
    add(routePath(years.at(-1)), `Latest: ${years.at(-1)}`);
  }
}

async function main() {
  try {
    const all = await fetchRows(queryUrl('route', { origin, dest }));
    allRows = all.rows;
    viewRows = allRows;
    if (year !== null) {
      const monthly = await fetchRows(queryUrl('route_year', { origin, dest, year }));
      viewRows = monthly.rows;
    }
  } catch (err) {
    console.error(err);
    $('status').textContent = 'Could not load the data. Try again in a moment.';
    $('route-chart-plot').textContent = '';
    return;
  }
  if (!allRows.length) { $('status').textContent = `No flights from ${origin} to ${dest} in the data.`; return; }
  const years = [...new Set(allRows.map((r) => Number(r.year)))].sort((a, b) => a - b);
  const first = allRows[0];
  $('subtitle').textContent = `${first.origin_city_name || origin} to ${first.dest_city_name || dest}`;
  drawYears(years);
  if (year !== null && !viewRows.length) {
    $('status').textContent = `No flights from ${origin} to ${dest} in ${year}.`;
    return;
  }
  const mapLink = $('map-link');
  mapLink.href = `/globe/${origin}${year !== null ? `?year=${year}` : ''}`;
  $('raw-link').href = year === null
    ? `/t100/route?origin=${origin}&dest=${dest}&_hide_sql=1`
    : `/t100/route_year?origin=${origin}&dest=${dest}&year=${year}&_hide_sql=1`;
  fillSelect($('chart-measure'), MEASURES, state.measure);
  fillSelect($('chart-split'), SPLITS, state.split);
  $('chart-measure').addEventListener('change', (e) => { state.measure = e.target.value; pushState(); drawChart(); });
  $('chart-split').addEventListener('change', (e) => { state.split = e.target.value; pushState(); drawChart(); });
  $('route-chart').hidden = false;
  $('route-table').hidden = false;
  drawChart();
  drawTable();
}

main();
