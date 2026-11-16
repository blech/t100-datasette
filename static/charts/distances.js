import * as Plot from '/static/charts/vendor/plot.js';
import { setDataLink } from '/static/common/datalink.js';
import { profile, measuresOffered, summaryText, noteText, barLayout } from '/static/charts/src/distances.js';
import { queryUrl, fetchRows } from '/static/globe/src/api.js';
import { attachPopover } from '/static/common/popover.js';
import { palette, isDark } from '/static/common/palette.js';
import { formatCount, formatTons, exactCount, millionsAxis } from '/static/common/numbers.js';
import { replaceSearch } from '/static/nav/src/state.js';
import { parseDir, setDir } from '/static/common/direction.js';

// An airport's distances page: its flight segments in the latest full year, by distance, on the x-axis every airport shares;
// or, with no airport (/airports/distances), every airport pair's
const data = document.body.dataset;
const origin = data.origin || null;
const year = Number(data.year);
const axisMax = Number(data.axisMax);
const check = { ratio: Number(data.ratio), miles: Number(data.miles) };
const dir = parseDir(location.search);
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

const LABELS = { passengers: 'passengers', deps: 'flight segments', freight: 'freight' };
const LB_PER_SHORT_TON = 2000;
const shown = (measure, v) => (measure === 'freight' ? v / LB_PER_SHORT_TON : v); // freight is charted in short tons
const valueText = (measure, v) => (measure === 'freight' ? formatTons(v) : formatCount(v));
const miles = (n) => `${exactCount(n)} miles`;

let rows = [];

// bars a set number of pixels wide whatever the chart's width: wide ones to read the shape, or one-pixel columns
const BARS = { wide: { label: 'wide bars', pixels: 20 }, fine: { label: 'one-pixel columns', pixels: 1 } };
const MARGIN = { left: 64, right: 20 };

function remember() {
  const m = $('ds-measure').value;
  const b = $('ds-bars').value;
  const s = new URLSearchParams({ ...(m === 'passengers' ? {} : { measure: m }), ...(b === 'wide' ? {} : { bars: b }) }).toString();
  history.replaceState(null, '', `${location.pathname}${replaceSearch(location.search, ['measure', 'bars'], s ? `?${s}` : '')}`);
}

function draw() {
  const measure = $('ds-measure').value;
  const fine = $('ds-bars').value === 'fine';
  const box = $('distance-chart');
  const width = Math.floor(Math.min(box.clientWidth || 900, 1100));
  const { count, marginRight } = barLayout(width, { marginLeft: MARGIN.left, marginRight: MARGIN.right, pixels: BARS[$('ds-bars').value].pixels });
  const p = profile(rows, { measure, count, max: axisMax, origin, ...check });
  const extra = $('distance-note-extra') || $('distance-note').appendChild(Object.assign(document.createElement('span'), { id: 'distance-note-extra' }));
  extra.textContent = noteText(p, measure);
  if (p.empty) {
    box.textContent = p.unavailable ? 'Distances aren\'t available yet.' : `No ${LABELS[measure]}${origin ? ` at ${origin}` : ''} in ${year}.`;
    $('distance-summary').textContent = '';
    return;
  }
  $('distance-summary').textContent = summaryText(origin, year, measure, p.median);
  const bars = p.bins.filter((b) => !fine || b.value).map((b) => ({ ...b, mid: (b.from + b.to) / 2, y: shown(measure, b.value) }));
  const top = Math.max(0, ...bars.map((b) => b.y));
  const label = measure === 'freight' ? 'Freight, short tons' : `${LABELS[measure][0].toUpperCase()}${LABELS[measure].slice(1)}`;
  const chart = Plot.plot({
    width, height: 340, marginLeft: MARGIN.left, marginRight, marginBottom: 44,
    style: { background: 'transparent', fontSize: '12px' },
    x: { domain: [0, axisMax], label: 'Distance (miles)', labelAnchor: 'center', labelArrow: 'none', tickFormat: (v) => exactCount(v) },
    y: { ...millionsAxis(top, label), grid: true, tickSize: 0 },
    marks: [
      Plot.rectY(bars, { x1: 'from', x2: 'to', y: 'y', fill: palette(isDark()).accent, ...(fine ? {} : { insetLeft: 0.5, insetRight: 0.5 }) }),
      Plot.ruleY([0]),
      Plot.ruleX(bars, Plot.pointerX({ x: 'mid', y: 'y', strokeOpacity: 0 })),
    ],
  });
  box.replaceChildren(...attachPopover(chart, {
    content: (b) => ({
      title: `${exactCount(b.from)}–${miles(b.to)}`,
      rows: [{ label: LABELS[measure], value: valueText(measure, b.value), extra: `${formatCount(b.share * 100)}%` },
        ...b.top.map((d) => ({ label: d.dest, value: valueText(measure, d.value), extra: '' })),
        ...(b.more ? [{ label: `… and ${exactCount(b.more)} more`, value: '', extra: '' }] : [])],
    }),
    at: (b) => [b.mid, b.y],
    keyOf: () => ({ kind: 'none' }),
  }));
}

async function main() {
  // an airport's destinations, or every pair (labelled A–B for the popovers) with no airport
  const [query, args] = origin ? ['routes_by_year', { origin, dir, year, min_deps: 0 }] : ['pair_distances_by_year', { year }];
  if (origin) $('dir').addEventListener('change', (e) => setDir(e.target.value));
  setDataLink(query, args);
  try {
    rows = (await fetchRows(queryUrl(query, args))).rows;
    if (!origin) rows = rows.map((r) => ({ ...r, dest: `${r.a}–${r.b}` }));
  } catch (err) {
    $('distance-chart').textContent = 'Could not load the chart data.';
    return;
  }
  const offered = measuresOffered(rows);
  for (const m of offered) $('ds-measure').append(new Option(LABELS[m], m));
  $('ds-measure').value = offered.includes(params.get('measure')) ? params.get('measure') : 'passengers';
  for (const [value, { label }] of Object.entries(BARS)) $('ds-bars').append(new Option(label, value));
  $('ds-bars').value = Object.hasOwn(BARS, params.get('bars') ?? '') ? params.get('bars') : 'wide';
  for (const id of ['ds-measure', 'ds-bars']) $(id).addEventListener('change', () => { remember(); draw(); });
  draw();
  document.addEventListener('t100:theme', draw);
  let drawnAt = $('distance-chart').clientWidth;
  new ResizeObserver(() => { // the bars are sized in pixels, so a new width means new bins
    const w = $('distance-chart').clientWidth;
    if (w !== drawnAt) { drawnAt = w; draw(); }
  }).observe($('distance-chart'));
}

main();
