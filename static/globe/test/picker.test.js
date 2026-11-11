import test from 'node:test';
import assert from 'node:assert/strict';
import { pickerOptions } from '../src/picker.js';

test('pickerOptions includes airports outside the US', () => {
  const opts = pickerOptions([
    { code: 'SFO', place: 'San Francisco, CA', name: 'San Francisco International', isUs: true },
    { code: 'KEF', place: 'Reykjavik, Iceland', name: 'Keflavik International', isUs: false },
  ]);
  assert.deepEqual(opts.map((o) => o.value), ['SFO', 'KEF']);
  assert.equal(opts[1].label, 'Reykjavik, Iceland – Keflavik International');
});

test('pickerOptions labels an airport with no name by its place alone', () => {
  assert.equal(pickerOptions([{ code: 'XYZ', place: 'Somewhere, AK', name: null }])[0].label, 'Somewhere, AK');
});
