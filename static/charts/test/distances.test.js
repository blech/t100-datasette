import test from 'node:test';
import assert from 'node:assert/strict';
import { isSuspect, profile, measuresOffered, summaryText } from '../src/distances.js';

const CHECK = { ratio: 0.1, miles: 50 };
const r = (distance, passengers, extra = {}) =>
  ({ dest: 'X', year: 2025, distance, gc_distance: distance, deps: passengers / 10, passengers, freight: 0, ...extra });
const opts = (extra = {}) => ({ measure: 'passengers', bin: 250, max: 1000, ...CHECK, ...extra });

test('isSuspect: over 10% and over 50 miles, and never without both distances', () => {
  const cases = [[320, 4138, true], [39, 44, false], [1100, 1000, false], [1101, 1000, true],
    [560, 500, true], [550, 500, false], [100, null, false], [null, 100, false]];
  for (const [d, gc, want] of cases) assert.equal(isSuspect(d, gc, CHECK), want, `${d} against ${gc}`);
});

test('profile of no rows, or of rows with nothing in the measure, is empty', () => {
  assert.deepEqual(profile([], opts()), { empty: true });
  assert.deepEqual(profile([r(100, 0)], opts()), { empty: true });
});

test('profile bins kept rows across the whole axis, with shares and the weighted median', () => {
  const p = profile([r(100, 10), r(300, 30), r(300, 20, { gc_distance: null })], opts());
  assert.equal(p.empty, false);
  assert.deepEqual(p.bins.map((b) => [b.from, b.to, b.value]), [[0, 250, 10], [250, 500, 50], [500, 750, 0], [750, 1000, 0]]);
  assert.equal(p.total, 60);
  assert.equal(p.bins[1].share, 50 / 60);
  assert.equal(p.median, 300);
  assert.deepEqual(p.unchecked, { pairs: 1 });
  assert.deepEqual(p.dropped, { pairs: 0, value: 0 });
});

test('profile drops suspect distances and counts them', () => {
  const p = profile([r(100, 10), r(320, 7, { gc_distance: 4138 })], opts());
  assert.equal(p.total, 10);
  assert.deepEqual(p.dropped, { pairs: 1, value: 7 });
});

test('profile leaves out rows with no distance and counts them', () => {
  const p = profile([r(100, 10), r(null, 4, { gc_distance: null })], opts());
  assert.equal(p.total, 10);
  assert.deepEqual(p.noDistance, { pairs: 1, value: 4 });
});

test('profile puts an unchecked distance beyond the axis in the last bin, and says so', () => {
  const p = profile([r(100, 10), r(12000, 5, { gc_distance: null })], opts({ max: 10250 }));
  assert.equal(p.bins.length, 41);
  assert.equal(p.bins.at(-1).from, 10000);
  assert.equal(p.bins.at(-1).value, 5);
  assert.deepEqual(p.beyondAxis, { pairs: 1 });
});

test('profile sums the measure asked for', () => {
  const p = profile([r(100, 10, { deps: 3 }), r(300, 30, { deps: 4 })], opts({ measure: 'deps' }));
  assert.equal(p.total, 7);
  assert.equal(p.median, 300);
});

test('measuresOffered offers freight only where there is some', () => {
  assert.deepEqual(measuresOffered([r(100, 10)]), ['passengers', 'deps']);
  assert.deepEqual(measuresOffered([r(100, 10, { freight: 50000 })]), ['passengers', 'deps', 'freight']);
});

test('summaryText says where half the measure falls', () => {
  assert.equal(summaryText('ATL', 2025, 'passengers', 640), "Half of ATL's passengers in 2025 flew segments of 640 miles or less.");
  assert.equal(summaryText('JFK', 2025, 'deps', 2475), "Half of JFK's flight segments in 2025 were 2,475 miles or less.");
  assert.equal(summaryText('MEM', 2025, 'freight', 812), "Half of MEM's freight in 2025 went on segments of 812 miles or less.");
});

test('profile ignores rows with nothing in the measure, so the small print only counts pairs that matter to it', () => {
  const p = profile([r(100, 10), r(null, 0, { gc_distance: null }), r(320, 0, { gc_distance: 4138 }), r(300, 0, { gc_distance: null })], opts());
  assert.deepEqual(p.noDistance, { pairs: 0, value: 0 });
  assert.deepEqual(p.dropped, { pairs: 0, value: 0 });
  assert.deepEqual(p.unchecked, { pairs: 0 });
});
