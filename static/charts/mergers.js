import { queryUrl, fetchRows } from '/static/globe/src/api.js';
import { setDataLink } from '/static/common/datalink.js';
import { formatCount } from '/static/common/numbers.js';
import { palette, isDark } from '/static/common/palette.js';
import { drawPassengerBands } from '/static/common/bandchart.js';
import { OTHER_AIRLINES } from '/static/home/src/airlines.js';
import { mergerBands } from '/static/charts/src/mergers.js';

const box = document.getElementById('passenger-chart');
const groupsBox = document.getElementById('group-charts');
let rows = null;

function failed(err) {
  console.error(err);
  box.replaceChildren(Object.assign(document.createElement('p'), { className: 'graphic-status', textContent: "Couldn't load this chart." }));
}

// each group on its own, on a scale of its own (every chart says so on its axis, and its heading gives its peak), the same years across
function drawGroups(groups, colourOf, years) {
  groupsBox.replaceChildren(...groups.map((g) => {
    const section = Object.assign(document.createElement('section'), { className: 'group-chart' });
    const title = document.createElement('h3');
    const link = Object.assign(document.createElement('a'), { href: `/airlines/${g.id}`, textContent: g.survivor });
    title.append(link, Object.assign(document.createElement('span'), { className: 'peak', textContent: ` peak ${formatCount(g.peak.passengers)} in ${g.peak.year}` }));
    const chart = Object.assign(document.createElement('div'), { className: 'graphic chart-box' });
    section.append(title, chart);
    // the section is in the page before it is drawn, so the chart can measure its width
    queueMicrotask(() => drawPassengerBands(chart, { series: g.members, bands: g.bands, colourOf, minYear: years[0], maxYear: years[1], rest: false }));
    return section;
  }));
}

function draw() {
  const { series, bands, colours, years, groups } = mergerBands(rows);
  if (!series.length) { box.textContent = 'Nothing to chart.'; return; }
  const all = new Map(colours).set(OTHER_AIRLINES, palette(isDark()).other);
  const colourOf = (name) => all.get(name);
  drawPassengerBands(box, { series, bands, colourOf, minYear: years[0], maxYear: years[1] });
  drawGroups(groups, colourOf, years);
}

async function main() {
  setDataLink('carrier_member_by_year', {});
  rows = (await fetchRows(queryUrl('carrier_member_by_year'))).rows;
  draw();
}

main().catch(failed);
// the colours follow the theme
document.addEventListener('t100:theme', () => { if (rows) draw(); });
