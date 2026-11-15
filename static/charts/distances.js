import * as Plot from '/static/charts/vendor/plot.js';
import { setDataLink } from '/static/common/datalink.js';
import { profile, measuresOffered, summaryText, noteText } from '/static/charts/src/distances.js';
import { queryUrl, fetchRows } from '/static/globe/src/api.js';
import { attachPopover } from '/static/common/popover.js';
import { palette, isDark } from '/static/common/palette.js';
import { formatCount, formatTons, exactCount, millionsAxis } from '/static/common/numbers.js';
import { replaceSearch } from '/static/nav/src/state.js';
import { parseDir, setDir } from '/static/common/direction.js';

// An airport's distances page: its flight segments in the latest full year, by distance, on the x-axis every airport shares
const data = document.body.dataset;
const origin = data.origin;
const year = Number(data.year);
const axisMax = Number(data.axisMax);
const check = { ratio: Number(data.ratio), miles: Number(data.miles) };
const bin = Number(data.bin);
const dir = parseDir(location.search);
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

const LABELS = { passengers: 'passengers', deps: 'flight segments', freight: 'freight' };
const LB_PER_SHORT_TON = 2000;
const shown = (measure, v) => (measure === 'freight' ? v / LB_PER_SHORT_TON : v); // freight is charted in short tons
const valueText = (measure, v) => (measure === 'freight' ? formatTons(v) : formatCount(v));
const miles = (n) => `${exactCount(n)} miles`;

let rows = [];

function remember(measure) {
  const s = measure === 'passengers' ? '' : `?measure=${measure}`;
  history.replaceState(null, '', `${location.pathname}${replaceSearch(location.search, ['measure'], s)}`);
}

function draw() {
  const measure = $('ds-measure').value;
  const box = $('distance-chart');
  const p = profile(rows, { measure, bin, max: axisMax, origin, ...check });
  const extra = $('distance-note-extra') || $('distance-note').appendChild(Object.assign(document.createElement('span'), { id: 'distance-note-extra' }));
  extra.textContent = noteText(p, measure);
  if (p.empty) {
    box.textContent = p.unavailable ? 'Distances aren\'t available yet.' : `No ${LABELS[measure]} at ${origin} in ${year}.`;
    $('distance-summary').textContent = '';
    return;
  }
  $('distance-summary').textContent = summaryText(origin, year, measure, p.median);
  const bars = p.bins.map((b) => ({ ...b, mid: (b.from + b.to) / 2, y: shown(measure, b.value) }));
  const top = Math.max(0, ...bars.map((b) => b.y));
  const label = measure === 'freight' ? 'Freight, short tons' : `${LABELS[measure][0].toUpperCase()}${LABELS[measure].slice(1)}`;
  const chart = Plot.plot({
    width: Math.min(box.clientWidth || 900, 1100), height: 340, marginLeft: 64, marginBottom: 44,
    style: { background: 'transparent', fontSize: '12px' },
    x: { domain: [0, axisMax], label: 'Distance (miles)', labelAnchor: 'center', labelArrow: 'none', tickFormat: (v) => exactCount(v) },
    y: { ...millionsAxis(top, label), grid: true, tickSize: 0 },
    marks: [
      Plot.rectY(bars, { x1: 'from', x2: 'to', y: 'y', fill: palette(isDark()).accent, insetLeft: 0.5, insetRight: 0.5 }),
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
  $('dir').addEventListener('change', (e) => setDir(e.target.value));
  setDataLink('routes_by_year', { origin, dir, year, min_deps: 0 });
  try {
    rows = (await fetchRows(queryUrl('routes_by_year', { origin, dir, year, min_deps: 0 }))).rows;
  } catch (err) {
    $('distance-chart').textContent = 'Could not load the chart data.';
    return;
  }
  const offered = measuresOffered(rows);
  for (const m of offered) $('ds-measure').append(new Option(LABELS[m], m));
  $('ds-measure').value = offered.includes(params.get('measure')) ? params.get('measure') : 'passengers';
  $('ds-measure').addEventListener('change', () => { remember($('ds-measure').value); draw(); });
  draw();
  document.addEventListener('t100:theme', draw);
}

main();
