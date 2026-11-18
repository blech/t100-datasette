import * as Plot from '/static/charts/vendor/plot.js';
import { setDataLink } from '/static/common/datalink.js';
import { profile, measuresOffered, summaryText, barLayout } from '/static/charts/src/distances.js';
import { byYear, barHeight, scaleTop, readState, yearParams } from '/static/charts/src/distanceyears.js';
import { queryUrl, fetchRows } from '/static/globe/src/api.js';
import { syncRange, bindTrackPress } from '/static/globe/src/controls.js';
import { moveHandle, playStep } from '/static/globe/src/compare.js';
import { attachPopover } from '/static/common/popover.js';
import { palette, isDark } from '/static/common/palette.js';
import { formatCount, formatTons, exactCount, millionsAxis } from '/static/common/numbers.js';
import { replaceSearch } from '/static/nav/src/state.js';
import { parseDir, setDir } from '/static/common/direction.js';

// The distances pages: an airport's flight segments by distance, or with no airport (/airports/distances) every airport pair's,
// in any one year, on the x-axis every chart shares in every year. The year bar plays through the years, and its hollow handle
// shades an earlier year's shape over the bars.
const data = document.body.dataset;
const origin = data.origin || null;
const first = Number(data.firstYear);
const last = Number(data.lastYear);
const years = Array.from({ length: last - first + 1 }, (_, i) => first + i);
const axisMax = Number(data.axisMax);
const check = { ratio: Number(data.ratio), miles: Number(data.miles) };
const dir = parseDir(location.search);
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const state = readState(location.search, years, last);

const LABELS = { passengers: 'passengers', deps: 'flight segments', freight: 'freight' };
const valueText = (measure, v) => (measure === 'freight' ? formatTons(v) : formatCount(v));
const miles = (n) => `${exactCount(n)} miles`;
const PLAY_MS = 700;
const AHEAD = 2; // years fetched ahead while playing, on the overall page

// bars a set number of pixels wide whatever the chart's width: wide ones to read the shape, or one-pixel columns
const BARS = { wide: { label: 'wide bars', pixels: 20 }, fine: { label: 'one-pixel columns', pixels: 1 } };
const MARGIN = { left: 64, right: 20 };

// the rows of each year: an airport's arrive together; the overall page's one year at a time, each fetched once
const loaded = new Map();
const pending = new Map();
const queryFor = (year) => (origin ? ['routes_by_year', { origin, dir, year, min_deps: 0 }] : ['pair_distances_by_year', { year }]);

function loadYear(year) {
  if (loaded.has(year)) return Promise.resolve(loaded.get(year));
  if (!pending.has(year)) {
    pending.set(year, fetchRows(queryUrl(...queryFor(year))).then(({ rows }) => {
      const kept = rows.map((r) => ({ ...r, year, dest: `${r.a}–${r.b}` })); // a pair, labelled A–B in the popovers
      loaded.set(year, kept);
      return kept;
    }).finally(() => pending.delete(year)));
  }
  return pending.get(year);
}

async function loadAll() {
  const { rows } = await fetchRows(queryUrl('routes_by_year', { origin, dir, year: '', min_deps: 0 }));
  const grouped = byYear(rows);
  for (const y of years) loaded.set(y, grouped.get(y) || []);
}

const ensure = (year) => (origin ? Promise.resolve(loaded.get(year) || []) : loadYear(year));
const prefetch = (year) => { if (!origin) for (let y = year + 1; y <= Math.min(last, year + AHEAD); y++) loadYear(y).catch(() => {}); };

// one profile per year, measure and number of bars, kept until a new measure or width makes too many
const profiles = new Map();
function profileOf(year, measure, count) {
  const key = `${year}|${measure}|${count}`;
  if (!profiles.has(key)) {
    if (profiles.size > 400) profiles.clear();
    profiles.set(key, profile(loaded.get(year) || [], { measure, count, max: axisMax, origin, ...check }));
  }
  return profiles.get(key);
}

function remember() {
  const m = $('ds-measure').value;
  const b = $('ds-bars').value;
  const s = new URLSearchParams({
    ...(m === 'passengers' ? {} : { measure: m }), ...(b === 'wide' ? {} : { bars: b }), ...yearParams(state, last),
  }).toString();
  history.replaceState(null, '', `${location.pathname}${replaceSearch(location.search, ['measure', 'bars', 'year', 'compare', 'scale'], s ? `?${s}` : '')}`);
}

const range = { from: $('year-from'), to: $('year'), fill: $('range-fill') };

function draw() {
  const { year, compare, scale } = state;
  syncRange(range, years, year, compare);
  $('year-label').textContent = compare === null ? String(year) : `${compare}–${year}`;
  $('distance-year').textContent = String(year);
  setDataLink(...queryFor(year));
  if (!loaded.has(year)) return; // the overall page's year still on its way: drawn when it lands
  const measure = $('ds-measure').value;
  const fine = $('ds-bars').value === 'fine';
  const box = $('distance-chart');
  const width = Math.floor(Math.min(box.clientWidth || 900, 1100));
  const { count, marginRight } = barLayout(width, { marginLeft: MARGIN.left, marginRight: MARGIN.right, pixels: BARS[$('ds-bars').value].pixels });
  const p = profileOf(year, measure, count);
  if (p.empty) {
    box.textContent = p.unavailable ? 'Distances aren\'t available yet.' : `No ${LABELS[measure]}${origin ? ` at ${origin}` : ''} in ${year}.`;
    $('distance-summary').textContent = '';
    return;
  }
  $('distance-summary').textContent = summaryText(origin, year, measure, p.median);
  // the y scale holds still over every year loaded, so the shapes (or, as counts, the sizes) compare as the years change
  const top = scaleTop([...loaded.keys()].map((y) => profileOf(y, measure, count)), measure, scale) || 1;
  const bars = p.bins.filter((b) => !fine || b.value).map((b) => ({ ...b, mid: (b.from + b.to) / 2, y: barHeight(b, measure, scale) }));
  // the year compared with: a pale grey shape behind, in wide bars always, as one-pixel columns can't be read as a shape
  // (behind one-pixel columns, each wide bar is their average height, to stay on their scale); where the bars stand in
  // front of it, they're darkened up to its height, so both the rise and the fall show
  const wide = barLayout(width, { marginLeft: MARGIN.left, marginRight: MARGIN.right, pixels: BARS.wide.pixels }).count;
  const then = compare !== null && loaded.has(compare) ? profileOf(compare, measure, wide) : null;
  const ghost = then && !then.empty ? then.bins.map((b) => ({ ...b, y: (barHeight(b, measure, scale) * wide) / count })) : [];
  const under = ghost.length
    ? bars.map((b) => ({ ...b, y: Math.min(b.y, ghost[Math.min(ghost.length - 1, Math.floor((b.mid * ghost.length) / axisMax))].y) }))
      .filter((b) => b.y > 0)
    : [];
  const name = measure === 'freight' ? 'Freight, short tons' : `${LABELS[measure][0].toUpperCase()}${LABELS[measure].slice(1)}`;
  const y = scale === 'share'
    ? { label: `Share of the year's ${LABELS[measure]} (%)`, tickFormat: (v) => formatCount(v) }
    : millionsAxis(top, name);
  const colours = palette(isDark());
  const chart = Plot.plot({
    width, height: 340, marginLeft: MARGIN.left, marginRight, marginBottom: 44,
    style: { background: 'transparent', fontSize: '12px' },
    x: { domain: [0, axisMax], label: 'Distance (miles)', labelAnchor: 'center', labelArrow: 'none', tickFormat: (v) => exactCount(v) },
    y: { ...y, domain: [0, top], nice: true, grid: true, tickSize: 0 },
    marks: [
      ...(ghost.length ? [Plot.rectY(ghost, { x1: 'from', x2: 'to', y: 'y', fill: 'currentColor', fillOpacity: 0.14, insetLeft: 0.5, insetRight: 0.5 })] : []),
      Plot.rectY(bars, { x1: 'from', x2: 'to', y: 'y', fill: colours.accent, ...(fine ? {} : { insetLeft: 0.5, insetRight: 0.5 }) }),
      ...(under.length ? [Plot.rectY(under, { x1: 'from', x2: 'to', y: 'y', fill: '#000', fillOpacity: 0.18, ...(fine ? {} : { insetLeft: 0.5, insetRight: 0.5 }) })] : []),
      Plot.ruleY([0]),
      Plot.ruleX(bars, Plot.pointerX({ x: 'mid', y: 'y', strokeOpacity: 0 })),
    ],
  });
  box.replaceChildren(...attachPopover(chart, {
    content: (b) => ({
      title: `${exactCount(b.from)}–${miles(b.to)}, ${year}`,
      rows: [{ label: LABELS[measure], value: valueText(measure, b.value), extra: `${formatCount(b.share * 100)}%` },
        ...b.top.map((d) => ({ label: d.dest, value: valueText(measure, d.value), extra: '' })),
        ...(b.more ? [{ label: `… and ${exactCount(b.more)} more`, value: '', extra: '' }] : [])],
    }),
    at: (b) => [b.mid, b.y],
    keyOf: () => ({ kind: 'none' }),
  }));
}

// show a year (and comparison), waiting for the overall page's rows; a later move wins over one still loading
async function show(next) {
  Object.assign(state, next);
  remember();
  draw();
  const wanted = { ...state };
  try {
    await Promise.all([ensure(wanted.year), ...(wanted.compare !== null ? [ensure(wanted.compare)] : [])]);
  } catch (err) {
    if (state.year === wanted.year) $('distance-chart').textContent = `Could not load ${wanted.year}.`;
    return;
  }
  if (state.year === wanted.year && state.compare === wanted.compare) draw();
}

let playTimer = null;
function stop() {
  clearTimeout(playTimer);
  playTimer = null;
  $('play').textContent = '▶';
  $('play').setAttribute('aria-label', 'Play through the years');
}

// play moves the solid handle on a year at a time, keeping the hollow one where it is; from the end, it starts again
async function play() {
  if (playTimer !== null) { stop(); return; }
  $('play').textContent = '⏸';
  $('play').setAttribute('aria-label', 'Pause');
  const base = state.compare;
  const tick = async () => {
    const step = playStep(years, state.year, base);
    if (!step || playTimer === null) { stop(); return; }
    prefetch(step.year);
    await ensure(step.year).catch(() => {});
    if (playTimer === null) return; // paused while it loaded
    await show(step);
    playTimer = setTimeout(tick, PLAY_MS);
  };
  playTimer = setTimeout(tick, PLAY_MS);
  if (state.year === last) await show({ year: base ?? first, compare: null });
  prefetch(state.year);
}

function bindYears() {
  for (const el of [range.from, range.to]) { el.min = '0'; el.max = String(years.length - 1); }
  const move = (which, el) => () => { stop(); show(moveHandle(years, state, which, Number(el.value))); };
  range.to.addEventListener('input', move('year', range.to));
  range.from.addEventListener('input', move('compare', range.from));
  bindTrackPress($('range'), [range.to, range.from]);
  $('play').addEventListener('click', play);
  // ← → step the year, as the slider does; space plays: the maps' keys, left alone with a modifier or in a menu or text box
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.target?.closest?.('select, textarea, button, input:not([type=range]), [contenteditable]')) return;
    if (e.key === ' ') { e.preventDefault(); play(); return; }
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const i = years.indexOf(state.year) + (e.key === 'ArrowLeft' ? -1 : 1);
    if (i < 0 || i >= years.length) return;
    range.to.value = String(i);
    range.to.dispatchEvent(new Event('input'));
  });
}

async function main() {
  if (origin) $('dir').addEventListener('change', (e) => setDir(e.target.value));
  try {
    if (origin) await loadAll();
    else await Promise.all([loadYear(state.year), ...(state.compare !== null ? [loadYear(state.compare)] : [])]);
  } catch (err) {
    $('distance-chart').textContent = 'Could not load the chart data.';
    return;
  }
  const offered = measuresOffered([...loaded.values()].flat());
  for (const m of offered) $('ds-measure').append(new Option(LABELS[m], m));
  $('ds-measure').value = offered.includes(params.get('measure')) ? params.get('measure') : 'passengers';
  for (const [value, { label }] of Object.entries(BARS)) $('ds-bars').append(new Option(label, value));
  $('ds-bars').value = Object.hasOwn(BARS, params.get('bars') ?? '') ? params.get('bars') : 'wide';
  $('ds-scale').value = state.scale;
  for (const id of ['ds-measure', 'ds-bars']) $(id).addEventListener('change', () => { remember(); draw(); });
  $('ds-scale').addEventListener('change', () => { state.scale = $('ds-scale').value; remember(); draw(); });
  bindYears();
  draw();
  document.addEventListener('t100:theme', draw);
  let drawnAt = $('distance-chart').clientWidth;
  new ResizeObserver(() => { // the bars are sized in pixels, so a new width means new bins
    const w = $('distance-chart').clientWidth;
    if (w !== drawnAt) { drawnAt = w; draw(); }
  }).observe($('distance-chart'));
}

main();
