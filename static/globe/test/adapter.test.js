import test from 'node:test';
import assert from 'node:assert/strict';
import { indexAirports, placeRoutes, yearsIn, forYear, forMonth, forService } from '../src/adapter.js';

const airports = indexAirports([
  { code: 'ATL', name: 'Atlanta', city: 'Atlanta', country: 'United States', latitude: 33.6, longitude: -84.4, is_us: 1 },
  { code: 'LHR', name: 'Heathrow', city: 'London', country: 'United Kingdom', latitude: 51.5, longitude: -0.46, is_us: 0 },
]);

test('indexAirports keys by code with lon/lat', () => {
  assert.deepEqual(airports.get('ATL'), { code: 'ATL', name: 'Atlanta', city: 'Atlanta', country: 'United States', lat: 33.6, lon: -84.4, isUs: true });
});

test('placeRoutes places known routes and lists skipped codes once, sorted', () => {
  const rows = [
    { dest: 'LHR', year: 2019, passengers: 5, service: 'international' },
    { dest: 'ZZZ', year: 2018, passengers: 1, service: 'domestic' },
    { dest: 'ZZZ', year: 2019, passengers: 1, service: 'domestic' },
    { dest: 'AAA', year: 2019, passengers: 1, service: 'domestic' },
  ];
  const { routes, skipped, originMissing } = placeRoutes(rows, 'ATL', airports);
  assert.equal(originMissing, false);
  assert.equal(routes.length, 1);
  assert.deepEqual(routes[0].from, [-84.4, 33.6]);
  assert.deepEqual(routes[0].to, [-0.46, 51.5]);
  assert.equal(routes[0].destCity, 'London');
  assert.deepEqual(skipped, ['AAA', 'ZZZ']);
});

test('placeRoutes reports a missing origin instead of throwing', () => {
  const r = placeRoutes([{ dest: 'LHR', year: 2019 }], 'QQQ', airports);
  assert.deepEqual(r, { routes: [], skipped: [], originMissing: true });
});

test('yearsIn, forYear, forMonth', () => {
  assert.deepEqual(yearsIn([{ year: 2019 }, { year: 2001 }, { year: 2019 }]), [2001, 2019]);
  assert.deepEqual(forYear([{ year: 1 }, { year: 2 }], 2), [{ year: 2 }]);
  assert.deepEqual(forMonth([{ month: 1 }, { month: 2 }], 1), [{ month: 1 }]);
});

import { skippedFor, originProblem } from '../src/adapter.js';

test('skippedFor lists only unplaced destinations in the rows given, once, sorted', () => {
  const rows = [{ dest: 'ZZZ' }, { dest: 'LHR' }, { dest: 'AAA' }, { dest: 'ZZZ' }];
  assert.deepEqual(skippedFor(rows, airports), ['AAA', 'ZZZ']);
  assert.deepEqual(skippedFor([{ dest: 'LHR' }], airports), []);
  assert.deepEqual(skippedFor([], airports), []);
});

test('originProblem: no rows beats no coordinates', () => {
  assert.equal(originProblem([], airports, 'QQQ'), 'no-data');
  assert.equal(originProblem([], airports, 'ATL'), 'no-data');
  assert.equal(originProblem([{ dest: 'LHR' }], airports, 'QQQ'), 'no-coordinates');
  assert.equal(originProblem([{ dest: 'LHR' }], airports, 'ATL'), null);
});

test('forService keeps only the chosen service, or everything for all', () => {
  const rows = [{ dest: 'A', service: 'domestic' }, { dest: 'B', service: 'international' }];
  assert.deepEqual(forService(rows, 'domestic').map((r) => r.dest), ['A']);
  assert.deepEqual(forService(rows, 'international').map((r) => r.dest), ['B']);
  assert.equal(forService(rows, 'all'), rows);
});
