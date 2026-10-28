import test from 'node:test';
import assert from 'node:assert/strict';
import { airportGone, pairsGone, flownText, mostText } from '../src/gone.js';

// airport_gone rows: one per item and member in the item's busiest year
const g = (code, member, member_deps, deps_a, first_year, last_year, peak_year, peak_deps) =>
  ({ code, name: `${code} city`, member, member_deps, deps_a, first_year, last_year, peak_year, peak_deps });

test('airportGone gives each item once, dropped when it flew in the first year and added then dropped when not', () => {
  const out = airportGone([
    g('SJC', 'British Airways', 351, 0, 2016, 2023, 2017, 351),
    g('CHS', 'British Airways', 57, 1, 2019, 2019, 2019, 58), g('CHS', 'American', 1, 1, 2019, 2019, 2019, 58),
    g('ANC', 'British Airways', 300, 300, 1990, 2006, 1995, 365),
  ], { min: 12 });
  assert.deepEqual(out.map((x) => [x.code, x.status]), [['ANC', 'dropped'], ['SJC', 'between'], ['CHS', 'between']]);
  const chs = out[2];
  assert.deepEqual([chs.name, chs.deps_a, chs.firstYear, chs.lastYear, chs.peakYear, chs.peakDeps], ['CHS city', 1, 2019, 2019, 2019, 58]);
  assert.deepEqual(chs.members, ['British Airways', 'American']);
  assert.equal(chs.places, 2); // every member flown in the busiest year, American's 1 included
});

test('airportGone counts an item\'s members even when none reaches the minimum alone', () => {
  // an airline flying 30 times a year at the airport, but to no one destination 24 times
  const [eastern] = airportGone([g('EA', 'MIA', 20, 0, 2015, 2015, 2015, 30), g('EA', 'TPA', 10, 0, 2015, 2015, 2015, 30)], { min: 24 });
  assert.equal(eastern.places, 2);
});

// carrier_routes_gone rows: one per pair, member airline and year
const p = (origin, dest, airline, year, deps) => ({ origin, dest, airline, year, deps, seats: 0, passengers: 0, freight: 0 });

test('pairsGone adds up each pair\'s members by year and finds its span and busiest year', () => {
  const out = pairsGone([
    p('ATL', 'PVG', 'Delta', 2018, 300), p('ATL', 'PVG', 'Delta', 2019, 600), p('ATL', 'PVG', 'Endeavor', 2019, 53),
    p('ATL', 'PVG', 'Delta', 2020, 100),
    p('JFK', 'BOM', 'Delta', 2015, 400), p('JFK', 'BOM', 'Delta', 2016, 200),
  ], { a: 2015 });
  assert.deepEqual(out.map((x) => [`${x.origin}-${x.dest}`, x.status]), [['ATL-PVG', 'between'], ['JFK-BOM', 'dropped']]);
  const pvg = out[0];
  assert.deepEqual([pvg.deps_a, pvg.firstYear, pvg.lastYear, pvg.peakYear, pvg.peakDeps], [0, 2018, 2020, 2019, 653]);
  assert.deepEqual(pvg.airlines, ['Delta', 'Endeavor']);
  assert.equal(out[1].deps_a, 400);
});

test('the span and the busiest year read as words', () => {
  assert.equal(flownText({ firstYear: 2016, lastYear: 2023 }), '2016–2023');
  assert.equal(flownText({ firstYear: 2019, lastYear: 2019 }), '2019');
  assert.equal(mostText({ peakDeps: 1351, peakYear: 2017 }), '1,350 in 2017');
});
