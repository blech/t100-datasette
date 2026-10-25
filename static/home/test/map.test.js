import { test } from 'node:test';
import assert from 'node:assert/strict';
import { radiusFor, placeOnMap, hitTest, mapColours, mix } from '../src/map.js';
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
