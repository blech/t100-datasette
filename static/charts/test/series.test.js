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

test('load factor leaves out a series\' periods with fewer than minDeps departures, so a full one-off flight is no spike', () => {
  const few = [row(2019, 'United', 'B737', 12, 900, 1000), row(2019, 'Charter', 'A320', 1, 180, 180), row(2020, 'Charter', 'A320', 20, 1000, 4000)];
  const res = buildSeries(few, { measure: 'load_factor', split: 'carrier', minDeps: 12 });
  assert.equal(at(res, 2019, 'United'), 90);
  assert.equal(at(res, 2019, 'Charter'), undefined);
  assert.equal(at(res, 2020, 'Charter'), 25);
  assert.deepEqual(res.series, ['Charter', 'United']);
  // other measures keep every period
  assert.equal(at(buildSeries(few, { measure: 'passengers', split: 'carrier', minDeps: 12 }), 2019, 'Charter'), 180);
});

test('other measures can be stacked', () => {
  assert.equal(buildSeries(rows, { measure: 'seats', split: 'none' }).stackable, true);
});

test('empty input gives empty output', () => {
  assert.deepEqual(buildSeries([], { measure: 'deps', split: 'carrier' }), { points: [], series: [], periods: [], stackable: true });
});

test('menus list every measure and split, seats last', () => {
  assert.deepEqual(Object.keys(MEASURES), ['passengers', 'freight', 'deps', 'load_factor', 'seats']);
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
  assert.deepEqual(t[1], { carrier: 'United', aircraft: 'B777', groupId: null, family: null, deps: 14, seats: 5600, passengers: 3800, freight: 3, loadFactor: (3800 / 5600) * 100 });
});

test('aggregateTable leaves load factor empty where there were no seats, and names unknowns', () => {
  const t = aggregateTable([row(2019, null, '', 3, 0, 0, 5000)]);
  assert.equal(t[0].carrier, 'Unknown');
  assert.equal(t[0].aircraft, 'Unknown');
  assert.equal(t[0].loadFactor, null);
});

test('aggregateTable carries the airline group and aircraft family through, for linking', () => {
  const t = aggregateTable([{ ...row(2019, 'United', 'B777', 10, 3000, 4000), group_id: 'united', family: 'Boeing 777' }]);
  assert.equal(t[0].groupId, 'united');
  assert.equal(t[0].family, 'Boeing 777');
});

const tableRows = [
  { carrier: 'Delta', aircraft: '737-800', group_id: 'delta', family: 'Boeing 737', deps: 10, total_seats: 1600, total_passengers: 1200, total_freight: 4000 },
  { carrier: 'Delta', aircraft: 'A321', group_id: 'delta', family: 'Airbus A320', deps: 5, total_seats: 950, total_passengers: 900, total_freight: 0 },
  { carrier: 'JetBlue', aircraft: 'A321', group_id: 'jetblue', family: 'Airbus A320', deps: 4, total_seats: 800, total_passengers: 700, total_freight: 2000 },
];

test('aggregateTable follows the split', () => {
  assert.deepEqual(aggregateTable(tableRows, 'carrier').map((t) => [t.carrier, t.aircraft, t.deps]), [['Delta', null, 15], ['JetBlue', null, 4]]);
  assert.deepEqual(aggregateTable(tableRows, 'aircraft').map((t) => [t.carrier, t.aircraft, t.deps]), [['A321', 9], ['737-800', 10]].map(([a, d]) => [null, a, d]));
  assert.equal(aggregateTable(tableRows, 'both').length, 3);
  const [all] = aggregateTable(tableRows, 'none');
  assert.deepEqual([all.carrier, all.aircraft, all.deps, all.passengers, all.freight], [null, null, 19, 2800, 3]);
  assert.equal(all.loadFactor, (2800 / 3350) * 100);
});

test('aggregateTable keeps the link targets that still apply', () => {
  assert.equal(aggregateTable(tableRows, 'carrier')[0].groupId, 'delta');
  assert.equal(aggregateTable(tableRows, 'carrier')[0].family, null);
  assert.equal(aggregateTable(tableRows, 'aircraft')[0].family, 'Airbus A320');
  assert.equal(aggregateTable(tableRows, 'aircraft')[0].groupId, null);
});

test('buildSeries makes room for a series asked for: it takes the last place, so colours stay distinct', () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ year: 2019, carrier: `C${i}`, aircraft: 'A', deps: 1, total_seats: 1, total_passengers: 100 - i, total_freight: 0 }));
  const plain = buildSeries(rows, { top: 8 });
  assert.ok(!plain.series.includes('C9') && plain.series.includes('Other'));
  const kept = buildSeries(rows, { top: 8, keep: new Set(['C9']) });
  assert.deepEqual(kept.series, ['C0', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C9', 'Other'], 'eight named series at most');
  assert.deepEqual(kept.points.filter((p) => p.series === 'Other').map((p) => p.value), [93 + 92], 'C7 and C8 fold into Other');
});
