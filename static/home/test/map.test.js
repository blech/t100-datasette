import { test } from 'node:test';
import assert from 'node:assert/strict';
import { radiusFor, placeOnMap, hitTest, mapColours, mix, topDots, ordinal, rankPhrase, separateDots, layoutLabels } from '../src/map.js';
import { THEMES } from '../../globe/src/themes.js';

test('radiusFor grows with the square root of passengers between 2.5 and 12px', () => {
  assert.equal(radiusFor(100, 100), 12);
  assert.equal(radiusFor(25, 100), 2.5 + 9.5 * 0.5);
  assert.equal(radiusFor(0, 100), 2.5);
  assert.equal(radiusFor(50, 0), 2.5);
  assert.equal(radiusFor(null, 100), 2.5);
});

test('placeOnMap drops points the projection cannot place', () => {
  const proj = ([lon]) => (lon > 0 ? null : [-lon, 10]);
  const pts = [{ code: 'ATL', pos: [-84, 33], passengers: 100 }, { code: 'GUM', pos: [144, 13], passengers: 50 }];
  const { placed, dropped } = placeOnMap(pts, proj);
  assert.deepEqual(placed.map((p) => [p.code, p.x, p.y, p.r]), [['ATL', 84, 10, 12]]);
  assert.deepEqual(dropped, ['GUM']);
});

test('hitTest picks the smallest dot under the cursor, or -1', () => {
  const placed = [{ x: 0, y: 0, r: 12 }, { x: 5, y: 0, r: 3 }];
  assert.equal(hitTest(placed, 5, 1), 1);
  assert.equal(hitTest(placed, -8, 0), 0);
  assert.equal(hitTest(placed, 40, 40), -1);
});

// relative luminance of a #rrggbb colour
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test('mapColours makes land and borders stand out from the page in every theme', () => {
  for (const [id, t] of Object.entries(THEMES)) {
    const c = mapColours(t);
    assert.ok(contrast(c.land, t.bg) >= 1.15, `${id}: land ${c.land} on ${t.bg}`);
    assert.ok(contrast(c.border, c.land) >= 1.3, `${id}: borders ${c.border} on ${c.land}`);
  }
});

test('mix blends two hex colours', () => {
  assert.equal(mix('#ffffff', '#000000', 0.5), '#808080');
  assert.equal(mix('#1a1a1a', '#f4f2ee', 0), '#f4f2ee');
});

const pts = [
  { code: 'JFK', city: 'New York, NY', pos: [-73.8, 40.6], passengers: 300, marketId: '31703' },
  { code: 'ATL', city: 'Atlanta, GA', pos: [-84.4, 33.6], passengers: 250, marketId: '30397' },
  { code: 'LGA', city: 'New York, NY', pos: [-73.9, 40.8], passengers: 100, marketId: '31703' },
  { code: 'XXX', city: 'Nowhere, TX', pos: [-100, 30], passengers: 50, marketId: null },
];

test('topDots by airport keeps the busiest n as they are', () => {
  const d = topDots(pts, 'airport', 2);
  assert.deepEqual(d.map((p) => [p.code, p.label, p.airports]), [['JFK', 'JFK', ['JFK']], ['ATL', 'ATL', ['ATL']]]);
});

test('topDots by city adds a market up, weights its position by passengers and ranks the cities', () => {
  const d = topDots(pts, 'city', 2);
  assert.deepEqual(d.map((p) => [p.code, p.label, p.passengers, p.airports]), [['JFK', 'New York', 400, ['JFK', 'LGA']], ['ATL', 'Atlanta', 250, ['ATL']]]);
  assert.ok(Math.abs(d[0].pos[1] - (40.6 * 300 + 40.8 * 100) / 400) < 1e-9);
  assert.equal(topDots(pts, 'city').length, 3); // an airport without a market is a city of its own
});

test('rankPhrase says "busiest" for the first and an ordinal after, for a city or an airport', () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 50].map(ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '50th']);
  assert.equal(rankPhrase(1, 'city'), 'busiest city');
  assert.equal(rankPhrase(5, 'city'), '5th busiest city');
  assert.equal(rankPhrase(22, 'airport'), '22nd busiest airport');
});

test('separateDots pushes overlapping dots just apart, the bigger moving less, and leaves clear ones alone', () => {
  const dots = [{ x: 0, y: 0, r: 10 }, { x: 5, y: 0, r: 2 }, { x: 100, y: 100, r: 5 }];
  separateDots(dots);
  assert.ok(Math.hypot(dots[1].x - dots[0].x, dots[1].y - dots[0].y) >= 12 - 1e-6);
  assert.ok(Math.abs(dots[0].x) < Math.abs(dots[1].x - 5)); // the big one moved less
  assert.deepEqual([dots[2].x, dots[2].y], [100, 100]);
});

test('layoutLabels takes a clear spot beside its dot, labelling each dot on its right when that is clear', () => {
  const placed = [{ x: 50, y: 50, r: 5 }, { x: 90, y: 50, r: 5 }];
  const out = layoutLabels(placed, [{ index: 0, width: 20 }, { index: 1, width: 20 }]);
  assert.deepEqual(out.get(0).slice(0, 2), [58, 44.5]); // right of its dot
  assert.equal(out.get(1)[0], 98); // the second dot's own right-hand spot is clear
});

test('a dot links to its airport, or in cities mode to its city page (or its busiest airport without a market)', () => {
  assert.equal(topDots(pts, 'airport', 1)[0].href, '/airports/JFK');
  const d = topDots(pts, 'city');
  assert.deepEqual(d.map((p) => p.href), ['/airports/cities/31703', '/airports/cities/30397', '/airports/XXX']);
});
