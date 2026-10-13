import test from 'node:test';
import assert from 'node:assert/strict';
import { parseState, toSearch } from '../src/state.js';

test('defaults', () => {
  assert.deepEqual(parseState(''), { year: null, month: null, proj: 'globe', width: 'passengers', service: 'all' });
});
test('parses valid values', () => {
  assert.deepEqual(parseState('?year=2019&month=3&proj=flat&width=freight'), { year: 2019, month: 3, proj: 'flat', width: 'freight', service: 'all' });
});
test('rejects out-of-range and garbage', () => {
  assert.deepEqual(parseState('?year=abc&month=13&proj=cube&width=<b>&service=x'), { year: null, month: null, proj: 'globe', width: 'passengers', service: 'all' });
  assert.equal(parseState('?year=1850').year, null);
  assert.equal(parseState('?month=0').month, null);
});
test('round trips and omits defaults', () => {
  assert.equal(toSearch({ year: null, month: null, proj: 'globe', width: 'passengers', service: 'all' }), '');
  assert.equal(toSearch({ year: 2019, month: null, proj: 'flat', width: 'deps', service: 'all' }), '?year=2019&proj=flat&width=deps');
  assert.deepEqual(parseState(toSearch({ year: 2019, month: 3, proj: 'flat', width: 'freight', service: 'all' })), { year: 2019, month: 3, proj: 'flat', width: 'freight', service: 'all' });
});
test('extra params are preserved', () => {
  assert.equal(toSearch({ year: 2019, month: null, proj: 'globe', width: 'passengers', service: 'all' }, { theme: 'night' }), '?year=2019&theme=night');
});
test('service filter parses, rejects junk, and is omitted when all', () => {
  assert.equal(parseState('?service=domestic').service, 'domestic');
  assert.equal(parseState('?service=international').service, 'international');
  assert.equal(parseState('?service=both').service, 'all');
  assert.equal(toSearch({ year: 2019, month: null, proj: 'globe', width: 'passengers', service: 'domestic' }), '?year=2019&service=domestic');
});
