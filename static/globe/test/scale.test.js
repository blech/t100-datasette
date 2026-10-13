import test from 'node:test';
import assert from 'node:assert/strict';
import { colourFor, widthFor, maxOf, SERVICE_COLOURS } from '../src/scale.js';

test('colours', () => {
  assert.equal(colourFor('domestic'), '#2a9df4');
  assert.equal(colourFor('international'), '#ff5a00');
  assert.equal(colourFor('weird'), SERVICE_COLOURS.international);
});
test('widthFor is bounded and never NaN', () => {
  assert.equal(widthFor(0, 100), 0.6);
  assert.equal(widthFor(100, 100), 4.5);
  assert.equal(widthFor(1000, 100), 4.5);
  for (const bad of [NaN, undefined, null, -5]) assert.equal(widthFor(bad, 100), 0.6);
  assert.equal(widthFor(10, 0), 0.6);
  assert.ok(widthFor(25, 100) > 0.6 && widthFor(25, 100) < 4.5);
});
test('maxOf handles empty and zero', () => {
  assert.equal(maxOf([], 'passengers'), 0);
  assert.equal(maxOf([{ passengers: 3 }, { passengers: 9 }], 'passengers'), 9);
  assert.equal(maxOf([{ passengers: 0 }], 'passengers'), 0);
});

test('maxOf and widthFor work on freight values', () => {
  const routes = [{ freight: 5_000_000 }, { freight: 20_000_000 }, { freight: 0 }];
  assert.equal(maxOf(routes, 'freight'), 20_000_000);
  assert.ok(widthFor(20_000_000, 20_000_000) > widthFor(5_000_000, 20_000_000));
});
