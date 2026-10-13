import test from 'node:test';
import assert from 'node:assert/strict';
import { parseState, toSearch } from '../src/state.js';

test('defaults', () => {
  assert.deepEqual(parseState(''), { year: null, month: null, proj: 'globe', width: 'passengers' });
});
test('parses valid values', () => {
  assert.deepEqual(parseState('?year=2019&month=3&proj=flat&width=freight'), { year: 2019, month: 3, proj: 'flat', width: 'freight' });
});
test('rejects out-of-range and garbage', () => {
  assert.deepEqual(parseState('?year=abc&month=13&proj=cube&width=<b>'), { year: null, month: null, proj: 'globe', width: 'passengers' });
  assert.equal(parseState('?year=1850').year, null);
  assert.equal(parseState('?month=0').month, null);
});
test('round trips and omits defaults', () => {
  assert.equal(toSearch({ year: null, month: null, proj: 'globe', width: 'passengers' }), '');
  assert.equal(toSearch({ year: 2019, month: null, proj: 'flat', width: 'deps' }), '?year=2019&proj=flat&width=deps');
  assert.deepEqual(parseState(toSearch({ year: 2019, month: 3, proj: 'flat', width: 'freight' })), { year: 2019, month: 3, proj: 'flat', width: 'freight' });
});
test('extra params are preserved', () => {
  assert.equal(toSearch({ year: 2019, month: null, proj: 'globe', width: 'passengers' }, { theme: 'night' }), '?year=2019&theme=night');
});
