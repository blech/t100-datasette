import test from 'node:test';
import assert from 'node:assert/strict';
import { routeFigures } from '../src/panel.js';

test('a route panel lists each figure rounded, with the exact figure for hovering', () => {
  const rows = routeFigures({ deps: 1234, seats: 2_345_678, passengers: 51_512_883, freight: 4000 });
  assert.deepEqual(rows.map((f) => f.label), ['Departures', 'Seats', 'Passengers', 'Freight']);
  assert.deepEqual(rows[2], { label: 'Passengers', shown: '51.5\u00a0million', title: '51,512,883 passengers' });
  assert.deepEqual(rows[3], { label: 'Freight', shown: '2 tons', title: '4,000 lb' });
});

test('a missing figure is a dash, with no unit hanging off it', () => {
  const [deps] = routeFigures({ deps: null, seats: 0, passengers: 0, freight: 0 });
  assert.deepEqual(deps, { label: 'Departures', shown: '–', title: '–' });
});
