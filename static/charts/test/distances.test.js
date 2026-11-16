import test from 'node:test';
import assert from 'node:assert/strict';
import { isSuspect, profile, measuresOffered, summaryText, noteText, barLayout } from '../src/distances.js';

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

test('profile with no axis (the distances not loaded) is unavailable, not one bar', () => {
  assert.deepEqual(profile([r(100, 10)], opts({ max: 0 })), { empty: true, unavailable: true });
});

test('profile: a distance exactly at the end of the axis is on it, not beyond it', () => {
  const p = profile([r(1000, 10)], opts());
  assert.equal(p.bins.at(-1).value, 10);
  assert.deepEqual(p.beyondAxis, { pairs: 0 });
});

test('profile leaves out loops (the same airport at both ends), which have no distance to chart or mention', () => {
  const p = profile([r(100, 10), r(null, 5, { dest: 'ATL', gc_distance: null })], { ...opts(), origin: 'ATL' });
  assert.deepEqual(p.noDistance, { pairs: 0, value: 0 });
});

test('noteText says what was left out, and nothing for an empty profile', () => {
  assert.equal(noteText({ empty: true }, 'passengers'), '');
  const p = profile([r(100, 10), r(320, 7, { gc_distance: 4138 }), r(300, 2, { gc_distance: null })], opts());
  assert.equal(noteText(p, 'passengers'),
    " 1 airport pair whose BTS distance disagreed with it (7 passengers) is left out; 1 airport pair couldn't be checked, as an airport has no coordinates, and is shown as BTS gives it.");
});

test('profile lists each bar\'s biggest destinations in the measure, the top five and how many more', () => {
  const rows = ['AAA', 'BBB', 'CCC', 'DDD', 'EEE', 'FFF', 'GGG'].map((dest, i) => r(300, 10 * (i + 1), { dest }));
  const p = profile([...rows, r(100, 4, { dest: 'HHH' })], opts());
  assert.deepEqual(p.bins[1].top, [{ dest: 'GGG', value: 70 }, { dest: 'FFF', value: 60 }, { dest: 'EEE', value: 50 }, { dest: 'DDD', value: 40 }, { dest: 'CCC', value: 30 }]);
  assert.equal(p.bins[1].more, 2);
  assert.deepEqual(p.bins[0].top, [{ dest: 'HHH', value: 4 }]);
  assert.equal(p.bins[0].more, 0);
  assert.deepEqual(p.bins[2].top, []);
});

test('barLayout fits whole bars of the given pixels into the plot, the rest going to the right margin', () => {
  assert.deepEqual(barLayout(838, { marginLeft: 64, marginRight: 20, pixels: 1 }), { count: 754, marginRight: 20 });
  assert.deepEqual(barLayout(838, { marginLeft: 64, marginRight: 20, pixels: 20 }), { count: 37, marginRight: 34 });
  assert.deepEqual(barLayout(1100, { marginLeft: 64, marginRight: 20, pixels: 20 }), { count: 50, marginRight: 36 });
  assert.deepEqual(barLayout(60, { marginLeft: 64, marginRight: 20, pixels: 20 }), { count: 1, marginRight: -24 });
});

test('barLayout rounds a fractional width down, so the plot is a whole number of pixels', () => {
  const { count, marginRight } = barLayout(838.6, { marginLeft: 64, marginRight: 20, pixels: 1 });
  assert.equal(count, 754);
  assert.equal(838 - 64 - marginRight, count);
});

test('profile with a count of bins splits the axis evenly, the last ending at the axis exactly', () => {
  const p = profile([r(0, 1), r(4073, 2), r(10250, 3)], { ...opts(), bin: undefined, count: 754, max: 10250 });
  assert.equal(p.bins.length, 754);
  assert.equal(p.bins.at(-1).to, 10250);
  assert.ok(Math.abs(p.bins[1].from - 10250 / 754) < 1e-9);
  assert.equal(p.bins[0].value, 1);
  assert.equal(p.bins.at(-1).value, 3);
  assert.equal(p.bins[Math.floor(4073 * 754 / 10250)].value, 2);
  assert.deepEqual(p.beyondAxis, { pairs: 0 });
});

test('profile with a count: a distance on a bin edge goes in the bin it starts, with no float slip', () => {
  const p = profile([r(250, 1), r(500, 1)], { ...opts(), bin: undefined, count: 4, max: 1000 });
  assert.deepEqual(p.bins.map((b) => b.value), [0, 1, 1, 0]);
  const q = profile([r(300, 1)], { ...opts(), bin: undefined, count: 10, max: 1000 });
  assert.equal(q.bins[3].value, 1);
});

test('summaryText without an airport speaks of all the year\'s segments', () => {
  assert.equal(summaryText(null, 2025, 'passengers', 900), 'Half of all passengers in 2025 flew segments of 900 miles or less.');
  assert.equal(summaryText(null, 2025, 'deps', 512), 'Half of all flight segments in 2025 were 512 miles or less.');
  assert.equal(summaryText(null, 2025, 'freight', 3100), 'Half of all freight in 2025 went on segments of 3,100 miles or less.');
});
