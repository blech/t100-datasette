import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyRoutes, summariseRoutes, formatYearMonth } from '../src/airline.js';

const r = (origin, dest, deps_a, deps_b) => ({ origin, dest, deps_a, deps_b });

test('classifyRoutes sorts pairs into kept, dropped and added, ignoring token flying', () => {
  const out = classifyRoutes([r('SFO', 'DEN', 300, 0), r('SFO', 'LAX', 900, 800), r('SFO', 'PDX', 0, 200), r('SFO', 'ABC', 5, 3)], { min: 12 });
  assert.deepEqual(out.map((x) => x.status), ['dropped', 'kept', 'added']);
  assert.deepEqual(summariseRoutes(out), { kept: 1, dropped: 1, added: 1 });
});

test('a pair under the threshold in one year counts as not served that year', () => {
  assert.equal(classifyRoutes([r('A', 'B', 100, 11)], { min: 12 })[0].status, 'dropped');
});

test('formatYearMonth writes a month and year', () => {
  assert.equal(formatYearMonth(201902), 'Feb 2019');
  assert.equal(formatYearMonth(0), '');
});
