import * as Plot from '/static/charts/vendor/plot.js';
import { setDataLink } from '/static/common/datalink.js';
import { MATRIX_MEASURES } from '/static/charts/src/matrix.js';
import { buildFamilySeries, hasVersions, SPLIT_LABEL } from '/static/charts/src/rollup.js';
import { seriesColours, isDark } from '/static/common/palette.js';
import { shortNames } from '/static/charts/src/names.js';
import { parseSpan, yearDomain } from '/static/charts/src/span.js';
import { queryUrl, fetchRows } from '/static/globe/src/api.js';
import { periodRows, attachPopover } from '/static/common/popover.js';
import { attachHighlight, parseHighlight, highlightedSeries } from '/static/common/highlight.js';
import { formatCount, millionsAxis } from '/static/common/numbers.js';
import { replaceSearch } from '/static/nav/src/state.js';

// the tallest stack, which sets the y axis's scale
const stackMax = (points, key, value = (p) => p.value) => {
  const sums = new Map();
  for (const p of points) sums.set(p[key], (sums.get(p[key]) || 0) + value(p));
  return Math.max(0, ...sums.values());
};

// A family page charts family_detail for its family; an aircraft page charts aircraft_detail for one type id (see templates/aircraft.html)
const { family = '', query = 'family_detail', param = 'family', subject = family, title = family, defaultSplit = null } = document.body.dataset;
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const pick = (key, allowed, fallback) => (allowed.includes(params.get(key)) ? params.get(key) : fallback);
const state = {
  measure: pick('measure', Object.keys(MATRIX_MEASURES), 'passengers'),
  kind: pick('flights', ['passenger', 'freight', 'all'], 'passenger'),
  service: pick('service', ['all', 'domestic', 'international'], 'all'),
  split: pick('split', defaultSplit ? ['all', 'service'] : ['subfamily', 'airline', 'service'], defaultSplit),
  span: parseSpan(params.get('span')),
};
const bounds = { min: Number(document.body.dataset.minYear), max: Number(document.body.dataset.maxYear) };
let rows = [];

const unit = () => MATRIX_MEASURES[state.measure].toLowerCase().replace(/ \(.*/, '');

function pushState() {
  const q = new URLSearchParams();
  if (state.measure !== 'passengers') q.set('measure', state.measure);
  if (state.kind !== 'passenger') q.set('flights', state.kind);
  if (state.service !== 'all') q.set('service', state.service);
  q.set('split', state.split);
  if (state.span !== 'flown') q.set('span', state.span);
  history.replaceState(null, '', `${location.pathname}${replaceSearch(location.search, ['measure', 'flights', 'service', 'split', 'span'], `?${q}`)}`);
}

// "Highlighting Delta (incl. Northwest) · clear", or why it isn't shown; hidden when there is nothing to say
// the data behind the page, narrowed to the airline it's highlighting, if any
const dataLink = () => setDataLink(query, { [param]: subject, ...(query === 'family_detail' ? { group: parseHighlight(location.search)?.id ?? '' } : {}) });

function highlightLine(highlight, wanted, byAirline) {
  const line = $('highlight-line');
  const name = highlight && rows.find((r) => r.group_id === highlight.id)?.group_name;
  line.hidden = !name;
  if (!name) return;
  const splitLabel = $('fam-split').selectedOptions[0]?.textContent || state.split;
  const text = !byAirline ? `${name} isn't shown when split by ${splitLabel}`
    : wanted.size ? `Highlighting ${name}` : `${name} doesn't appear here`;
  const clear = Object.assign(document.createElement('a'), { href: '#', textContent: 'clear' });
  clear.addEventListener('click', (e) => {
    e.preventDefault();
    const q = new URLSearchParams(location.search);
    q.delete('highlight');
    history.replaceState(null, '', `${location.pathname}${q.size ? `?${q}` : ''}`);
    dataLink();
    draw();
  });
  line.replaceChildren(`${text} · `, clear);
}

function draw() {
  const box = $('family-chart');
  box.replaceChildren();
  // an airline carried here by ?highlight= (from a route's table) is picked out, and never folded into Other
  const highlight = parseHighlight(location.search);
  const byAirline = state.split === 'airline';
  const wanted = byAirline ? highlightedSeries(rows, highlight, SPLIT_LABEL.airline) : new Set();
  highlightLine(highlight, wanted, byAirline);
  const res = buildFamilySeries(rows, { ...state, keep: wanted });
  if (!res.points.length) { box.textContent = `No ${unit()} for this selection.`; return; }
  const years = yearDomain(res.years, { span: state.span, ...bounds }).map(String);
  const labelEvery = years.length <= 15 ? 1 : 5;
  const data = res.points.map((p) => ({ ...p, year: String(p.year) }));
  const tips = periodRows(data, { key: (p) => p.year, order: res.series, format: (v) => formatCount(v) });
  const colors = { ...seriesColours(res.series, isDark()), legend: true };
  const chart = Plot.plot({
    width: Math.min(box.clientWidth || 900, 1100),
    height: 420,
    marginLeft: 64,
    style: { background: 'transparent', fontSize: '12px' },
    x: { type: 'band', domain: years, label: null, tickFormat: (d) => (Number(d) % labelEvery === 0 ? d : '') },
    y: { ...millionsAxis(stackMax(res.points, 'year'), MATRIX_MEASURES[state.measure]), grid: true },
    color: colors,
    marks: [
      Plot.barY(data, { x: 'year', y: 'value', fill: 'series', order: res.series }),
      Plot.ruleX(tips, Plot.pointerX({ x: 'period', strokeOpacity: 0 })),
      Plot.ruleY([0]),
    ],
  });
  attachHighlight(chart, { pinned: wanted });
  box.append(...attachPopover(chart, { content: (d) => ({ title: `${title}, ${d.period}`, rows: d.rows }), at: (d) => [d.period, d.top] }));
}

function chooseSplit() {
  if (defaultSplit) return;   // an aircraft page offers only the splits its template lists
  // a family with several versions is most interesting split by version; otherwise by airline.
  // A family with one version has nothing to split, so the option is not offered and an old link falls back to airline.
  const versions = hasVersions(rows);
  if (!versions) $('fam-split').querySelector('option[value="subfamily"]')?.remove();
  if (!state.split || (state.split === 'subfamily' && !versions)) state.split = versions ? 'subfamily' : 'airline';
}

async function main() {
  dataLink();
  const measure = $('fam-measure');
  for (const [k, label] of Object.entries(MATRIX_MEASURES)) measure.append(new Option(label.toLowerCase(), k));
  try {
    rows = (await fetchRows(queryUrl(query, { [param]: subject }))).rows;
    if (rows.some((r) => r.group_name)) {
      const shorts = shortNames(rows.map((r) => r.group_name));
      rows = rows.map((r) => ({ ...r, group_name: shorts.get(r.group_name) }));
    }
  } catch (err) {
    console.error(err);
    $('family-chart').textContent = 'Could not load the chart data.';
    return;
  }
  chooseSplit();
  measure.value = state.measure;
  $('fam-kind').value = state.kind;
  $('fam-service').value = state.service;
  $('fam-split').value = state.split;
  $('fam-span').value = state.span;
  for (const [id, field] of [['fam-measure', 'measure'], ['fam-kind', 'kind'], ['fam-service', 'service'], ['fam-split', 'split'], ['fam-span', 'span']]) {
    $(id).addEventListener('change', (e) => { state[field] = e.target.value; pushState(); draw(); });
  }
  document.addEventListener('t100:theme', () => draw());
  draw();
}

main();
