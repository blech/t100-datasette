import test from 'node:test';
import assert from 'node:assert/strict';
import { parseState, toSearch } from '../src/state.js';

const DEFAULTS = { year: null, compare: null, month: null, proj: 'globe', width: 'passengers', colour: null, hide: [] };

test('defaults', () => {
  assert.deepEqual(parseState(''), DEFAULTS);
});
test('parses valid values', () => {
  assert.deepEqual(parseState('?year=2019&month=3&proj=flat&width=freight'), { ...DEFAULTS, year: 2019, month: 3, proj: 'flat', width: 'freight' });
  assert.deepEqual(parseState('?year=2024&compare=2019&colour=service&hide=dropped'), { ...DEFAULTS, year: 2024, compare: 2019, colour: 'service', hide: ['dropped'] });
});
test('rejects out-of-range and garbage', () => {
  assert.deepEqual(parseState('?year=abc&compare=1850&month=13&proj=cube&width=<b>&colour=x&hide=x'), DEFAULTS);
  assert.equal(parseState('?year=1850').year, null);
  assert.equal(parseState('?month=0').month, null);
});
test('round trips and omits defaults', () => {
  assert.equal(toSearch(DEFAULTS), '');
  assert.equal(toSearch({ ...DEFAULTS, year: 2019, proj: 'flat', width: 'deps' }), '?year=2019&proj=flat&width=deps');
  const full = { ...DEFAULTS, year: 2024, compare: 2019, proj: 'flat', width: 'freight', colour: 'change', hide: ['domestic', 'dropped'] };
  assert.deepEqual(parseState(toSearch(full)), full);
});
test('extra params are preserved', () => {
  assert.equal(toSearch({ ...DEFAULTS, year: 2019 }, { theme: 'dark' }), '?year=2019&theme=dark');
});
test('the old service filter becomes a hidden service and is not written back', () => {
  assert.deepEqual(parseState('?service=domestic').hide, ['international']);
  assert.deepEqual(parseState('?service=both').hide, []);
  assert.equal(toSearch(parseState('?year=2019&service=domestic')), '?year=2019&hide=international');
});
