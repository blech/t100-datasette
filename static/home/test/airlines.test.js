import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shortAirlineName, airlineLines, spreadLabels, stackShares, passengerBands, OTHER_AIRLINES, airlineColours } from '../src/airlines.js';

test('shortAirlineName drops the legal ending, as the server does', () => {
  assert.equal(shortAirlineName('Southwest Airlines Co.'), 'Southwest Airlines');
  assert.equal(shortAirlineName('American Airlines Inc.'), 'American Airlines');
  assert.equal(shortAirlineName('Alaska Airlines, Inc.'), 'Alaska Airlines');
  assert.equal(shortAirlineName('19805'), '19805');
});

test('airlineLines gives numeric points labelled by brand (no legal ending, no "Airlines"), series ordered by the latest year', () => {
  const rows = [
    { year: 1990, airline_id: 'A', airline_name: 'Alpha Airlines Inc.', share: '0.1' },
    { year: 2025, airline_id: 'B', airline_name: 'Beta Air Lines Inc.', share: 0.2 },
    { year: 2025, airline_id: 'A', airline_name: 'Alpha Airlines Inc.', share: 0.15 },
    { year: 2024, airline_id: 'B', airline_name: 'Beta Air Lines Inc.', share: null },
  ];
  assert.deepEqual(airlineLines(rows), {
    series: ['Beta', 'Alpha'],
    points: [
      { year: 1990, series: 'Alpha', share: 0.1 },
      { year: 2025, series: 'Beta', share: 0.2 },
      { year: 2025, series: 'Alpha', share: 0.15 },
    ],
  });
});

test('spreadLabels keeps labels at least a gap apart, nearest to where their lines end', () => {
  // three labels crowded around 15, one well clear at 5
  const out = spreadLabels([15.4, 15.1, 15.0, 5], 1);
  assert.deepEqual(out.map((v) => Math.round(v * 100) / 100), [16.17, 15.17, 14.17, 5]);
  assert.deepEqual(spreadLabels([3, 9], 1), [3, 9]);
});

test('stackShares stacks each year in the given order, from zero up', () => {
  const pts = [
    { year: 1990, series: 'A', share: 0.1 }, { year: 1990, series: 'B', share: 0.2 },
    { year: 1991, series: 'B', share: 0.3 },
  ];
  const out = stackShares(pts, (d) => ['A', 'B'].indexOf(d.series));
  assert.deepEqual(out.map((d) => [d.year, d.series, d.y1, Math.round(d.y2 * 10) / 10]), [
    [1990, 'A', 0, 0.1], [1990, 'B', 0.1, 0.3], [1991, 'B', 0, 0.3],
  ]);
});

test('stackShares can stack another value', () => {
  const out = stackShares([{ year: 1, series: 'A', n: 5 }, { year: 1, series: 'B', n: 7 }], (d) => d.series === 'A' ? 0 : 1, (d) => d.n);
  assert.deepEqual(out.map((d) => [d.y1, d.y2]), [[0, 5], [5, 12]]);
});

test('passengerBands gives each airline its passengers and the rest of the market as one more band, stacked in series order', () => {
  const rows = [
    { year: 1990, airline_id: 'A', airline_name: 'Alpha Airlines Inc.', share: 0.1, passengers: 10, total: 100 },
    { year: 1990, airline_id: 'B', airline_name: 'Beta Air Lines Inc.', share: 0.3, passengers: 30, total: '100' },
    { year: 2025, airline_id: 'B', airline_name: 'Beta Air Lines Inc.', share: 0.5, passengers: 60, total: 120 },
  ];
  const out = passengerBands(rows, ['Beta', 'Alpha']);
  assert.deepEqual(out.map((d) => [d.year, d.series, d.passengers, d.y1, d.y2]), [
    [1990, 'Beta', 30, 0, 30], [1990, 'Alpha', 10, 30, 40], [1990, OTHER_AIRLINES, 60, 40, 100],
    [2025, 'Beta', 60, 0, 60], [2025, OTHER_AIRLINES, 60, 60, 120],
  ]);
});

test('airlineColours gives each big airline its livery colour, and others a fallback in turn', () => {
  assert.deepEqual(airlineColours(['Southwest', 'American', 'Delta', 'United']), ['#D99A00', '#7A8A96', '#C8102E', '#1F5FD1']);
  const [a, b] = airlineColours(['Alaska', 'JetBlue']);
  assert.ok(a && b && a !== b);
});
