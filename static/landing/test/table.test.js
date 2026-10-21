import test from 'node:test';
import assert from 'node:assert/strict';
import { topBy, parseState, toSearch, SORTS, airportHref } from '../src/table.js';

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
  assert.deepEqual(Object.keys(SORTS), ['passengers', 'deps', 'seats', 'freight']);
});

test('airportHref carries the sort to the airport page as its heat map measure', () => {
  assert.equal(airportHref('ATL', 'passengers'), '/airports/ATL');
  assert.equal(airportHref('ATL', 'freight'), '/airports/ATL?measure=freight');
  assert.equal(airportHref('ATL', 'deps'), '/airports/ATL?measure=deps');
  assert.equal(airportHref('ATL', 'seats'), '/airports/ATL?measure=seats');
});
