import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyRoutes, summariseRoutes, formatYearMonth, mapRoutes, centreOf, airlineOptions, findAirline, mergeMembers } from '../src/airline.js';

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

test('mapRoutes without a comparison year gives each pair a service and no status', () => {
  const { routes } = mapRoutes([pair('SFO', 'LAX', 10), pair('LAX', 'MEX', 5)], null, airports);
  assert.deepEqual(routes.map((r) => [r.service, r.status]), [['domestic', null], ['international', null]]);
  assert.ok(routes.every((r) => !('colour' in r)));
});

test('mapRoutes with a comparison year marks pairs kept, dropped and added, drawing dropped ones with the old numbers', () => {
  const { routes } = mapRoutes([pair('SFO', 'LAX', 20), pair('SFO', 'MEX', 7)], [pair('SFO', 'LAX', 10), pair('SFO', 'DEN', 30)], airports);
  const by = Object.fromEntries(routes.map((r) => [r.dest, r]));
  assert.equal(by.LAX.status, 'kept'); assert.equal(by.LAX.deps, 20); assert.equal(by.LAX.depsThen, 10); assert.equal(by.LAX.depsNow, 20);
  assert.equal(by.DEN.status, 'dropped'); assert.equal(by.DEN.deps, 30); assert.equal(by.DEN.depsNow, 0);
  assert.equal(by.MEX.status, 'added'); assert.equal(by.MEX.depsThen, 0);
});

test('mapRoutes calls a pair domestic when most of its departures were filed domestic, whatever the airports', () => {
  const dom = (origin, dest, deps, domestic_deps) => ({ ...pair(origin, dest, deps), domestic_deps });
  const { routes } = mapRoutes([dom('SFO', 'LAX', 10, 4), dom('LAX', 'MEX', 10, 6), dom('SFO', 'DEN', 10, 5)], null, airports);
  assert.deepEqual(routes.map((r) => r.service), ['international', 'domestic', 'international']);});

test('mapRoutes adds up the domestic count over members and draws a dropped pair by its old year', () => {
  const dom = (airline_id, deps, domestic_deps) => ({ ...mrow('SFO', 'LAX', airline_id, deps), domestic_deps });
  const { routes } = mapRoutes([dom('VX', 4, 4), dom('AS', 8, 0)], [{ ...pair('SFO', 'DEN', 10), domestic_deps: 10 }], airports);
  const by = Object.fromEntries(routes.map((r) => [r.dest, r]));
  assert.equal(by.LAX.service, 'international');  // 4 of 12
  assert.equal(by.DEN.service, 'domestic');
});

test('mapRoutes marks pairs flown only in the years between as added then dropped, adding up members within each year', () => {
  const between = [
    { ...mrow('SFO', 'MEX', 'VX', 10), year: 2017 }, { ...mrow('SFO', 'MEX', 'AS', 30), year: 2017 },
    { ...mrow('SFO', 'MEX', 'AS', 25), year: 2019 }, { ...mrow('SFO', 'DEN', 'AS', 5), year: 2018 },
  ];
  const { routes } = mapRoutes([pair('SFO', 'LAX', 20)], [pair('SFO', 'LAX', 15)], airports, { min: 12, between });
  assert.deepEqual(routes.map((r) => [r.dest, r.status]), [['MEX', 'between'], ['LAX', 'kept']]);
  const mex = routes[0];
  assert.deepEqual([mex.deps, mex.firstYear, mex.lastYear, mex.peakYear, mex.depsThen, mex.depsNow], [40, 2017, 2019, 2017, 0, 0]);
  assert.deepEqual(mex.airlines.sort(), ['AS', 'VX']);
  assert.equal(mex.service, 'international');
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

test('airlineOptions offers each airline once under its short name, with years, full name and any parent as the hint', () => {
  const opts = airlineOptions([
    { id: '21618', name: 'Spirit Airlines Inc.', parent: '', first_year: 2012, last_year: 2025, deps: 5 },
    { id: '19790', name: 'Delta Air Lines Inc.', parent: 'Delta (incl. Northwest)', first_year: 1990, last_year: 2025, deps: 3 },
    { id: '19790', name: 'Delta Air Lines Inc.', parent: 'Delta (incl. Northwest)', first_year: 1990, last_year: 2019, deps: 1 },
  ]);
  assert.deepEqual(opts.map((o) => o.value), ['Spirit Airlines', 'Delta Air Lines']);
  assert.equal(opts[0].hint, '2012–2025 · Spirit Airlines Inc.');
  assert.equal(opts[1].hint, '1990–2025 · Delta Air Lines Inc. · part of Delta');
});

test('findAirline matches the picked name, ignoring case, and refuses a partial or ambiguous one', () => {
  const opts = [{ id: 'a', value: 'Cape Air' }, { id: 'b', value: 'Cape' }, { id: 'c', value: 'Twin' }, { id: 'd', value: 'twin' }];
  assert.equal(findAirline(opts, 'cape air').id, 'a');
  assert.equal(findAirline(opts, 'Cap'), null);
  assert.equal(findAirline(opts, 'Twin'), null);
});

const member = (origin, dest, airline, deps_a, deps_b, extra = {}) => ({ origin, dest, airline_id: airline, airline, deps_a, deps_b, pax_a: 0, deps_all: deps_a + deps_b, first_ym: 201701, last_ym: 201812, ...extra });

test('merged members: a route one member stopped and another took over is kept', () => {
  const out = classifyRoutes([member('LAX', 'BOS', 'Virgin America', 300, 0), member('LAX', 'BOS', 'Alaska', 0, 400)], { min: 12 });
  assert.equal(out.length, 1);
  assert.equal(out[0].status, 'kept');
  assert.deepEqual(out[0].airlines, ['Virgin America', 'Alaska']);
});

test('mergeMembers adds up departures and widens the first and last month', () => {
  const [m] = mergeMembers([member('A', 'B', 'x', 10, 0, { first_ym: 200001, last_ym: 200512 }), member('A', 'B', 'y', 0, 5, { first_ym: 200301, last_ym: 201012 })]);
  assert.deepEqual([m.deps_a, m.deps_b, m.first_ym, m.last_ym], [10, 5, 200001, 201012]);
});

const mrow = (origin, dest, airline_id, deps) => ({ origin, dest, airline_id, airline: airline_id, deps, seats: deps * 100, passengers: deps * 80, freight: 0 });

test('mapRoutes adds members up on a shared pair, and applies the minimum to the total', () => {
  const rows = [mrow('SFO', 'LAX', 'VX', 8), mrow('SFO', 'LAX', 'AS', 8), mrow('SFO', 'DEN', 'AS', 8)];
  const { routes } = mapRoutes(rows, null, airports, { min: 12 });
  assert.deepEqual(routes.map((r) => [r.dest, r.deps]), [['LAX', 16]]);
});

