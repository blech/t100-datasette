import test from 'node:test';
import assert from 'node:assert/strict';
import { seriesByFill } from '../highlight.js';

test('seriesByFill maps each colour to the series drawn in it', () => {
  const lookup = seriesByFill({ domain: ['737 NG', '737 MAX', 'Other'], range: ['#7f1d1d', '#9e261f', '#a1a1aa'] });
  assert.equal(lookup('#7f1d1d'), '737 NG');
  assert.equal(lookup('#A1A1AA'), 'Other', 'case does not matter');
  assert.equal(lookup('rgb(158, 38, 31)'), '737 MAX', 'a computed rgb() colour works too');
  assert.equal(lookup('#000000'), null);
  assert.equal(lookup(null), null);
});

test('series sharing the last step highlight together, as the first of them', () => {
  const lookup = seriesByFill({ domain: ['A', 'B', 'C'], range: ['#111111', '#222222', '#222222'] });
  assert.equal(lookup('#222222'), 'B');
});
