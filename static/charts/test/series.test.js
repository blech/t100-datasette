import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSeries, aggregateTable, MEASURES, SPLITS } from '../src/series.js';

const row = (year, carrier, aircraft, deps, pax, seats, freight = 0) =>
  ({ year, carrier, aircraft, deps, total_passengers: pax, total_seats: seats, total_freight: freight });

const rows = [
  row(2019, 'United', 'B777', 10, 3000, 4000, 4000),
  row(2019, 'United', 'A380', 5, 2000, 2500, 0),
  row(2019, 'BA', 'B777', 20, 6000, 8000, 0),
  row(2020, 'United', 'B777', 4, 800, 1600, 2000),
];

const at = (res, year, series) => res.points.find((p) => p.period === year && p.series === series)?.value;

test('no split gives one series summed per year', () => {
  const res = buildSeries(rows, { measure: 'passengers', split: 'none' });
  assert.deepEqual(res.series, ['All']);
  assert.deepEqual(res.periods, [2019, 2020]);
  assert.equal(at(res, 2019, 'All'), 11000);
  assert.equal(at(res, 2020, 'All'), 800);
});

test('splitting by carrier sums over aircraft', () => {
  const res = buildSeries(rows, { measure: 'passengers', split: 'carrier' });
  assert.equal(at(res, 2019, 'United'), 5000);
  assert.equal(at(res, 2019, 'BA'), 6000);
  assert.deepEqual(res.series, ['BA', 'United']); // biggest overall first
});

test('splitting by aircraft sums over carriers', () => {
  const res = buildSeries(rows, { measure: 'deps', split: 'aircraft' });
  assert.equal(at(res, 2019, 'B777'), 30);
  assert.equal(at(res, 2019, 'A380'), 5);
});

test('carrier and aircraft together keep the original pairs', () => {
  const res = buildSeries(rows, { measure: 'deps', split: 'both' });
  assert.equal(at(res, 2019, 'United · B777'), 10);
  assert.equal(res.series.length, 3);
});

test('small series fold into Other, which is listed last', () => {
  const res = buildSeries(rows, { measure: 'passengers', split: 'both', top: 2 });
  assert.deepEqual(res.series, ['BA · B777', 'United · B777', 'Other'].slice(0, 3));
  assert.equal(at(res, 2019, 'Other'), 2000);
  assert.equal(at(res, 2020, 'Other'), undefined);
});

test('missing names are labelled Unknown', () => {
  const res = buildSeries([row(2019, null, '', 1, 1, 1)], { measure: 'deps', split: 'both' });
  assert.deepEqual(res.series, ['Unknown · Unknown']);
});

test('freight is converted from pounds to short tons', () => {
  const res = buildSeries(rows, { measure: 'freight', split: 'none' });
  assert.equal(at(res, 2019, 'All'), 2);
});

test('load factor is passengers over seats, per series and year', () => {
  const res = buildSeries(rows, { measure: 'load_factor', split: 'carrier' });
  assert.equal(at(res, 2019, 'United'), (5000 / 6500) * 100);
  assert.equal(at(res, 2020, 'United'), 50);
  assert.equal(res.stackable, false);
});

test('load factor is left out where there were no seats', () => {
  const res = buildSeries([row(2019, 'X', 'Y', 3, 0, 0, 5000)], { measure: 'load_factor', split: 'none' });
  assert.equal(res.points.length, 0);
});

test('other measures can be stacked', () => {
  assert.equal(buildSeries(rows, { measure: 'seats', split: 'none' }).stackable, true);
});

test('empty input gives empty output', () => {
  assert.deepEqual(buildSeries([], { measure: 'deps', split: 'carrier' }), { points: [], series: [], periods: [], stackable: true });
});

test('menus list every measure and split', () => {
  assert.deepEqual(Object.keys(MEASURES), ['passengers', 'deps', 'seats', 'freight', 'load_factor']);
  assert.deepEqual(Object.keys(SPLITS), ['carrier', 'aircraft', 'both', 'none']);
});

test('months can be the period instead of years', () => {
  const monthly = [
    { month: '01', carrier: 'BA', aircraft: 'B777', deps: 3, total_passengers: 900, total_seats: 1000, total_freight: 0 },
    { month: '02', carrier: 'BA', aircraft: 'B777', deps: 2, total_passengers: 500, total_seats: 700, total_freight: 0 },
    { month: '02', carrier: 'VS', aircraft: 'A350', deps: 1, total_passengers: 200, total_seats: 300, total_freight: 0 },
  ];
  const res = buildSeries(monthly, { measure: 'passengers', split: 'carrier', periodKey: 'month' });
  assert.deepEqual(res.periods, [1, 2]);
  assert.equal(res.points.find((p) => p.period === 2 && p.series === 'VS').value, 200);
});

test('aggregateTable sums carrier and aircraft pairs over all rows, biggest first', () => {
  const t = aggregateTable([
    row(2019, 'United', 'B777', 10, 3000, 4000, 4000),
    row(2020, 'United', 'B777', 4, 800, 1600, 2000),
    row(2019, 'BA', 'B777', 20, 6000, 8000, 0),
  ]);
  assert.deepEqual(t.map((r) => `${r.carrier}|${r.aircraft}`), ['BA|B777', 'United|B777']);
  assert.deepEqual(t[1], { carrier: 'United', aircraft: 'B777', deps: 14, seats: 5600, passengers: 3800, freight: 3, loadFactor: (3800 / 5600) * 100 });
});

test('aggregateTable leaves load factor empty where there were no seats, and names unknowns', () => {
  const t = aggregateTable([row(2019, null, '', 3, 0, 0, 5000)]);
  assert.equal(t[0].carrier, 'Unknown');
  assert.equal(t[0].aircraft, 'Unknown');
  assert.equal(t[0].loadFactor, null);
});
