import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyRoutes, summariseRoutes, formatYearMonth, mapRoutes, centreOf, STATUS_COLOURS, airlineOptions, findAirline } from '../src/airline.js';

const r = (origin, dest, deps_a, deps_b) => ({ origin, dest, deps_a, deps_b });

test('classifyRoutes sorts pairs into kept, dropped and added, ignoring token flying', () => {
  const out = classifyRoutes([r('SFO', 'DEN', 300, 0), r('SFO', 'LAX', 900, 800), r('SFO', 'PDX', 0, 200), r('SFO', 'ABC', 5, 3)], { min: 12 });
  assert.deepEqual(out.map((x) => x.status), ['dropped', 'kept', 'added']);
  assert.deepEqual(summariseRoutes(out), { kept: 1, dropped: 1, added: 1 });
});

test('a pair under the threshold in one year counts as not served that year', () => {
  assert.equal(classifyRoutes([r('A', 'B', 100, 11)], { min: 12 })[0].status, 'dropped');
});

test('formatYearMonth writes a month and year', () => {
  assert.equal(formatYearMonth(201902), 'Feb 2019');
  assert.equal(formatYearMonth(0), '');
});

const airports = new Map([
  ['SFO', { lon: -122.4, lat: 37.6, isUs: true }], ['DEN', { lon: -104.7, lat: 39.9, isUs: true }],
  ['LAX', { lon: -118.4, lat: 33.9, isUs: true }], ['MEX', { lon: -99.1, lat: 19.4, isUs: false }],
]);
const pair = (origin, dest, deps) => ({ origin, dest, deps, seats: deps * 100, passengers: deps * 80, freight: 0 });

test('mapRoutes without a comparison year colours by domestic or international and has no status', () => {
  const { routes } = mapRoutes([pair('SFO', 'LAX', 10), pair('LAX', 'MEX', 5)], null, airports);
  assert.deepEqual(routes.map((r) => [r.service, r.status, r.colour]), [['domestic', null, undefined], ['international', null, undefined]]);
});

test('mapRoutes with a comparison year marks pairs kept, dropped and added, drawing dropped ones with the old numbers', () => {
  const { routes } = mapRoutes([pair('SFO', 'LAX', 20), pair('SFO', 'MEX', 7)], [pair('SFO', 'LAX', 10), pair('SFO', 'DEN', 30)], airports);
  const by = Object.fromEntries(routes.map((r) => [r.dest, r]));
  assert.equal(by.LAX.status, 'kept'); assert.equal(by.LAX.deps, 20); assert.equal(by.LAX.depsThen, 10);
  assert.equal(by.DEN.status, 'dropped'); assert.equal(by.DEN.deps, 30); assert.equal(by.DEN.colour, STATUS_COLOURS.dropped);
  assert.equal(by.MEX.status, 'added');
});

test('mapRoutes leaves out pairs with an unknown airport and says which', () => {
  const { routes, skipped } = mapRoutes([pair('SFO', 'ZZZ', 10)], null, airports);
  assert.equal(routes.length, 0);
  assert.deepEqual(skipped, ['ZZZ']);
});

test('centreOf points at the middle of the routes, and at the US when there are none', () => {
  const [lon] = centreOf(mapRoutes([pair('SFO', 'DEN', 1)], null, airports).routes);
  assert.ok(lon < -104 && lon > -123);
  assert.deepEqual(centreOf([]), [-96, 38]);
});

test('airlineOptions offers each group once under its short name, with years and full name as the hint', () => {
  const opts = airlineOptions([
    { group_id: '21618', group_name: 'Southern Airways Express, dba Mokulele Airlines', first_year: 2012, last_year: 2025, deps: 5 },
    { group_id: '21242', group_name: 'Mokulele Flight Services, Inc.', first_year: 2006, last_year: 2020, deps: 3 },
    { group_id: '21242', group_name: 'Mokulele Flight Services, Inc.', first_year: 2006, last_year: 2019, deps: 1 },
  ]);
  assert.deepEqual(opts.map((o) => o.value), ['Mokulele Airlines', 'Mokulele Flight Services']);
  assert.equal(opts[0].hint, '2012–2025 · Southern Airways Express, dba Mokulele Airlines');
});

test('findAirline matches the picked name, ignoring case, and refuses a partial or ambiguous one', () => {
  const opts = [{ id: 'a', value: 'Cape Air' }, { id: 'b', value: 'Cape' }, { id: 'c', value: 'Twin' }, { id: 'd', value: 'twin' }];
  assert.equal(findAirline(opts, 'cape air').id, 'a');
  assert.equal(findAirline(opts, 'Cap'), null);
  assert.equal(findAirline(opts, 'Twin'), null);
});
