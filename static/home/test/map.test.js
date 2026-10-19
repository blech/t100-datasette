import { test } from 'node:test';
import assert from 'node:assert/strict';
import { radiusFor, placeOnMap, hitTest } from '../src/map.js';

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
