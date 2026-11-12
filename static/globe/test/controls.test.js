import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trackValue, nearestHandle } from '../src/controls.js';

test('trackValue maps a press on the bar to a step, the ends 8px in', () => {
  // a 216px bar from x=100: the usable part is 108..308, ten steps of 20px
  assert.equal(trackValue(108, 100, 216, 0, 10), 0);
  assert.equal(trackValue(308, 100, 216, 0, 10), 10);
  assert.equal(trackValue(208, 100, 216, 0, 10), 5);
  assert.equal(trackValue(217, 100, 216, 0, 10), 5);
  assert.equal(trackValue(219, 100, 216, 0, 10), 6);
});

test('trackValue keeps presses past the ends in range', () => {
  assert.equal(trackValue(90, 100, 216, 0, 10), 0);
  assert.equal(trackValue(400, 100, 216, 0, 10), 10);
});

test('nearestHandle picks the closer handle, the first one on a tie', () => {
  assert.equal(nearestHandle([30, 10], 25), 0);
  assert.equal(nearestHandle([30, 10], 12), 1);
  assert.equal(nearestHandle([30, 10], 20), 0);
  assert.equal(nearestHandle([30, 30], 5), 0);
  assert.equal(nearestHandle([30], 5), 0);
});
