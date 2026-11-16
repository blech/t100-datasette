import { queryUrl, fetchRows } from '/static/globe/src/api.js';
import { setDataLink } from '/static/common/datalink.js';
import { palette, isDark } from '/static/common/palette.js';
import { drawPassengerBands } from '/static/common/bandchart.js';
import { OTHER_AIRLINES } from '/static/home/src/airlines.js';
import { mergerBands } from '/static/charts/src/mergers.js';

const box = document.getElementById('passenger-chart');
let rows = null;

function failed(err) {
  console.error(err);
  box.replaceChildren(Object.assign(document.createElement('p'), { className: 'graphic-status', textContent: "Couldn't load this chart." }));
}

function draw() {
  const { series, bands, colours, years } = mergerBands(rows);
  if (!series.length) { box.textContent = 'Nothing to chart.'; return; }
  const all = new Map(colours).set(OTHER_AIRLINES, palette(isDark()).other);
  drawPassengerBands(box, { series, bands, colourOf: (name) => all.get(name), minYear: years[0], maxYear: years[1] });
}

async function main() {
  setDataLink('carrier_member_by_year', {});
  rows = (await fetchRows(queryUrl('carrier_member_by_year'))).rows;
  draw();
}

main().catch(failed);
// the colours follow the theme
document.addEventListener('t100:theme', () => { if (rows) draw(); });
