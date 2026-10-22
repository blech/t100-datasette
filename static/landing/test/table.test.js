import test from 'node:test';
import assert from 'node:assert/strict';
import { groupCities, matrixSearch, tableSearch, topBy, parseState, toSearch, SORTS, airportHref, loadFactor } from '../src/table.js';

test('topBy sorts descending by the chosen measure and keeps the top n', () => {
  const rows = [
    { origin: 'A', passengers: 5, freight: 1 },
    { origin: 'B', passengers: 9, freight: 2 },
    { origin: 'C', passengers: 1, freight: 3 },
  ];
  assert.deepEqual(topBy(rows, 'passengers', 2).map((r) => r.origin), ['B', 'A']);
  assert.deepEqual(topBy(rows, 'freight', 2).map((r) => r.origin), ['C', 'B']);
  assert.deepEqual(rows.map((r) => r.origin), ['A', 'B', 'C']); // input untouched
});
test('ties break by airport code', () => {
  const rows = [{ origin: 'B', deps: 1 }, { origin: 'A', deps: 1 }];
  assert.deepEqual(topBy(rows, 'deps', 5).map((r) => r.origin), ['A', 'B']);
});
test('state defaults to the newest year and passengers', () => {
  assert.deepEqual(parseState('', 1990, 2025), { year: 2025, sort: 'passengers', group: 'airport' });
});
test('state parses valid values and rejects junk', () => {
  assert.deepEqual(parseState('?year=2019&sort=freight', 1990, 2025), { year: 2019, sort: 'freight', group: 'airport' });
  assert.deepEqual(parseState('?year=1850&sort=name', 1990, 2025), { year: 2025, sort: 'passengers', group: 'airport' });
  assert.deepEqual(parseState('?year=2026', 1990, 2025), { year: 2025, sort: 'passengers', group: 'airport' });
});
test('toSearch omits defaults', () => {
  assert.equal(toSearch({ year: 2025, sort: 'passengers', group: 'airport' }, 2025), '');
  assert.equal(toSearch({ year: 2019, sort: 'freight', group: 'airport' }, 2025), '?year=2019&sort=freight');
  assert.equal(toSearch({ year: 2025, sort: 'deps' }, 2025), '?sort=deps');
  assert.deepEqual(Object.keys(SORTS), ['passengers', 'deps', 'dests', 'freight']);
});

test('airportHref carries the sort to the airport page as its matrix measure', () => {
  assert.equal(airportHref('ATL', 'passengers'), '/airports/ATL');
  assert.equal(airportHref('ATL', 'freight'), '/airports/ATL?measure=freight');
  assert.equal(airportHref('ATL', 'deps'), '/airports/ATL?measure=deps');
  assert.equal(airportHref('ATL', 'dests'), '/airports/ATL');  // no destinations matrix
});

test('seats is no longer a sort', () => {
  assert.equal(parseState('?sort=seats', 1990, 2025).sort, 'passengers');
});

test('loadFactor is passengers over seats, null with no seats', () => {
  assert.equal(loadFactor({ passengers: 80, seats: 100 }), 80);
  assert.equal(loadFactor({ passengers: 0, seats: 0 }), null);
});

test('the table and the airports matrix carry the measure each way, where both have it', () => {
  assert.equal(matrixSearch('passengers'), '');
  assert.equal(matrixSearch('deps'), '?measure=deps');
  assert.equal(matrixSearch('freight'), '?measure=freight');
  assert.equal(matrixSearch('dests'), '');           // the matrix has no destinations
  assert.equal(tableSearch('?measure=deps&n=25&theme=dark'), '?sort=deps');
  assert.equal(tableSearch('?measure=seats'), '');   // the table has no seats column
  assert.equal(tableSearch(''), '');
  assert.equal(matrixSearch('deps', 'city'), '?measure=deps&group=city');   // cities carry each way too
  assert.equal(matrixSearch('passengers', 'city'), '?group=city');
  assert.equal(tableSearch('?group=city&open=31703'), '?group=city');
});

test('the group setting is read and written with the year and sort', () => {
  assert.equal(parseState('?group=city', 1990, 2025).group, 'city');
  assert.equal(parseState('?group=bogus', 1990, 2025).group, 'airport');
  assert.equal(toSearch({ year: 2025, sort: 'passengers', group: 'city' }, 2025), '?group=city');
});

const ap = (origin, market_id, city, passengers, extra = {}) =>
  ({ origin, market_id, origin_city_name: city, passengers, deps: passengers / 100, seats: passengers * 1.25, freight: 10, dests: 3, market_dests: 5, ...extra });

test('groupCities adds up a market\'s airports, names it by its busiest, and keeps its own destination count', () => {
  const cities = groupCities([ap('LGA', '31703', 'New York, NY', 300), ap('JFK', '31703', 'New York, NY', 600), ap('EWR', '31703', 'Newark, NJ', 400),
                              ap('ATL', '30397', 'Atlanta, GA', 1000, { market_dests: 7 }), ap('XYZ', null, 'Nowhere, AK', 5, { dests: 1 })]);
  const ny = cities.find((c) => c.key === '31703');
  assert.equal(ny.name, 'New York, NY');
  assert.deepEqual(ny.airports.map((a) => a.origin), ['JFK', 'EWR', 'LGA']);   // busiest first
  assert.deepEqual([ny.passengers, ny.deps, ny.seats, ny.freight, ny.dests], [1300, 13, 1625, 30, 5]);
  assert.equal(cities.find((c) => c.key === '30397').dests, 7);
  const lone = cities.find((c) => c.airports[0].origin === 'XYZ');
  assert.deepEqual([lone.name, lone.dests, lone.airports.length], ['Nowhere, AK', 1, 1]);  // no market: a city of one
});

test('a city is named by the city name its airports carry most between them, not its single busiest airport', () => {
  const [dc] = groupCities([ap('BWI', '30852', 'Baltimore, MD', 1300), ap('DCA', '30852', 'Washington, DC', 1200), ap('IAD', '30852', 'Washington, DC', 1100)]);
  assert.equal(dc.name, 'Washington, DC');
  assert.equal(dc.airports[0].origin, 'BWI');   // still listed busiest first
});
