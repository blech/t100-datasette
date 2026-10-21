import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSpan, yearDomain, SPAN_OPTIONS } from '../src/span.js';

test('"flown" keeps just the years given, sorted and without repeats', () => {
  assert.deepEqual(yearDomain([2004, 1999, 2004, 2001], { span: 'flown', min: 1990, max: 2025 }), [1999, 2001, 2004]);
  assert.deepEqual(yearDomain([], { span: 'flown', min: 1990, max: 2025 }), []);
});

test('"all" runs from the first year to the last, whatever years were given', () => {
  const all = yearDomain([1999, 2004], { span: 'all', min: 1990, max: 2025 });
  assert.equal(all.length, 36);
  assert.deepEqual([all[0], all.at(-1)], [1990, 2025]);
  assert.ok(all.includes(1999) && all.includes(2004));
});

test('"all" still shows a year outside the range rather than dropping data', () => {
  assert.deepEqual(yearDomain([1988, 2030], { span: 'all', min: 1990, max: 1992 }), [1988, 1990, 1991, 1992, 2030]);
});

test('"all" with no usable range falls back to the years given', () => {
  assert.deepEqual(yearDomain([2001, 2003], { span: 'all', min: NaN, max: undefined }), [2001, 2003]);
});

test('parseSpan accepts only the two spans and defaults to years flown', () => {
  assert.equal(parseSpan('all'), 'all');
  assert.equal(parseSpan('flown'), 'flown');
  assert.equal(parseSpan('junk'), 'flown');
  assert.equal(parseSpan(null), 'flown');
  assert.deepEqual(Object.keys(SPAN_OPTIONS), ['flown', 'all']);
});
