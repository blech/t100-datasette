import test from 'node:test';
import assert from 'node:assert/strict';
import { sizeSeries, placeCounts, classifyChanges, summariseChanges, airlineList, changeSort, sortChanges } from '../src/airport.js';

const s = (year, group_id, group_name, service, kind, deps, extra = {}) =>
  ({ year, group_id, group_name, service, kind, deps, seats: deps * 100, passengers: deps * 80, freight: 0, ...extra });
const value = (res, year, series) => res.points.find((p) => p.year === year && p.series === series)?.value;

test('sizeSeries sums by service, by kind and by airline, and filters by flights', () => {
  const rows = [
    s(2019, 'united', 'United', 'domestic', 'passenger', 10),
    s(2019, 'united', 'United', 'international', 'freight', 4),
    s(2019, 'delta', 'Delta', 'domestic', 'passenger', 6),
    s(2020, 'delta', 'Delta', 'domestic', 'passenger', 1),
  ];
  const byService = sizeSeries(rows, { measure: 'deps', flights: 'all', split: 'service' });
  assert.deepEqual(byService.series, ['domestic', 'international']);
  assert.equal(value(byService, 2019, 'domestic'), 16);
  assert.equal(value(byService, 2019, 'international'), 4);
  const byKind = sizeSeries(rows, { measure: 'deps', flights: 'passenger', split: 'kind' });
  assert.deepEqual(byKind.series, ['passenger']);
  assert.equal(value(byKind, 2019, 'passenger'), 16);
  const byAirline = sizeSeries(rows, { measure: 'deps', flights: 'passenger', split: 'airline' });
  assert.deepEqual(byAirline.series, ['United', 'Delta']);
  assert.equal(value(byAirline, 2019, 'United'), 10);
  assert.equal(value(byAirline, 2020, 'Delta'), 1);
});

test('sizeSeries keeps the top 8 airlines, folds the rest into Other on top, and links all but unknown', () => {
  const rows = Array.from({ length: 10 }, (_, i) => s(2019, i === 1 ? 'unknown' : `g${i}`, i === 1 ? 'Unknown carrier' : `G${i}`, 'domestic', 'passenger', 100 - i));
  const res = sizeSeries(rows, { measure: 'deps', flights: 'all', split: 'airline' });
  assert.equal(res.series.length, 9);
  assert.equal(res.series.at(-1), 'Other');
  assert.equal(res.series[0], 'G0');
  assert.equal(value(res, 2019, 'Other'), 92 + 91);
  assert.equal(res.links.get('G0'), 'g0');
  assert.equal(res.links.has('Unknown carrier'), false);
  assert.equal(res.links.has('Other'), false);
});

test('sizeSeries gives no points for a measure the airport has none of', () => {
  const rows = [s(2019, 'fx', 'FedEx', 'domestic', 'freight', 5, { passengers: 0, seats: 0, freight: 8000 })];
  assert.deepEqual(sizeSeries(rows, { measure: 'passengers', flights: 'all', split: 'service' }).points, []);
  assert.deepEqual(sizeSeries(rows, { measure: 'deps', flights: 'passenger', split: 'service' }).points, []);
});

test('sizeSeries gives freight in short tons', () => {
  const rows = [s(2019, 'fx', 'FedEx', 'domestic', 'freight', 5, { freight: 4000 })];
  assert.equal(value(sizeSeries(rows, { measure: 'freight', flights: 'all', split: 'service' }), 2019, 'domestic'), 2);
  assert.equal(value(sizeSeries(rows, { measure: 'freight', flights: 'all', split: 'airline' }), 2019, 'FedEx'), 2);
});

test('placeCounts counts destinations at or above the minimum, by service', () => {
  const rows = [
    { dest: 'LAX', year: 2019, deps: 12, service: 'domestic' },
    { dest: 'SEA', year: 2019, deps: 11, service: 'domestic' },
    { dest: 'LHR', year: 2019, deps: 300, service: 'international' },
    { dest: 'LAX', year: 2020, deps: 40, service: 'domestic' },
  ];
  assert.deepEqual(placeCounts(rows, { min: 12 }), [
    { year: 2019, service: 'domestic', count: 1 },
    { year: 2019, service: 'international', count: 1 },
    { year: 2020, service: 'domestic', count: 1 },
  ]);
  assert.equal(placeCounts(rows, { min: 1 }).find((c) => c.year === 2019 && c.service === 'domestic').count, 2);
});

const c = (dest, group_id, group_name, deps_a, deps_b, first_ym = 199001, last_ym = 202512) =>
  ({ dest, city: `${dest} city`, group_id, group_name, deps_a, deps_b, pax_a: 0, first_ym, last_ym });

test('classifyChanges sorts destinations into kept, dropped and added at the minimum', () => {
  const rows = [
    c('LAX', 'united', 'United', 12, 12),   // exactly the minimum both years: kept
    c('SEA', 'united', 'United', 30, 11, 199001, 202104), // below it in the second: dropped
    c('BOS', 'united', 'United', 0, 20, 202102, 202512),  // added
    c('PDX', 'united', 'United', 5, 6),     // neither year: left out
  ];
  const out = classifyChanges(rows, { min: 12, show: 'destinations' });
  const by = Object.fromEntries(out.map((d) => [d.code, d]));
  assert.equal(by.LAX.status, 'kept');
  assert.equal(by.SEA.status, 'dropped');
  assert.equal(by.SEA.ym, 202104);
  assert.equal(by.BOS.status, 'added');
  assert.equal(by.BOS.ym, 202102);
  assert.equal(by.BOS.city, 'BOS city');
  assert.equal(by.PDX, undefined);
  assert.deepEqual(summariseChanges(out), { kept: 1, dropped: 1, added: 1 });
});

test('classifyChanges lists the airlines of the year that counts, busiest first', () => {
  const rows = [c('LAX', 'united', 'United', 5, 0), c('LAX', 'delta', 'Delta', 20, 3), c('LAX', 'alaska', 'Alaska', 0, 30)];
  const [lax] = classifyChanges(rows, { min: 12, show: 'destinations' });
  assert.equal(lax.status, 'kept');
  assert.equal(lax.deps_a, 25);
  assert.equal(lax.deps_b, 33);
  assert.deepEqual(lax.airlines, ['Delta', 'United']);
  const [added] = classifyChanges([c('BOS', 'alaska', 'Alaska', 0, 30), c('BOS', 'delta', 'Delta', 0, 40)], { min: 12, show: 'destinations' });
  assert.deepEqual(added.airlines, ['Delta', 'Alaska']);
});

test('classifyChanges counts airlines and their destinations', () => {
  const rows = [
    c('LAX', 'united', 'United', 20, 0, 199001, 202003),
    c('SEA', 'united', 'United', 15, 0, 199001, 201912),
    c('PDX', 'united', 'United', 2, 0, 199001, 201805),
    c('LAX', 'alaska', 'Alaska', 0, 40, 202105, 202512),
    c('LAX', 'unknown', 'Unknown carrier', 3, 4),
  ];
  const out = classifyChanges(rows, { min: 12, show: 'airlines' });
  const by = Object.fromEntries(out.map((a) => [a.id, a]));
  assert.deepEqual([by.united.status, by.united.deps_a, by.united.places, by.united.year], ['dropped', 37, 2, 2020]);
  assert.deepEqual([by.alaska.status, by.alaska.places, by.alaska.year, by.alaska.name], ['added', 1, 2021, 'Alaska']);
  assert.equal(by.unknown, undefined);
  assert.deepEqual(out.map((a) => a.id), ['alaska', 'united']);  // each by its own year's departures: added by the second, otherwise the first
});

test('a year compared with itself keeps everything', () => {
  const rows = [c('LAX', 'united', 'United', 20, 20), c('SEA', 'united', 'United', 13, 13), c('PDX', 'united', 'United', 2, 2)];
  const out = classifyChanges(rows, { min: 12, show: 'destinations' });
  assert.deepEqual(out.map((d) => d.status), ['kept', 'kept']);
  assert.deepEqual(summariseChanges(out), { kept: 2, dropped: 0, added: 0 });
});

test('airlineList shows three then counts the rest', () => {
  assert.equal(airlineList(['A', 'B', 'C', 'D', 'E']), 'A, B, C + 2 more');
  assert.equal(airlineList(['A', 'B']), 'A, B');
  assert.equal(airlineList([]), '');
});

test('a list of changes sorts by the departures of the year that counts, or by when it changed, latest first', () => {
  const added = classifyChanges([
    c('BOS', 'united', 'United', 0, 20, 202102), c('SJC', 'united', 'United', 0, 300, 201606), c('AUS', 'united', 'United', 0, 90, 202301),
  ], { min: 12, show: 'destinations' });
  assert.deepEqual(sortChanges(added, 'added', 'b').map((x) => x.code), ['SJC', 'AUS', 'BOS']);
  assert.deepEqual(sortChanges(added, 'added', 'when').map((x) => x.code), ['AUS', 'BOS', 'SJC']);
  const dropped = classifyChanges([
    c('SEA', 'united', 'United', 30, 0, 199001, 202104), c('PDX', 'united', 'United', 500, 0, 199001, 200912),
  ], { min: 12, show: 'destinations' });
  assert.deepEqual(sortChanges(dropped, 'dropped', 'a').map((x) => x.code), ['PDX', 'SEA']);
  assert.deepEqual(sortChanges(dropped, 'dropped', 'when').map((x) => x.code), ['SEA', 'PDX']);
});

test('each status sorts only by the columns that mean something for it, the departures that count first', () => {
  assert.equal(changeSort('added', 'when'), 'when');
  assert.equal(changeSort('added', 'a'), 'b');      // its first year's departures are all nothing
  assert.equal(changeSort('dropped', 'b'), 'a');
  assert.equal(changeSort('dropped', null), 'a');
  assert.equal(changeSort('kept', 'b'), 'b');
  assert.equal(changeSort('kept', 'when'), 'a');
  assert.equal(changeSort('gone', 'a'), 'peak');
  assert.equal(changeSort('gone', 'when'), 'when');
});

test('airlines sort by the year they started or stopped here', () => {
  const rows = [c('LAX', 'united', 'United', 0, 30, 199001, 202512), c('SFO', 'delta', 'Delta', 0, 40, 201501, 202512)];
  const out = classifyChanges(rows, { min: 12, show: 'airlines' });
  assert.deepEqual(sortChanges(out, 'added', 'when').map((x) => x.id), ['delta', 'united']);
});

test('those dropped at any point sort by their busiest year, or by the last year they flew', () => {
  const items = [{ code: 'SJC', peakDeps: 351, lastYear: 2023 }, { code: 'ANC', peakDeps: 365, lastYear: 2006 }, { code: 'CHS', peakDeps: 58, lastYear: 2019 }];
  assert.deepEqual(sortChanges(items, 'gone', 'peak').map((x) => x.code), ['ANC', 'SJC', 'CHS']);
  assert.deepEqual(sortChanges(items, 'gone', 'when').map((x) => x.code), ['SJC', 'CHS', 'ANC']);
});
