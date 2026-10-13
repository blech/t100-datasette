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
