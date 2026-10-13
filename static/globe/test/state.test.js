import test from 'node:test';
import assert from 'node:assert/strict';
import { parseState, toSearch } from '../src/state.js';

test('defaults', () => {
  assert.deepEqual(parseState(''), { year: null, month: null, proj: 'globe' });
});
test('parses valid values', () => {
  assert.deepEqual(parseState('?year=2019&month=3&proj=flat'), { year: 2019, month: 3, proj: 'flat' });
});
test('rejects out-of-range and garbage', () => {
  assert.deepEqual(parseState('?year=abc&month=13&proj=cube'), { year: null, month: null, proj: 'globe' });
  assert.equal(parseState('?year=1850').year, null);
  assert.equal(parseState('?month=0').month, null);
});
test('round trips and omits defaults', () => {
  assert.equal(toSearch({ year: null, month: null, proj: 'globe' }), '');
  assert.equal(toSearch({ year: 2019, month: null, proj: 'flat' }), '?year=2019&proj=flat');
  assert.deepEqual(parseState(toSearch({ year: 2019, month: 3, proj: 'flat' })), { year: 2019, month: 3, proj: 'flat' });
});
test('extra params are preserved', () => {
  assert.equal(toSearch({ year: 2019, month: null, proj: 'globe' }, { theme: 'night' }), '?year=2019&theme=night');
});
