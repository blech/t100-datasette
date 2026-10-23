import test from 'node:test';
import assert from 'node:assert/strict';
import { matrixSearch, tableSearch, topBy, parseState, toSearch, SORTS, airportHref, loadFactor } from '../src/table.js';

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
  assert.deepEqual(parseState('', 1990, 2025), { year: 2025, sort: 'passengers' });
});
test('state parses valid values and rejects junk', () => {
  assert.deepEqual(parseState('?year=2019&sort=freight', 1990, 2025), { year: 2019, sort: 'freight' });
  assert.deepEqual(parseState('?year=1850&sort=name', 1990, 2025), { year: 2025, sort: 'passengers' });
  assert.deepEqual(parseState('?year=2026', 1990, 2025), { year: 2025, sort: 'passengers' });
});
test('toSearch omits defaults', () => {
  assert.equal(toSearch({ year: 2025, sort: 'passengers' }, 2025), '');
  assert.equal(toSearch({ year: 2019, sort: 'freight' }, 2025), '?year=2019&sort=freight');
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
});
