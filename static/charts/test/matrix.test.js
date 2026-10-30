import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMatrix, MATRIX_MEASURES, matrixMeasures } from '../src/matrix.js';

const r = (dest, year, passengers, extra = {}) => ({ dest, year, passengers, deps: passengers / 10, seats: passengers * 2, freight: 4000, service: 'international', ...extra });

const rows = [
  r('LHR', 2018, 300), r('LHR', 2019, 400),
  r('CDG', 2018, 100), r('CDG', 2019, 150),
  r('LAX', 2019, 1000, { service: 'domestic' }),
  r('ZZZ', 2019, 5),
];

test('destinations are ranked by the measure summed over all years, biggest first', () => {
  const res = buildMatrix(rows, { measure: 'passengers', service: 'all', n: 10 });
  assert.deepEqual(res.dests, ['LAX', 'LHR', 'CDG', 'ZZZ']);
});

test('only the top n destinations are kept', () => {
  const res = buildMatrix(rows, { measure: 'passengers', service: 'all', n: 2 });
  assert.deepEqual(res.dests, ['LAX', 'LHR']);
  assert.ok(res.cells.every((c) => ['LAX', 'LHR'].includes(c.dest)));
});

test('years span every year in the data, even those a kept destination skipped', () => {
  const res = buildMatrix(rows, { measure: 'passengers', service: 'all', n: 1 });
  assert.deepEqual(res.years, [2018, 2019]);
  assert.equal(res.cells.length, 1); // LAX only flew in 2019
});

test('service filter keeps only that service, and decides the ranking', () => {
  const dom = buildMatrix(rows, { measure: 'passengers', service: 'domestic', n: 10 });
  assert.deepEqual(dom.dests, ['LAX']);
  const intl = buildMatrix(rows, { measure: 'passengers', service: 'international', n: 10 });
  assert.deepEqual(intl.dests, ['LHR', 'CDG', 'ZZZ']);
});

test('freight is shown in short tons', () => {
  const res = buildMatrix([r('LHR', 2019, 1)], { measure: 'freight', service: 'all', n: 5 });
  assert.equal(res.cells[0].value, 2);
});

test('a destination in both tables for a year appears once per year', () => {
  const res = buildMatrix([r('LHR', 2019, 10), r('LHR', 2019, 5, { service: 'domestic' })], { measure: 'passengers', service: 'all', n: 5 });
  assert.equal(res.cells.length, 1);
  assert.equal(res.cells[0].value, 15);
});

test('cells with a zero value are dropped, and ties rank by code', () => {
  const res = buildMatrix([r('BBB', 2019, 7), r('AAA', 2019, 7), r('CCC', 2019, 0)], { measure: 'passengers', service: 'all', n: 5 });
  assert.deepEqual(res.dests, ['AAA', 'BBB']);
});

test('empty input is empty output', () => {
  assert.deepEqual(buildMatrix([], { measure: 'deps', service: 'all', n: 5 }), { dests: [], years: [], cells: [], yearTotals: {}, yearMax: {} });
});

test('menu of measures', () => {
  assert.deepEqual(Object.keys(MATRIX_MEASURES), ['passengers', 'freight', 'deps', 'seats']);
  assert.equal(MATRIX_MEASURES.freight, 'Freight');
  assert.deepEqual(Object.keys(matrixMeasures('out')), ['passengers', 'freight', 'deps', 'seats']);  // the count renamed in place
});

// ---- grouping by BTS market ----
import { buildCityMatrix, labelMargin } from '../src/matrix.js';

const c = (dest, year, passengers, market, city, extra = {}) =>
  ({ dest, year, passengers, deps: 1, seats: 1, freight: 0, service: 'international', market_id: market, city, ...extra });

const london = [
  c('LHR', 2018, 800, '30730', 'London, United Kingdom'), c('LHR', 2019, 900, '30730', 'London, United Kingdom'),
  c('LGW', 2019, 300, '30730', 'London, United Kingdom'), c('STN', 2019, 50, '30730', 'London, United Kingdom'),
  c('CDG', 2019, 3000, '30920', 'Paris, France'), c('ORY', 2019, 100, '30920', 'Paris, France'),
  c('DUB', 2019, 400, '31000', 'Dublin, Ireland'),
];
const group = { measure: 'passengers', service: 'all', n: 10, open: [] };

test('airports in one market become one row, ranked by the market total', () => {
  const res = buildCityMatrix(london, group);
  assert.deepEqual(res.rows.map((r) => r.label), ['Paris, France', 'London, United Kingdom', 'Dublin, Ireland']);
  const lon = res.cells.filter((x) => x.row === res.rows[1].key);
  assert.deepEqual(lon.map((x) => [x.year, x.value]), [[2018, 800], [2019, 1250]]);
});

test('a group row is labelled with the city alone; its airports, busiest first, are in codes', () => {
  const res = buildCityMatrix(london, group);
  assert.equal(res.rows[1].label, 'London, United Kingdom');
  assert.deepEqual(res.rows[1].codes, ['LHR', 'LGW', 'STN']);
  const many = ['A', 'B', 'C', 'D', 'E'].map((d, i) => c(d, 2019, 100 - i, '1', 'Big City'));
  assert.equal(buildCityMatrix(many, group).rows[0].label, 'Big City');
});

test('the city name comes from the busiest airport, not from the first or alphabetical row', () => {
  const rows = [c('EWR', 2019, 100, '31703', 'Newark, NJ'), c('JFK', 2019, 900, '31703', 'New York, NY'), c('HPN', 2019, 5, '31703', 'White Plains, NY')];
  assert.equal(buildCityMatrix(rows, group).rows[0].label, 'New York, NY');
});

test('every group can be opened, a one-airport city too, so its airport is there to follow', () => {
  const res = buildCityMatrix(london, group);
  assert.deepEqual(res.rows.map((r) => r.expandable), [true, true, true]);
  assert.deepEqual(buildCityMatrix(london, { ...group, open: ['31000'] }).rows.filter((r) => r.kind === 'airport').map((r) => r.code), ['DUB']);
  assert.ok(res.rows.every((r) => r.kind === 'group' && r.open === false));
});

test('an open group is followed by its airports, biggest first, with their own cells', () => {
  const res = buildCityMatrix(london, { ...group, open: ['30730'] });
  assert.deepEqual(res.rows.map((r) => r.kind + ':' + (r.code || r.key)), ['group:30920', 'group:30730', 'airport:LHR', 'airport:LGW', 'airport:STN', 'group:31000']);
  assert.equal(res.rows[1].open, true);
  const lgw = res.rows.find((r) => r.code === 'LGW');
  assert.deepEqual(res.cells.filter((x) => x.row === lgw.key).map((x) => [x.year, x.value]), [[2019, 300]]);
});

test('top n counts groups, not the airports shown under an open group', () => {
  const res = buildCityMatrix(london, { ...group, n: 1, open: ['30920'] });
  assert.deepEqual(res.rows.map((r) => r.kind + ':' + (r.code || r.key)), ['group:30920', 'airport:CDG', 'airport:ORY']);
});

test('airports without a market id stand alone, and a reused code in two markets stays apart', () => {
  const rows = [
    c('DOH', 2019, 500, null, 'Doha, Qatar'),
    c('SAW', 2019, 200, '32395', 'Istanbul, Turkey'),
    c('SAW', 2005, 1, '33459', 'Marquette, MI'),
  ];
  const res = buildCityMatrix(rows, group);
  assert.equal(res.rows.length, 3);
  assert.deepEqual(res.rows.map((r) => r.codes), [['DOH'], ['SAW'], ['SAW']]);
});

test('cells keep a per-airport breakdown for the tooltip, biggest first', () => {
  const res = buildCityMatrix(london, group);
  const cell = res.cells.find((x) => x.row === res.rows[1].key && x.year === 2019);
  assert.deepEqual(cell.parts, [{ dest: 'LHR', value: 900 }, { dest: 'LGW', value: 300 }, { dest: 'STN', value: 50 }]);
});

test('service filter and freight conversion apply in city mode too', () => {
  const rows = [c('LHR', 2019, 1, '1', 'London', { service: 'domestic', freight: 4000 }), c('LGW', 2019, 1, '1', 'London', { freight: 8000 })];
  const res = buildCityMatrix(rows, { measure: 'freight', service: 'international', n: 5, open: [] });
  assert.equal(res.cells[0].value, 4);
});

test('empty input', () => {
  assert.deepEqual(buildCityMatrix([], group), { rows: [], years: [], cells: [], yearTotals: {}, yearMax: {} });
});

// ---- ranking by one year ----
const shifted = [
  r('AAA', 2018, 1000), r('AAA', 2019, 10),
  r('BBB', 2018, 100), r('BBB', 2019, 500),
  r('CCC', 2018, 900),
];

test('ranking by all years is the default', () => {
  assert.deepEqual(buildMatrix(shifted, { n: 10 }).dests, ['AAA', 'CCC', 'BBB']);
  assert.deepEqual(buildMatrix(shifted, { n: 10, rankYear: null }).dests, ['AAA', 'CCC', 'BBB']);
});

test('ranking by a year uses that year alone, and drops destinations that did not fly then', () => {
  const res = buildMatrix(shifted, { n: 10, rankYear: 2019 });
  assert.deepEqual(res.dests, ['BBB', 'AAA']);
  assert.deepEqual(res.years, [2018, 2019]);
  assert.ok(res.cells.every((x) => x.dest !== 'CCC'));
  assert.deepEqual(res.cells.filter((x) => x.dest === 'AAA').map((x) => x.year), [2018, 2019]); // history is still shown
});

test('top n applies to the ranked year', () => {
  assert.deepEqual(buildMatrix(shifted, { n: 1, rankYear: 2019 }).dests, ['BBB']);
});

test('a ranking year with no flights gives an empty chart', () => {
  assert.deepEqual(buildMatrix(shifted, { n: 10, rankYear: 2030 }).dests, []);
});

const markets = [
  c('XXX', 2018, 500, 'M1', 'One, US'), c('XXX', 2019, 5, 'M1', 'One, US'), c('YYY', 2019, 300, 'M1', 'One, US'),
  c('ZZZ', 2018, 900, 'M2', 'Two, US'),
  c('WWW', 2019, 100, 'M3', 'Three, US'),
];

test('city view ranks markets by the chosen year and drops those not served then', () => {
  assert.deepEqual(buildCityMatrix(markets, { n: 10 }).rows.map((x) => x.key), ['M2', 'M1', 'M3']);
  const res = buildCityMatrix(markets, { n: 10, rankYear: 2019 });
  assert.deepEqual(res.rows.map((x) => x.key), ['M1', 'M3']);
  assert.deepEqual(res.years, [2018, 2019]);
});

test('airports inside a group follow the chosen year too', () => {
  const codes = (opts) => buildCityMatrix(markets, { n: 10, open: ['M1'], ...opts }).rows.filter((x) => x.kind === 'airport').map((x) => x.code);
  assert.deepEqual(codes({}), ['XXX', 'YYY']);
  assert.deepEqual(codes({ rankYear: 2019 }), ['YYY', 'XXX']);
});

// ---- share of each year ----
const yearly = [
  r('AAA', 2018, 600), r('BBB', 2018, 300), r('CCC', 2018, 100),
  r('AAA', 2019, 100, { service: 'domestic' }), r('BBB', 2019, 100), r('CCC', 2019, 800),
];

test('every cell carries its share of the year\'s total, over all destinations and not just the ones kept', () => {
  const res = buildMatrix(yearly, { n: 1 });
  assert.deepEqual(res.dests, ['CCC']);
  assert.deepEqual(res.yearTotals, { 2018: 1000, 2019: 1000 });
  assert.deepEqual(res.cells.map((c) => [c.year, c.share]), [[2018, 0.1], [2019, 0.8]]);
});

test('shares follow the service filter, and each year sums to one over every destination', () => {
  const res = buildMatrix(yearly, { n: 10, service: 'international' });
  assert.deepEqual(res.yearTotals, { 2018: 1000, 2019: 900 });
  for (const y of [2018, 2019]) {
    const sum = res.cells.filter((c) => c.year === y).reduce((s, c) => s + c.share, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9, `${y}: ${sum}`);
  }
});

test('shares use the chosen measure and its units', () => {
  const res = buildMatrix(yearly, { n: 10, measure: 'freight' });
  assert.deepEqual(res.yearTotals, { 2018: 6, 2019: 6 });
  assert.ok(res.cells.every((c) => Math.abs(c.share - 1 / 3) < 1e-9));
});

test('city view cells carry shares too, for groups and for the airports opened beneath them', () => {
  const res = buildCityMatrix(markets, { n: 10, open: ['M1'] });
  assert.deepEqual(res.yearTotals, { 2018: 1400, 2019: 405 });
  const share = (row, year) => res.cells.find((c) => c.row === row && c.year === year).share;
  assert.ok(Math.abs(share('M1', 2019) - 305 / 405) < 1e-9);
  assert.ok(Math.abs(share('M1/YYY', 2019) - 300 / 405) < 1e-9);
  assert.ok(Math.abs(share('M2', 2018) - 900 / 1400) < 1e-9);
});

test('an empty selection has no totals', () => {
  assert.deepEqual(buildMatrix([], {}).yearTotals, {});
});

// ---- compared with the year's busiest destination ----
test('every cell carries its value relative to the busiest destination that year, whether or not that one is kept', () => {
  const res = buildMatrix(yearly, { n: 1 });
  assert.deepEqual(res.dests, ['CCC']);
  assert.deepEqual(res.yearMax, { 2018: 600, 2019: 800 });
  assert.deepEqual(res.cells.map((c) => [c.year, c.peak]), [[2018, 100 / 600], [2019, 1]]);
});

test('the busiest destination of each year is exactly 1, and the service filter decides who that is', () => {
  const all = buildMatrix(yearly, { n: 10 });
  for (const y of [2018, 2019]) assert.equal(Math.max(...all.cells.filter((c) => c.year === y).map((c) => c.peak)), 1);
  const dom = buildMatrix(yearly, { n: 10, service: 'domestic' });
  assert.deepEqual(dom.yearMax, { 2019: 100 });
  assert.deepEqual(dom.cells.map((c) => c.peak), [1]);
});

test('city view compares markets with the busiest market, and opened airports with it too', () => {
  const res = buildCityMatrix(markets, { n: 10, open: ['M1'] });
  assert.deepEqual(res.yearMax, { 2018: 900, 2019: 305 });
  const peak = (row, year) => res.cells.find((c) => c.row === row && c.year === year).peak;
  assert.equal(peak('M2', 2018), 1);
  assert.equal(peak('M1', 2019), 1);
  assert.ok(Math.abs(peak('M1', 2018) - 500 / 900) < 1e-9);
  assert.ok(Math.abs(peak('M1/YYY', 2019) - 300 / 305) < 1e-9);
});

test('an empty selection has no maxima', () => {
  assert.deepEqual(buildMatrix([], {}).yearMax, {});
});

test('the label column is as wide as its longest label, within limits', () => {
  assert.equal(labelMargin(['ATL', 'LAX']), 48);                          // codes need little room
  assert.equal(labelMargin(['▸ Los Angeles, CA', '▸ Chicago, IL']), 17 * 7 + 16);
  assert.equal(labelMargin(['x'.repeat(100)]), 280);                       // never wider than before
});

test('a city row is named by the city name its airports carry most between them', () => {
  const rows = [c('BWI', 2019, 1300, '30852', 'Baltimore, MD'), c('DCA', 2019, 1200, '30852', 'Washington, DC'), c('IAD', 2019, 1100, '30852', 'Washington, DC')];
  assert.equal(buildCityMatrix(rows, group).rows[0].label, 'Washington, DC');
});

test('the pointer reaches every point of a cell but not the labels beside the first one', async () => {
  const { pointerReach } = await import('../src/matrix.js');
  for (const [width, years] of [[1200, 36], [900, 36], [390, 36], [900, 5]]) {
    const cell = (width - 120) / years;                    // the band each year gets beside a 120px label column
    const reach = pointerReach({ width, marginLeft: 120, years, rowPx: 20 });
    assert.ok(reach >= Math.hypot(cell / 2, 10), `${width}/${years}: a cell's corner is in reach`);
    assert.ok(reach < cell / 2 + 8, `${width}/${years}: a label, 8px left of the first cell, is not`);
  }
});

test('a group named by its rows keeps that name, not the busiest airport\'s city', () => {
  const rows = [
    { dest: '614', market_id: 'boeing-737', group_label: 'Boeing 737', city: 'Boeing 737-800', year: 2019, service: 'domestic', passengers: 80 },
    { dest: '619', market_id: 'boeing-737', group_label: 'Boeing 737', city: 'Boeing 737-300', year: 2019, service: 'domestic', passengers: 10 },
  ];
  const res = buildCityMatrix(rows, { open: ['boeing-737'] });
  assert.equal(res.rows[0].label, 'Boeing 737');
  assert.deepEqual(res.rows.slice(1).map((r) => [r.code, r.name]), [['614', 'Boeing 737-800'], ['619', 'Boeing 737-300']]);
});

import { disclosureArrows } from '../src/matrix.js';

test('a grouped matrix has an arrow only for its groups, ▾ when open, each a toggle link', () => {
  const Plot = { text: (data, options) => ({ data, options }) };
  const labels = [{ kind: 'group', key: 'a', open: false }, { kind: 'airport', key: 'a/X' }, { kind: 'group', key: 'b', open: true }];
  const { data, options } = disclosureArrows(Plot, labels, () => '');
  assert.deepEqual(data.map((d) => d.key), ['a', 'b']);
  assert.deepEqual(data.map((d) => options.text(d)), ['▸', '▾']);
  assert.deepEqual(data.map((d) => options.href(d)), ['#toggle:a', '#toggle:b']);
});

import { placeKey } from '../src/matrix.js';

test('the colour key is drawn into its own box, and emptied when there is nothing to chart', () => {
  const box = { children: ['old key'], replaceChildren(...c) { this.children = c; } };
  const chart = { legend: (scale) => `${scale} legend` };
  placeKey(box, chart);
  assert.deepEqual(box.children, ['color legend']);
  placeKey(box, null);
  assert.deepEqual(box.children, []);
  placeKey(null, chart);                                                    // a page without a key box draws none
});

// ---- which destinations: ever flown, first flown after the data's first year, or dropped by its last ----
const lives = [
  r('OLD', 1990, 900), r('OLD', 2025, 800), // flown throughout
  r('NEW', 2010, 500), r('NEW', 2025, 600), // first flown after 1990
  r('GON', 1990, 700), r('GON', 2000, 700), // dropped
  r('SJC', 2016, 400), r('SJC', 2023, 300), // first flown after 1990 and dropped by 2025
];
const span = { firstYear: 1990, lastYear: 2025 };

test('every destination ever flown is the default', () => {
  assert.deepEqual(buildMatrix(lives, { n: 10 }).dests, ['OLD', 'GON', 'NEW', 'SJC']);
  assert.deepEqual(buildMatrix(lives, { n: 10, flown: 'ever', ...span }).dests, ['OLD', 'GON', 'NEW', 'SJC']);
});

test('first flown after the first year leaves out what flew then; dropped leaves out what still flies; one can be both', () => {
  assert.deepEqual(buildMatrix(lives, { n: 10, flown: 'after', ...span }).dests, ['NEW', 'SJC']);
  assert.deepEqual(buildMatrix(lives, { n: 10, flown: 'dropped', ...span }).dests, ['GON', 'SJC']);
});

test('the top n is taken after the filter, and each destination keeps its whole history', () => {
  const res = buildMatrix(lives, { n: 1, flown: 'dropped', ...span });
  assert.deepEqual(res.dests, ['GON']);
  assert.deepEqual(res.cells.map((x) => x.year), [1990, 2000]);
});

test('the filter reads the service chosen: a destination still flown only as domestic is dropped as international', () => {
  const mixed = [r('MIX', 2000, 500), r('MIX', 2025, 500, { service: 'domestic' })];
  assert.deepEqual(buildMatrix(mixed, { n: 10, flown: 'dropped', ...span }).dests, []);
  assert.deepEqual(buildMatrix(mixed, { n: 10, service: 'international', flown: 'dropped', ...span }).dests, ['MIX']);
});

test('city view: a market is dropped only when none of its airports still flies, and its airports open as they are', () => {
  const ms = [
    c('XXX', 2000, 500, 'M1', 'One, US'), c('YYY', 2025, 300, 'M1', 'One, US'), // one airport closed, the other flies
    c('ZZZ', 2000, 900, 'M2', 'Two, US'), c('WWW', 2010, 100, 'M2', 'Two, US'), // both stopped
  ];
  const res = buildCityMatrix(ms, { n: 10, flown: 'dropped', open: ['M2'], ...span });
  assert.deepEqual(res.rows.map((x) => x.key), ['M2', 'M2/ZZZ', 'M2/WWW']);
  assert.deepEqual(buildCityMatrix(ms, { n: 10, flown: 'after', ...span }).rows.map((x) => x.key), ['M2', 'M1']);
});

test('a year with no rows at all still gets its column, so the years run without gaps', async () => {
  const gappy = [r('LHR', 2016, 300), r('LHR', 2019, 400)];
  assert.deepEqual(buildMatrix(gappy, { measure: 'passengers', n: 10 }).years, [2016, 2017, 2018, 2019]);
  const { buildCityMatrix } = await import('../src/matrix.js');
  assert.deepEqual(buildCityMatrix(gappy.map((x) => ({ ...x, market_id: '1', city: 'London' })), { measure: 'passengers', n: 10 }).years, [2016, 2017, 2018, 2019]);
});

test('the flight count is named for the direction counted', () => {
  assert.deepEqual(['', 'out', 'in'].map((d) => matrixMeasures(d).deps), ['Flights', 'Departures', 'Arrivals']);
  assert.equal(matrixMeasures('in').passengers, 'Passengers');
});

import { rankYearFrom } from '../src/matrix.js';

test('the ranking year comes from year=, any year the airport flew, else all years', () => {
  const years = [2015, 2016, 2025];
  assert.equal(rankYearFrom('?year=2015', { years, latest: 2025 }), 2015);
  assert.equal(rankYearFrom('', { years, latest: 2025 }), null);
  assert.equal(rankYearFrom('?year=1999', { years, latest: 2025 }), null);  // not flown then
  assert.equal(rankYearFrom('?year=junk', { years, latest: 2025 }), null);
});

test('the old rank=latest still means the latest full year, and year= wins over it', () => {
  assert.equal(rankYearFrom('?rank=latest', { years: [2015, 2016], latest: 2016 }), 2016);
  assert.equal(rankYearFrom('?rank=latest', { years: [], latest: null }), null);
  assert.equal(rankYearFrom('?rank=latest&year=2015', { years: [2015, 2016], latest: 2016 }), 2015);
});

import { fullYears } from '../src/matrix.js';

test('the years to rank by are those with rows, up to the latest full year, newest first', () => {
  const rows = [2026, 2019, 2025, 2019, 2021].map((year) => ({ year: String(year) }));
  assert.deepEqual(fullYears(rows, 2025), [2025, 2021, 2019]);
  assert.deepEqual(fullYears([], 2025), []);
});

import { yearTick } from '../src/matrix.js';

test('a year label shows every nth year, leaving the ranked year to its own bold label along with any year beside it', () => {
  const shown = (every, ranked) => ['2004', '2005', '2006', '2009', '2010', '2011'].filter((d) => yearTick(d, every, ranked));
  assert.deepEqual(shown(5, null), ['2005', '2010']);
  assert.deepEqual(shown(5, '2006'), ['2010']);           // 2005 would overlap the bold 2006
  assert.deepEqual(shown(5, '2009'), ['2005']);
  assert.deepEqual(shown(5, '2010'), ['2005']);
  assert.deepEqual(shown(1, '2006'), ['2004', '2005', '2009', '2010', '2011']);  // labelled every year, the cells are wide enough
});
