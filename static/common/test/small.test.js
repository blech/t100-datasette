import test from 'node:test';
import assert from 'node:assert/strict';
import { splitSmall, othersLabel } from '../small.js';

const a = (airport, deps, passengers, freight) => ({ airport, deps, passengers, freight });

test('an airport under 2% of its city on flights, passengers and freight alike is small', () => {
  const nyc = [a('JFK', 440000, 62e6, 3.1e9), a('EWR', 375000, 47e6, 1.4e9), a('LGA', 344000, 33e6, 1e7), a('ISP', 14000, 1.6e6, 4e5), a('NYS', 2100, 5000, 0)];
  const { shown, small } = splitSmall(nyc);
  assert.deepEqual(shown.map((x) => x.airport), ['JFK', 'EWR', 'LGA']);
  assert.deepEqual(small.map((x) => x.airport), ['ISP', 'NYS']);
});

test('clearing 2% on any one measure is enough: a freight airport with no passengers stays', () => {
  const london = [a('LHR', 81000, 17e6, 1.3e9), a('LGW', 4400, 1.1e6, 3e7), a('STN', 1100, 1800, 1.2e8), a('LTN', 465, 1600, 0)];
  assert.deepEqual(splitSmall(london).small.map((x) => x.airport), ['LTN']);
});

test('a city of one airport has no small ones, and a city with no traffic at all hides nothing it can judge', () => {
  assert.deepEqual(splitSmall([a('XYZ', 1, 1, 0)]).small, []);
  assert.deepEqual(splitSmall([a('A', 0, 0, 0), a('B', 0, 0, 0)]).small, []);   // nothing to be a share of
});

test('the other airports row is named for how many it sums', () => {
  assert.deepEqual([1, 2, 7].map(othersLabel), ['1 other airport', '2 other airports', '7 other airports']);
});
