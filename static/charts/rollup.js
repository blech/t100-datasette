import * as Plot from '/static/charts/vendor/plot.js';
import { buildHeatmap, HEAT_MEASURES } from '/static/charts/src/heatmap.js';
import { rollupRows, slugify } from '/static/charts/src/rollup.js';
import { shortNames } from '/static/charts/src/names.js';
import { queryUrl, fetchRows } from '/static/globe/src/api.js';
import { replaceSearch } from '/static/nav/src/state.js';

const KINDS = {
  aircraft: { query: 'family_by_year', key: 'family', noun: 'aircraft family' },
  carriers: { query: 'carrier_group_by_year', key: 'group_name', noun: 'airline' },
};
const kind = document.body.dataset.kind;
const page = KINDS[kind];
const latestFullYear = Number(document.body.dataset.latestYear);
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const pick = (key, allowed, fallback) => (allowed.includes(params.get(key)) ? params.get(key) : fallback);
const state = {
  measure: pick('measure', Object.keys(HEAT_MEASURES), 'passengers'),
  flights: pick('flights', ['passenger', 'freight', 'all'], 'passenger'),
  service: pick('service', ['all', 'domestic', 'international'], 'all'),
  n: Number(pick('n', ['10', '25', '50'], '50')),
  rank: pick('rank', ['all', 'latest'], 'all'),
  scale: pick('scale', ['absolute', 'year', 'busiest'], 'year'),
};
let rows = [];

const ROW_PX = 20;
const unit = () => HEAT_MEASURES[state.measure].toLowerCase().replace(/ \(.*/, '');
const fmtPct = (s) => `${(s * 100).toFixed(s < 0.1 ? 1 : 0)}%`;
const fmtValue = (v) => Math.round(v).toLocaleString('en-US');
const fillField = () => ({ absolute: 'value', year: 'share', busiest: 'peak' }[state.scale]);
const relative = () => state.scale !== 'absolute';
const rankYear = () => (state.rank === 'latest' ? latestFullYear : null);

function pushState() {
  const q = new URLSearchParams();
  if (state.measure !== 'passengers') q.set('measure', state.measure);
  if (state.flights !== 'passenger') q.set('flights', state.flights);
  if (state.service !== 'all') q.set('service', state.service);
  if (state.n !== 50) q.set('n', state.n);
  if (state.rank !== 'all') q.set('rank', state.rank);
  if (state.scale !== 'year') q.set('scale', state.scale);
  const s = q.toString();
  history.replaceState(null, '', `${location.pathname}${replaceSearch(location.search, ['measure', 'flights', 'service', 'n', 'rank', 'scale'], s ? `?${s}` : '')}`);
}

const withShare = (c, text) => ({
  absolute: text,
  year: `${text} (${fmtPct(c.share)} of the year)`,
  busiest: `${text} (${fmtPct(c.peak)} of the year's biggest)`,
}[state.scale]);

// airlines are named by their legal entity, which is long: label rows with the short name (the full one is the hover text)
let shorts = new Map();
const labelOf = (name) => shorts.get(name) || name;

// an aircraft family's label opens its own page, carrying over the measure and filters chosen here
function familyHref(name) {
  if (kind === 'carriers') {
    const id = rows.find((r) => r.group_name === name)?.group_id;
    return id ? `/carriers/${id}` : undefined;
  }
  if (kind !== 'aircraft') return undefined;
  const q = new URLSearchParams();
  if (state.measure !== 'passengers') q.set('measure', state.measure);
  if (state.flights !== 'passenger') q.set('flights', state.flights);
  if (state.service !== 'all') q.set('service', state.service);
  const s = q.toString();
  return `/aircraft/${slugify(name)}${s ? `?${s}` : ''}`;
}

function draw() {
  $('scale-note').hidden = !relative();
  $('scale-note').textContent = {
    absolute: '',
    year: `Colour shows each ${page.noun}'s share of all ${unit()} that year, counting every ${page.noun} (not just those listed), not the amount itself. Hover over a cell for both.`,
    busiest: `Colour compares each cell with the year's biggest ${page.noun}: the biggest is 100%, one with half as many ${unit()} is 50%. Each year is judged on its own. Hover over a cell for both.`,
  }[state.scale];
  $('heat-rank').options[1].textContent = `${latestFullYear} only`;
  $('rank-note').textContent = `Rows are ranked by the measure ${rankYear() === null ? 'summed over all years' : `in ${rankYear()} alone, so ones that did not fly then are not shown`}. Each cell is one ${page.noun} in one year; blank means none. Freight is in short tons (2,000 lb).${kind === 'aircraft' ? ' Click a family\'s name to see it on its own page.' : ''}${kind === 'carriers' ? ' Click an airline\'s name to see its routes. Airlines that merged are counted together for every year, including years before the merger.' : ''}`;

  const box = $('heatmap');
  box.replaceChildren();
  const res = buildHeatmap(rollupRows(rows, { key: page.key, kind: state.flights }), { ...state, rankYear: rankYear() });
  if (!res.cells.length) { box.textContent = 'Nothing to chart for this selection.'; return; }
  const years = res.years.map(String);
  const labelEvery = years.length <= 15 ? 1 : 5;
  const data = res.cells.map((c) => ({
    ...c,
    year: String(c.year),
    title: `${c.dest}\n${withShare(c, `${c.year}: ${fmtValue(c.value)} ${unit()}`)}`,
  }));
  box.append(Plot.plot({
    width: Math.min(box.clientWidth || 900, 1200),
    height: res.dests.length * ROW_PX + 90,
    marginLeft: 190,
    marginTop: 30,
    padding: 0.08,
    style: { background: 'transparent', fontSize: '12px' },
    x: { type: 'band', domain: years, label: null, axis: 'top', tickFormat: (d) => (Number(d) % labelEvery === 0 ? d : '') },
    y: { type: 'band', domain: res.dests, axis: null },
    color: relative()
      ? { type: 'sqrt', scheme: 'YlOrRd', legend: true, label: state.scale === 'year' ? `Share of the year's ${unit()}` : `% of the year's biggest`, tickFormat: '.0%' }
      : { type: 'sqrt', scheme: 'YlOrRd', legend: true, label: HEAT_MEASURES[state.measure], tickFormat: '~s' },
    marks: [
      Plot.cell(data, { x: 'year', y: 'dest', fill: fillField(), title: 'title', tip: true }),
      Plot.text(res.dests.map((d) => ({ dest: d, label: labelOf(d), href: familyHref(d) })), { y: 'dest', text: 'label', title: 'dest', href: 'href', frameAnchor: 'left', textAnchor: 'end', dx: -8, fill: 'currentColor' }),
    ],
  }));
}

function fillControls() {
  const measure = $('heat-measure');
  for (const [k, label] of Object.entries(HEAT_MEASURES)) measure.append(new Option(label.toLowerCase(), k));
  measure.value = state.measure;
  $('heat-kind').value = state.flights;
  $('heat-service').value = state.service;
  $('heat-n').value = String(state.n);
  $('heat-rank').value = state.rank;
  for (const radio of document.querySelectorAll('input[name="scale"]')) {
    radio.checked = radio.value === state.scale;
    radio.addEventListener('change', () => { state.scale = radio.value; pushState(); draw(); });
  }
  const bind = (id, field, convert = String) => $(id).addEventListener('change', (e) => { state[field] = convert(e.target.value); pushState(); draw(); });
  bind('heat-measure', 'measure');
  bind('heat-kind', 'flights');
  bind('heat-service', 'service');
  bind('heat-n', 'n', Number);
  bind('heat-rank', 'rank');
}

async function main() {
  fillControls();
  try {
    const res = await fetchRows(queryUrl(page.query));
    rows = res.rows;
    if (kind === 'carriers') shorts = shortNames(rows.map((r) => r.group_name));
    if (res.truncated) $('rank-note').textContent = 'Too many rows: some are missing from this chart.';
  } catch (err) {
    console.error(err);
    $('heatmap').textContent = 'Could not load the chart data.';
    return;
  }
  draw();
}

main();
