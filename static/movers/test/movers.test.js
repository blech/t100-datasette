import test from 'node:test';
import assert from 'node:assert/strict';
import { clampRatio, clampIndex, extremes, indexSeries, medianIndex, lineLabel, spreadLabels, FLOOR, INDEX_FLOOR } from '../src/movers.js';

test('a line is named by its code and the name of its city', () => {
  assert.equal(lineLabel('TTN', 'Trenton, NJ'), 'TTN Trenton');
  assert.equal(lineLabel('SRQ', 'Sarasota/Bradenton, FL'), 'SRQ Sarasota/Braden…');
  assert.equal(lineLabel('XYZ', null), 'XYZ');
  assert.equal(lineLabel('XYZ', ''), 'XYZ');
});

test('labels far enough apart stay where they are', () => {
  assert.deepEqual(spreadLabels([100, 200], 14, 0, 500), [100, 200]);
});

test('labels too close are moved apart about the middle of where they wanted to be', () => {
  assert.deepEqual(spreadLabels([100, 104], 14, 0, 500), [95, 109]);
  assert.deepEqual(spreadLabels([100, 110, 120], 14, 0, 500), [96, 110, 124]);
});

test('the positions come back in the order given', () => {
  assert.deepEqual(spreadLabels([104, 100], 14, 0, 500), [109, 95]);
});

test('labels stay inside the chart, pushing their neighbours', () => {
  assert.deepEqual(spreadLabels([5, 6], 14, 0, 500), [0, 14]);
  assert.deepEqual(spreadLabels([495, 496], 14, 0, 500), [486, 500]);
  assert.deepEqual(spreadLabels([490, 497, 498], 14, 0, 500), [472, 486, 500]);
});

test('no labels is no positions', () => {
  assert.deepEqual(spreadLabels([], 14, 0, 500), []);
});

test('an index that has all but gone is drawn at the floor of the lines chart', () => {
  assert.equal(clampIndex(0.1), INDEX_FLOOR);
  assert.equal(clampIndex(40), 40);
});

test('a ratio of nothing is put at the floor of a log axis', () => {
  assert.equal(clampRatio(0), FLOOR);
  assert.equal(clampRatio(0.5), 0.5);
});

const row = (airport, vs_median) => ({ airport, vs_median });

test('the extremes are the furthest above and below the median, furthest first', () => {
  const rows = [row('A', 3), row('B', 1.2), row('C', 1), row('D', 0.9), row('E', 0.2), row('F', 2)];
  const { risers, fallers } = extremes(rows, 2);
  assert.deepEqual(risers.map((r) => r.airport), ['A', 'F']);
  assert.deepEqual(fallers.map((r) => r.airport), ['E', 'D']);
});

test('the median airport is neither, and rows with no comparison are left out', () => {
  const { risers, fallers } = extremes([row('A', 1), row('B', null), row('C', undefined)], 5);
  assert.deepEqual([risers, fallers], [[], []]);
});

const s = (airport, year, value) => ({ airport, year, value });

test('a series is indexed to the first year, and only for the airports asked for', () => {
  const series = [s('A', 1990, 200), s('A', 2000, 400), s('B', 1990, 100), s('B', 2000, 50)];
  assert.deepEqual(indexSeries(series, 1990, new Set(['A'])), [{ airport: 'A', year: 1990, index: 100 }, { airport: 'A', year: 2000, index: 200 }]);
  assert.equal(indexSeries(series, 1990).length, 4);
});

test('an airport with nothing in the first year has no line', () => {
  assert.deepEqual(indexSeries([s('N', 2000, 50)], 1990), []);
});

test('the median line is the median airport index of each year, the mean of the middle two for an even number', () => {
  const series = [s('A', 1990, 100), s('A', 2000, 400), s('B', 1990, 100), s('B', 2000, 100), s('C', 1990, 100), s('C', 2000, 200)];
  assert.deepEqual(medianIndex(series, 1990), [{ year: 1990, index: 100 }, { year: 2000, index: 200 }]);
  assert.deepEqual(medianIndex([...series, s('D', 1990, 100), s('D', 2000, 300)], 1990).at(-1), { year: 2000, index: 250 });
});

test('a year in which an airport has no row leaves it out of that year', () => {
  const series = [s('A', 1990, 100), s('A', 2000, 100), s('B', 1990, 100)];
  assert.deepEqual(medianIndex(series, 1990), [{ year: 1990, index: 100 }, { year: 2000, index: 100 }]);
});
