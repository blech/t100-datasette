import test from 'node:test';
import assert from 'node:assert/strict';
import { FINDERS, airportOptions, aircraftOptions } from '../src/find.js';

test('each kind of find box reads its own list query', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(FINDERS).map(([k, f]) => [k, f.query])),
    { airline: 'airline_list', airport: 'airport_list', aircraft: 'aircraft_list' });
});

test('an airline opens its own page, a suffix such as /globe opening that view of it', () => {
  const rows = [{ id: '19790', name: 'Delta Air Lines Inc.', parent: '', first_year: 1990, last_year: 2025, deps: 3 }];
  assert.equal(FINDERS.airline.options(rows)[0].href, '/airlines/19790');
  assert.equal(FINDERS.airline.options(rows, '/globe')[0].href, '/airlines/19790/globe');
});

test('airportOptions offers each airport by its code, with its place, name and years as the hint', () => {
  const opts = airportOptions([
    { code: 'SFO', place: 'San Francisco, CA', name: 'San Francisco International Airport', first_year: 1990, last_year: 2025 },
    { code: 'XYZ', place: 'Somewhere, AK', name: null, first_year: 1995, last_year: 1997 },
  ]);
  assert.deepEqual(opts.map((o) => [o.value, o.href]), [['SFO', '/airports/SFO'], ['XYZ', '/airports/XYZ']]);
  assert.equal(opts[0].hint, 'San Francisco, CA – San Francisco International Airport · 1990–2025');
  assert.equal(opts[1].hint, 'Somewhere, AK · 1995–1997');
});

test('aircraftOptions offers each family, then each aircraft under its family, a name shared with the family offered once', () => {
  const opts = aircraftOptions([
    { family: 'Boeing 737', name: 'Boeing 737-800', first_year: 1998, last_year: 2025 },
    { family: 'Boeing 737', name: 'Boeing 737-200', first_year: 1990, last_year: 2008 },
    { family: 'Boeing 717', name: 'Boeing 717', first_year: 1999, last_year: 2025 },
  ]);
  assert.deepEqual(opts.map((o) => [o.value, o.href]), [
    ['Boeing 737', '/aircraft/boeing-737'],
    ['Boeing 717', '/aircraft/boeing-717'],
    ['Boeing 737-800', '/aircraft/boeing-737/boeing-737-800'],
    ['Boeing 737-200', '/aircraft/boeing-737/boeing-737-200'],
  ]);
  assert.equal(opts[0].hint, 'Family · 1990–2025');
  assert.equal(opts[2].hint, 'Boeing 737 · 1998–2025');
});
