import test from 'node:test';
import assert from 'node:assert/strict';
import { byYear, barHeight, scaleTop, readState, yearParams } from '../src/distanceyears.js';

const YEARS = [1995, 1996, 1997, 1998];

test('byYear groups rows by their year, as numbers', () => {
  const m = byYear([{ year: 1995, dest: 'A' }, { year: '1996', dest: 'B' }, { year: 1995, dest: 'C' }]);
  assert.deepEqual([...m.keys()], [1995, 1996]);
  assert.deepEqual(m.get(1995).map((r) => r.dest), ['A', 'C']);
});

test('barHeight is a percentage of the year, or the count (freight in short tons)', () => {
  const b = { value: 4000, share: 0.25 };
  assert.equal(barHeight(b, 'passengers', 'share'), 25);
  assert.equal(barHeight(b, 'passengers', 'count'), 4000);
  assert.equal(barHeight(b, 'freight', 'count'), 2);
  assert.equal(barHeight(b, 'freight', 'share'), 25);
});

test('scaleTop is the tallest bar over the profiles, skipping empty ones', () => {
  const p = (...values) => ({ empty: false, bins: values.map((v) => ({ value: v, share: v / 100 })) });
  assert.equal(scaleTop([p(10, 50), { empty: true }, p(70, 30)], 'passengers', 'count'), 70);
  assert.equal(scaleTop([p(10, 50), p(70, 30)], 'passengers', 'share'), 70);
  assert.equal(scaleTop([{ empty: true }], 'passengers', 'share'), 0);
  assert.equal(scaleTop([], 'deps', 'count'), 0);
});

test('readState takes a year among the years, else the latest', () => {
  assert.equal(readState('?year=1996', YEARS, 1998).year, 1996);
  for (const s of ['', '?year=1890', '?year=x', '?year=1996.5', '?year=']) assert.equal(readState(s, YEARS, 1998).year, 1998, s);
});

test('readState compares only with an earlier year among the years', () => {
  assert.equal(readState('?year=1997&compare=1995', YEARS, 1998).compare, 1995);
  assert.equal(readState('?year=1997&compare=1997', YEARS, 1998).compare, null);
  assert.equal(readState('?year=1996&compare=1998', YEARS, 1998).compare, null);
  assert.equal(readState('?compare=1890', YEARS, 1998).compare, null);
});

test('readState shares by default, counts on asking', () => {
  assert.equal(readState('', YEARS, 1998).scale, 'share');
  assert.equal(readState('?scale=count', YEARS, 1998).scale, 'count');
  assert.equal(readState('?scale=nonsense', YEARS, 1998).scale, 'share');
});

test('yearParams leaves out the defaults', () => {
  assert.deepEqual(yearParams({ year: 1998, compare: null, scale: 'share' }, 1998), {});
  assert.deepEqual(yearParams({ year: 1996, compare: 1995, scale: 'count' }, 1998), { year: '1996', compare: '1995', scale: 'count' });
});
