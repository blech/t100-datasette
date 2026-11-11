import test from 'node:test';
import assert from 'node:assert/strict';
import { countrySlug, countryHref, cityHref, splitAirports, sumOf, lowerFirst, yearLabel, groupCities, matrixSearch, tableHref, topBy, parseState, toSearch, TABLE_PATHS, SORTS, sortLabels, airportHref, loadFactor } from '../src/table.js';

test('topBy sorts descending by the chosen measure and keeps the top n', () => {
  const rows = [
    { airport: 'A', passengers: 5, freight: 1 },
    { airport: 'B', passengers: 9, freight: 2 },
    { airport: 'C', passengers: 1, freight: 3 },
  ];
  assert.deepEqual(topBy(rows, 'passengers', 2).map((r) => r.airport), ['B', 'A']);
  assert.deepEqual(topBy(rows, 'freight', 2).map((r) => r.airport), ['C', 'B']);
  assert.deepEqual(rows.map((r) => r.airport), ['A', 'B', 'C']); // input untouched
});
test('ties break by airport code', () => {
  const rows = [{ airport: 'B', deps: 1 }, { airport: 'A', deps: 1 }];
  assert.deepEqual(topBy(rows, 'deps', 5).map((r) => r.airport), ['A', 'B']);
});
test('state defaults to the newest year and passengers', () => {
  assert.deepEqual(parseState('', 1990, 2025), { region: 'us', year: 2025, sort: 'passengers', group: 'airport', n: 50, service: 'all' });
});
test('state parses valid values and rejects junk', () => {
  assert.deepEqual(parseState('?year=2019&sort=freight', 1990, 2025), { region: 'us', year: 2019, sort: 'freight', group: 'airport', n: 50, service: 'all' });
  assert.deepEqual(parseState('?year=1850&sort=name', 1990, 2025), { region: 'us', year: 2025, sort: 'passengers', group: 'airport', n: 50, service: 'all' });
  assert.deepEqual(parseState('?year=2026', 1990, 2025), { region: 'us', year: 2025, sort: 'passengers', group: 'airport', n: 50, service: 'all' });
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
  assert.equal(tableHref('?measure=deps&n=25&theme=dark'), '/airports?sort=deps&n=25');   // the number of rows is shared too
  assert.equal(tableHref('?measure=seats'), '/airports');   // the table has no seats column
  assert.equal(tableHref(''), '/airports');
  assert.equal(matrixSearch('deps', 'city'), '?measure=deps&group=city');   // cities carry each way too
  assert.equal(matrixSearch('passengers', 'city'), '?group=city');
  assert.equal(tableHref('?group=city&open=31703'), '/airports/cities');   // the cities are the table's own page
});

test('the grouping is read from the path, and is not in the query', () => {
  assert.equal(parseState('', 1990, 2025, '/airports/cities').group, 'city');
  assert.equal(parseState('', 1990, 2025, '/airports').group, 'airport');
  assert.equal(parseState('', 1990, 2025).group, 'airport');
  assert.equal(parseState('?group=city', 1990, 2025, '/airports').group, 'airport');   // the old query is redirected by the server
  assert.equal(toSearch({ year: 2025, sort: 'passengers', group: 'city' }, 2025), '');
  assert.deepEqual(TABLE_PATHS, { airport: '/airports', city: '/airports/cities', country: '/airports/countries' });
});

const ap = (origin, market_id, city, passengers, extra = {}) =>
  ({ airport: origin, market_id, city, passengers, deps: passengers / 100, seats: passengers * 1.25, freight: 10, dests: 3, market_dests: 5, ...extra });

test('groupCities adds up a market\'s airports, names it by its busiest, and keeps its own destination count', () => {
  const cities = groupCities([ap('LGA', '31703', 'New York, NY', 300), ap('JFK', '31703', 'New York, NY', 600), ap('EWR', '31703', 'Newark, NJ', 400),
                              ap('ATL', '30397', 'Atlanta, GA', 1000, { market_dests: 7 }), ap('XYZ', null, 'Nowhere, AK', 5, { dests: 1 })]);
  const ny = cities.find((c) => c.key === '31703');
  assert.equal(ny.name, 'New York, NY');
  assert.deepEqual(ny.airports.map((a) => a.airport), ['JFK', 'EWR', 'LGA']);   // busiest first
  assert.deepEqual([ny.passengers, ny.deps, ny.seats, ny.freight, ny.dests], [1300, 13, 1625, 30, 5]);
  assert.equal(cities.find((c) => c.key === '30397').dests, 7);
  const lone = cities.find((c) => c.airports[0].airport === 'XYZ');
  assert.deepEqual([lone.name, lone.dests, lone.airports.length], ['Nowhere, AK', 1, 1]);  // no market: a city of one
});

test('a city is named by the city name its airports carry most between them, not its single busiest airport', () => {
  const [dc] = groupCities([ap('BWI', '30852', 'Baltimore, MD', 1300), ap('DCA', '30852', 'Washington, DC', 1200), ap('IAD', '30852', 'Washington, DC', 1100)]);
  assert.equal(dc.name, 'Washington, DC');
  assert.equal(dc.airports[0].airport, 'BWI');   // still listed busiest first
});

test('all years is a year choice of its own, written as year=all', () => {
  assert.equal(parseState('?year=all', 1990, 2025).year, 'all');
  assert.equal(toSearch({ year: 'all', sort: 'passengers', group: 'airport' }, 2025), '?year=all');
  assert.equal(yearLabel('all', 1990, 2025), '1990–2025');
  assert.equal(yearLabel(2019, 1990, 2025), '2019');
});

test('the flight count column is named for the direction counted', () => {
  assert.deepEqual(['', 'out', 'in'].map((d) => sortLabels(d).deps), ['Flights', 'Departures', 'Arrivals']);
  assert.equal(sortLabels('in').passengers, 'Passengers');
});

test('how many rows and which flights are read and written, and carry to the airports matrix and back', () => {
  assert.deepEqual([parseState('?n=10', 1990, 2025).n, parseState('?n=25', 1990, 2025).n, parseState('?n=20', 1990, 2025).n, parseState('?n=x', 1990, 2025).n], [10, 25, 50, 50]);
  assert.deepEqual(['domestic', 'international', 'all', 'bogus', ''].map((s) => parseState(`?service=${s}`, 1990, 2025).service), ['domestic', 'international', 'all', 'all', 'all']);
  assert.equal(toSearch({ region: 'us', year: 2025, sort: 'passengers', group: 'airport', n: 50, service: 'all' }, 2025), '');
  assert.equal(toSearch({ year: 2025, sort: 'passengers', group: 'airport', n: 10, service: 'international' }, 2025), '?n=10&service=international');
  assert.equal(matrixSearch('deps', 'city', { n: 25, service: 'domestic' }), '?measure=deps&group=city&n=25&service=domestic');
  assert.equal(matrixSearch('passengers', 'airport', { n: 50, service: 'all' }), '');
  assert.equal(tableHref('?measure=deps&n=25&service=international&scale=year'), '/airports?sort=deps&n=25&service=international');
  assert.equal(tableHref('?n=50&service=all&n=7'), '/airports');   // defaults and values the table has no menu for are dropped
});

test('airports abroad: the region is read and written, every flight is international and the directions are named for the US', () => {
  assert.deepEqual(['abroad', 'us', 'bogus', ''].map((r) => parseState(`?region=${r}`, 1990, 2025).region), ['abroad', 'us', 'us', 'us']);
  assert.equal(parseState('?region=abroad&service=domestic', 1990, 2025).service, 'all');   // the flights menu is only words there
  assert.equal(parseState('?service=domestic', 1990, 2025).service, 'domestic');
  assert.equal(toSearch({ region: 'abroad', year: 2025, sort: 'passengers', group: 'airport', n: 50, service: 'all' }, 2025), '?region=abroad');
  assert.equal(toSearch({ region: 'us', year: 2025, sort: 'passengers', group: 'airport', n: 50, service: 'all' }, 2025), '');
  assert.deepEqual(['', 'out', 'in'].map((d) => sortLabels(d, true).deps), ['Flights', 'Flights to the US', 'Flights from the US']);
  assert.deepEqual(['', 'out', 'in'].map((d) => sortLabels(d).deps), ['Flights', 'Departures', 'Arrivals']);
  assert.equal(lowerFirst('Flights to the US'), 'flights to the US');
  assert.equal(matrixSearch('deps', 'city', { region: 'abroad' }), '?measure=deps&group=city&region=abroad');   // Over time knows abroad too
  assert.equal(matrixSearch('deps', 'country', { region: 'abroad' }), '?measure=deps&group=country&region=abroad');
  assert.equal(matrixSearch('deps', 'country'), '?measure=deps');   // countries are an abroad grouping
  assert.equal(tableHref('?region=abroad&group=country&measure=freight'), '/airports/countries?sort=freight');   // abroad by its address
  assert.equal(tableHref('?region=abroad&group=city'), '/airports/cities?region=abroad');
  assert.equal(tableHref('?group=country'), '/airports');
});

test('abroad, airports group by country, with the country\'s own destination count', () => {
  const countries = parseState('', 1990, 2025, '/airports/countries');   // the countries' address means abroad
  assert.deepEqual([countries.group, countries.region], ['country', 'abroad']);
  assert.equal(toSearch({ region: 'abroad', year: 2025, sort: 'passengers', group: 'country', n: 50, service: 'all' }, 2025), '');
  assert.equal(toSearch({ region: 'abroad', year: 2025, sort: 'passengers', group: 'city', n: 50, service: 'all' }, 2025), '?region=abroad');
  const row = (airport, city, country, passengers, country_dests) => ({ airport, city, country, passengers, deps: 1, seats: 2, freight: 0, dests: 1, market_id: airport, market_dests: 1, country_dests });
  const [uk, fr] = groupCities([row('MAN', 'Manchester, United Kingdom', 'United Kingdom', 5, 4), row('LHR', 'London, United Kingdom', 'United Kingdom', 9, 4), row('CDG', 'Paris, France', 'France', 7, 2)], 'country');
  assert.deepEqual([uk.name, uk.passengers, uk.dests, uk.airports.map((a) => a.airport)], ['United Kingdom', 14, 4, ['LHR', 'MAN']]);
  assert.deepEqual([fr.name, fr.dests], ['France', 2]);
});

test('a country\'s address is its name as a slug, with the year and way carried', () => {
  assert.deepEqual(['United Kingdom', 'Congo (Kinshasa)', 'Côte d\'Ivoire', 'U.S.S.R.'].map(countrySlug), ['united-kingdom', 'congo-kinshasa', 'cote-d-ivoire', 'u-s-s-r']);
  assert.equal(countryHref('United Kingdom', { year: 2025, dir: '' }, 2025), '/airports/countries/united-kingdom');
  assert.equal(countryHref('United Kingdom', { year: 'all', dir: 'out' }, 2025), '/airports/countries/united-kingdom?year=all&dir=out');
});

test('a country opens to its five busiest airports and a sum of the rest, unless only one would be left over', () => {
  const list = (n) => Array.from({ length: n }, (_, i) => ({ airport: `A${i}`, passengers: 10, deps: 1, seats: 20, freight: 2 }));
  assert.equal(splitAirports(list(6)).others.length, 0);
  const { shown, others } = splitAirports(list(9));
  assert.deepEqual([shown.length, others.length], [5, 4]);
  assert.deepEqual(sumOf(others), { passengers: 40, deps: 4, seats: 80, freight: 8 });
});

test('a city row opens its city page, ranked by the table\'s year and counted its way; an airport with no market has none', () => {
  assert.equal(cityHref('32575', { year: 2025, dir: '' }), '/airports/cities/32575?year=2025');
  assert.equal(cityHref('32575', { year: 'all', dir: 'out' }), '/airports/cities/32575?dir=out');
  assert.equal(cityHref('solo:ZZZ'), null);
});
