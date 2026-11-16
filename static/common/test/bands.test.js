import test from 'node:test';
import assert from 'node:assert/strict';
import { stackTotals, bandKey, ALL_AIRLINES } from '../bands.js';
import { OTHER_AIRLINES } from '../../home/src/airlines.js';

test('stackTotals is the top of each year\'s stack', () => {
  const bands = [
    { year: 2000, series: 'A', y2: 3 }, { year: 2000, series: OTHER_AIRLINES, y2: 10 },
    { year: 2001, series: 'A', y2: 4 }, { year: 2001, series: OTHER_AIRLINES, y2: 12 },
  ];
  assert.deepEqual([...stackTotals(bands)], [[2000, 10], [2001, 12]]);
});

test('bandKey draws the others as a band, the whole market as a line and an airline as its colour', () => {
  assert.deepEqual(bandKey(OTHER_AIRLINES, () => 'x'), { kind: 'other' });
  assert.deepEqual(bandKey(ALL_AIRLINES, () => 'x'), { kind: 'line' });
  assert.deepEqual(bandKey('Delta', () => 'x'), { kind: 'square', colour: 'x' });
});
