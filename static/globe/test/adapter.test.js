import test from 'node:test';
import assert from 'node:assert/strict';
import { indexAirports, placeRoutes, placePoints, yearsIn, forYear, forMonth, forService } from '../src/adapter.js';

const airports = indexAirports([
  { code: 'ATL', name: 'Atlanta', city: 'Atlanta', country: 'United States', place: 'Atlanta, GA', latitude: 33.6, longitude: -84.4, is_us: 1 },
  { code: 'LHR', name: 'Heathrow', city: 'London', country: 'United Kingdom', place: 'London, United Kingdom', latitude: 51.5, longitude: -0.46, is_us: 0 },
]);

test('indexAirports keys by code with lon/lat', () => {
  assert.deepEqual(airports.get('ATL'), { code: 'ATL', name: 'Atlanta', city: 'Atlanta', country: 'United States', place: 'Atlanta, GA', lat: 33.6, lon: -84.4, isUs: true });
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
  assert.equal(routes[0].destCity, 'London, United Kingdom');
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

test('placePoints turns listed airports into dots, skipping those with no coordinates', () => {
  const rows = [
    { origin: 'ATL', origin_city_name: 'Atlanta, GA', total_passengers: 51 },
    { origin: 'SEL', origin_city_name: 'Seoul, Korea', total_passengers: 7 },
  ];
  const pts = placePoints(rows, airports);
  assert.equal(pts.length, airports.has('SEL') ? 2 : 1);
  assert.deepEqual(pts[0], { code: 'ATL', city: 'Atlanta, GA', pos: [airports.get('ATL').lon, airports.get('ATL').lat], passengers: 51 });
});

test('place falls back to city and country when the query gives none', () => {
  const m = indexAirports([{ code: 'ZZZ', name: 'Z', city: 'Zed', country: 'Zedland', latitude: 1, longitude: 2, is_us: 0 }]);
  assert.equal(m.get('ZZZ').place, 'Zed, Zedland');
});

test('routes name their destination by place', () => {
  const { routes } = placeRoutes([{ dest: 'LHR', year: 2019 }], 'ATL', airports);
  assert.equal(routes[0].destCity, 'London, United Kingdom');
});
