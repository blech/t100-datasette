import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHeatmap, HEAT_MEASURES } from '../src/heatmap.js';

const r = (dest, year, passengers, extra = {}) => ({ dest, year, passengers, deps: passengers / 10, seats: passengers * 2, freight: 4000, service: 'international', ...extra });

const rows = [
  r('LHR', 2018, 300), r('LHR', 2019, 400),
  r('CDG', 2018, 100), r('CDG', 2019, 150),
  r('LAX', 2019, 1000, { service: 'domestic' }),
  r('ZZZ', 2019, 5),
];

test('destinations are ranked by the measure summed over all years, biggest first', () => {
  const res = buildHeatmap(rows, { measure: 'passengers', service: 'all', n: 10 });
  assert.deepEqual(res.dests, ['LAX', 'LHR', 'CDG', 'ZZZ']);
});

test('only the top n destinations are kept', () => {
  const res = buildHeatmap(rows, { measure: 'passengers', service: 'all', n: 2 });
  assert.deepEqual(res.dests, ['LAX', 'LHR']);
  assert.ok(res.cells.every((c) => ['LAX', 'LHR'].includes(c.dest)));
});

test('years span every year in the data, even those a kept destination skipped', () => {
  const res = buildHeatmap(rows, { measure: 'passengers', service: 'all', n: 1 });
  assert.deepEqual(res.years, [2018, 2019]);
  assert.equal(res.cells.length, 1); // LAX only flew in 2019
});

test('service filter keeps only that service, and decides the ranking', () => {
  const dom = buildHeatmap(rows, { measure: 'passengers', service: 'domestic', n: 10 });
  assert.deepEqual(dom.dests, ['LAX']);
  const intl = buildHeatmap(rows, { measure: 'passengers', service: 'international', n: 10 });
  assert.deepEqual(intl.dests, ['LHR', 'CDG', 'ZZZ']);
});

test('freight is shown in short tons', () => {
  const res = buildHeatmap([r('LHR', 2019, 1)], { measure: 'freight', service: 'all', n: 5 });
  assert.equal(res.cells[0].value, 2);
});

test('a destination in both tables for a year appears once per year', () => {
  const res = buildHeatmap([r('LHR', 2019, 10), r('LHR', 2019, 5, { service: 'domestic' })], { measure: 'passengers', service: 'all', n: 5 });
  assert.equal(res.cells.length, 1);
  assert.equal(res.cells[0].value, 15);
});

test('cells with a zero value are dropped, and ties rank by code', () => {
  const res = buildHeatmap([r('BBB', 2019, 7), r('AAA', 2019, 7), r('CCC', 2019, 0)], { measure: 'passengers', service: 'all', n: 5 });
  assert.deepEqual(res.dests, ['AAA', 'BBB']);
});

test('empty input is empty output', () => {
  assert.deepEqual(buildHeatmap([], { measure: 'deps', service: 'all', n: 5 }), { dests: [], years: [], cells: [] });
});

test('menu of measures', () => {
  assert.deepEqual(Object.keys(HEAT_MEASURES), ['passengers', 'deps', 'seats', 'freight']);
});

// ---- grouping by BTS market ----
import { buildCityHeatmap } from '../src/heatmap.js';

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
  const res = buildCityHeatmap(london, group);
  assert.deepEqual(res.rows.map((r) => r.label.split(' · ')[0]), ['Paris, France', 'London, United Kingdom', 'Dublin, Ireland']);
  const lon = res.cells.filter((x) => x.row === res.rows[1].key);
  assert.deepEqual(lon.map((x) => [x.year, x.value]), [[2018, 800], [2019, 1250]]);
});

test('a group row is labelled with its busiest airports in volume order, and says how many more', () => {
  const res = buildCityHeatmap(london, group);
  assert.equal(res.rows[1].label, 'London, United Kingdom · LHR, LGW, STN');
  const many = ['A', 'B', 'C', 'D', 'E'].map((d, i) => c(d, 2019, 100 - i, '1', 'Big City'));
  assert.equal(buildCityHeatmap(many, group).rows[0].label, 'Big City · A, B, C +2');
});

test('the city name comes from the busiest airport, not from the first or alphabetical row', () => {
  const rows = [c('EWR', 2019, 100, '31703', 'Newark, NJ'), c('JFK', 2019, 900, '31703', 'New York, NY'), c('HPN', 2019, 5, '31703', 'White Plains, NY')];
  assert.match(buildCityHeatmap(rows, group).rows[0].label, /^New York, NY · JFK, EWR/);
});

test('multi-airport groups can be expanded, single-airport ones cannot', () => {
  const res = buildCityHeatmap(london, group);
  assert.deepEqual(res.rows.map((r) => r.expandable), [true, true, false]);
  assert.ok(res.rows.every((r) => r.kind === 'group' && r.open === false));
});

test('an open group is followed by its airports, biggest first, with their own cells', () => {
  const res = buildCityHeatmap(london, { ...group, open: ['30730'] });
  assert.deepEqual(res.rows.map((r) => r.kind + ':' + (r.code || r.key)), ['group:30920', 'group:30730', 'airport:LHR', 'airport:LGW', 'airport:STN', 'group:31000']);
  assert.equal(res.rows[1].open, true);
  const lgw = res.rows.find((r) => r.code === 'LGW');
  assert.deepEqual(res.cells.filter((x) => x.row === lgw.key).map((x) => [x.year, x.value]), [[2019, 300]]);
});

test('top n counts groups, not the airports shown under an open group', () => {
  const res = buildCityHeatmap(london, { ...group, n: 1, open: ['30920'] });
  assert.deepEqual(res.rows.map((r) => r.kind + ':' + (r.code || r.key)), ['group:30920', 'airport:CDG', 'airport:ORY']);
});

test('airports without a market id stand alone, and a reused code in two markets stays apart', () => {
  const rows = [
    c('DOH', 2019, 500, null, 'Doha, Qatar'),
    c('SAW', 2019, 200, '32395', 'Istanbul, Turkey'),
    c('SAW', 2005, 1, '33459', 'Marquette, MI'),
  ];
  const res = buildCityHeatmap(rows, group);
  assert.equal(res.rows.length, 3);
  assert.ok(res.rows.every((r) => !r.expandable));
});

test('cells keep a per-airport breakdown for the tooltip, biggest first', () => {
  const res = buildCityHeatmap(london, group);
  const cell = res.cells.find((x) => x.row === res.rows[1].key && x.year === 2019);
  assert.deepEqual(cell.parts, [{ dest: 'LHR', value: 900 }, { dest: 'LGW', value: 300 }, { dest: 'STN', value: 50 }]);
});

test('service filter and freight conversion apply in city mode too', () => {
  const rows = [c('LHR', 2019, 1, '1', 'London', { service: 'domestic', freight: 4000 }), c('LGW', 2019, 1, '1', 'London', { freight: 8000 })];
  const res = buildCityHeatmap(rows, { measure: 'freight', service: 'international', n: 5, open: [] });
  assert.equal(res.cells[0].value, 4);
});

test('empty input', () => {
  assert.deepEqual(buildCityHeatmap([], group), { rows: [], years: [], cells: [] });
});
