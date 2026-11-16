import * as Plot from '/static/charts/vendor/plot.js';
import { formatCount, millionsAxis } from '/static/common/numbers.js';
import { periodRows, attachPopover } from '/static/common/popover.js';
import { attachHighlight } from '/static/common/highlight.js';
import { OTHER_AIRLINES } from '/static/home/src/airlines.js';
import { ALL_AIRLINES, bandKey, stackTotals } from '/static/common/bands.js';

// charts leave room on screen for the next section to show
export const chartHeight = () => Math.round(Math.min(380, window.innerHeight * 0.66));
const width = (box) => Math.min(box.clientWidth || 900, 1100);

const plotFrame = (box, height, { minYear, maxYear }) => ({
  width: width(box),
  height,
  marginTop: 32,
  marginBottom: 30,
  marginLeft: 48,
  marginRight: 20,
  style: { background: 'transparent', fontSize: '12px' },
  x: { label: null, tickFormat: 'd', domain: [minYear, maxYear] },
});

// each airline's band (filled through the colour scale, so the legend and highlight know it) and its top edge
const airlineBands = (bands, colourOf) => [
  Plot.areaY(bands, { x: 'year', y1: 'y1', y2: 'y2', fill: 'series', fillOpacity: 0.35, className: 'airline-band' }),
  Plot.lineY(bands, { x: 'year', y: 'y2', z: 'series', stroke: (d) => colourOf(d.series), strokeWidth: 1.5, className: 'band-edge' }),
];

// the highlight fades bands; fade the other bands' top edges with them (everyone else's dashed edge too)
function fadeEdges(plot, colourOf) {
  const svg = [...plot.querySelectorAll('svg')].at(-1);
  const hex = (c) => String(c).toLowerCase();
  plot.addEventListener('highlight', (e) => {
    const on = e.detail.length > 0;
    const keep = new Set(e.detail.map((s) => hex(colourOf(s))));
    for (const path of svg.querySelectorAll('.band-edge path')) path.classList.toggle('faded', on && !keep.has(hex(path.getAttribute('stroke'))));
    for (const path of svg.querySelectorAll('.others-edge path')) path.classList.toggle('faded', on && !e.detail.includes(OTHER_AIRLINES));
  });
}

// passengers carried: the airlines in `series` order, then everyone else, stacked to the whole market
function passengerChart(box, { series, bands, colourOf, minYear, maxYear }) {
  const height = chartHeight();
  const yMax = Math.max(...bands.map((d) => d.y2));
  const totalByYear = stackTotals(bands);
  const tips = periodRows([...bands, ...[...totalByYear].map(([year, y2]) => ({ year, series: ALL_AIRLINES, passengers: y2, y2 }))], {
    key: (d) => d.year, order: [...series, OTHER_AIRLINES, ALL_AIRLINES], value: (d) => d.passengers,
    format: (n) => formatCount(n), top: (ds) => Math.max(...ds.map((d) => d.y2)),
  });
  const others = bands.filter((d) => d.series === OTHER_AIRLINES);
  return Plot.plot({
    ...plotFrame(box, height, { minYear, maxYear }),
    y: { ...millionsAxis(yMax, 'Passengers'), domain: [0, yMax], grid: true, tickSize: 0, nice: true, ticks: 6 },
    color: { domain: [...series, OTHER_AIRLINES], range: [...series, OTHER_AIRLINES].map(colourOf), legend: true },
    marks: [
      ...airlineBands(bands.filter((d) => d.series !== OTHER_AIRLINES), colourOf),
      // everyone else: a faint grey, its top edge (the whole market) dashed in the text colour
      Plot.areaY(others, { x: 'year', y1: 'y1', y2: 'y2', fill: 'series', fillOpacity: 0.2 }),
      Plot.lineY(others, { x: 'year', y: 'y2', stroke: 'currentColor', strokeOpacity: 0.6, strokeWidth: 1.5, strokeDasharray: '4 3', className: 'others-edge' }),
      Plot.ruleY([0]),
      Plot.ruleX(tips, Plot.pointerX({ x: 'period', strokeOpacity: 0 })),
    ],
  });
}

// draw the stacked passenger chart into `box`, with its highlight and its popover listing every airline in the year
export function drawPassengerBands(box, { series, bands, colourOf, minYear, maxYear }) {
  const chart = passengerChart(box, { series, bands, colourOf, minYear, maxYear });
  attachHighlight(chart);
  fadeEdges(chart, colourOf);
  box.replaceChildren(...attachPopover(chart, {
    content: (d) => ({ title: String(d.period), rows: d.rows }), at: (d) => [d.period, d.top], keyOf: (label) => bandKey(label, colourOf),
  }));
}
