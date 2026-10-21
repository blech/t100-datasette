import test from 'node:test';
import assert from 'node:assert/strict';
import { compareYears, countStatuses, changeText, moveHandle, moveRange, playStep } from '../src/compare.js';

const r = (dest, deps) => ({ dest, deps, passengers: deps * 80 });
const byDest = (x) => x.dest;

test('compareYears without a second year marks nothing', () => {
  const out = compareYears([r('LAX', 10)], null, byDest);
  assert.deepEqual(out.map((x) => [x.dest, x.status]), [['LAX', null]]);
});

test('compareYears marks kept, added and dropped, dropped last and with the old numbers', () => {
  const out = compareYears([r('LAX', 20), r('MEX', 7)], [r('LAX', 10), r('DEN', 30)], byDest);
  assert.deepEqual(out.map((x) => [x.dest, x.status, x.depsThen, x.depsNow]), [
    ['LAX', 'kept', 10, 20], ['MEX', 'added', 0, 7], ['DEN', 'dropped', 30, 0],
  ]);
  assert.equal(out[2].deps, 30);
  assert.equal(out[2].passengers, 2400);
});

test('compareYears copies routes rather than changing them', () => {
  const now = [r('LAX', 20)];
  compareYears(now, [], byDest);
  assert.equal(now[0].status, undefined);
});

test('countStatuses counts each status and ignores routes without one', () => {
  assert.deepEqual(countStatuses([{ status: 'kept' }, { status: 'kept' }, { status: 'dropped' }, { status: null }]), { kept: 2, added: 0, dropped: 1 });
});

test('changeText describes a change', () => {
  assert.equal(changeText({ status: 'dropped', depsThen: 1200 }, 2019), 'Dropped: 1,200 departures in 2019');
  assert.equal(changeText({ status: 'kept', depsThen: 10, depsNow: 1500 }, 2019), '10 → 1,500 departures');
  assert.equal(changeText({ status: 'added', depsThen: 0, depsNow: 52 }, 2019), '0 → 52 departures');
  assert.equal(changeText({ status: null }, 2019), '');
  assert.equal(changeText({ status: 'kept', depsThen: 12345, depsNow: 2345678 }, 2019), '12,300 → 2.35\u00a0million departures');
});

const years = [2019, 2020, 2021, 2022];

test('moveHandle: the solid handle moves the year shown and keeps the comparison behind it', () => {
  assert.deepEqual(moveHandle(years, { year: 2022, compare: null }, 'year', 1), { year: 2020, compare: null });
  assert.deepEqual(moveHandle(years, { year: 2022, compare: 2019 }, 'year', 2), { year: 2021, compare: 2019 });
});

test('moveHandle: the hollow handle sets the comparison', () => {
  assert.deepEqual(moveHandle(years, { year: 2022, compare: null }, 'compare', 0), { year: 2022, compare: 2019 });
  assert.deepEqual(moveHandle(years, { year: 2022, compare: 2019 }, 'compare', 3), { year: 2022, compare: null });
});

test('moveHandle: one handle pushed past the other carries it along, never leaving compare >= year', () => {
  assert.deepEqual(moveHandle(years, { year: 2021, compare: 2020 }, 'year', 0), { year: 2019, compare: null });
  assert.deepEqual(moveHandle(years, { year: 2020, compare: 2019 }, 'compare', 3), { year: 2022, compare: null });
  for (const which of ['year', 'compare']) {
    for (let i = 0; i < years.length; i++) {
      const s = moveHandle(years, { year: 2021, compare: 2020 }, which, i);
      assert.ok(s.compare === null || s.compare < s.year, `${which} ${i}`);
    }
  }
});

test('playStep moves the year on and keeps the comparison year, stopping at the end', () => {
  assert.deepEqual(playStep(years, 2020, 2019), { year: 2021, compare: 2019 });
  assert.deepEqual(playStep(years, 2019, null), { year: 2020, compare: null });
  assert.equal(playStep(years, 2022, 2019), null);
});

test('moveRange: in the month view the solid handle moves the year and keeps the months', () => {
  assert.deepEqual(moveRange(years, { year: 2020, compare: null, month: 3 }, 'year', 3), { year: 2022, compare: null, month: 3 });
  assert.deepEqual(moveRange(years, { year: 2022, compare: null, month: 3 }, 'year', 0), { year: 2019, compare: null, month: 3 });
});

test('moveRange: moving the hollow handle back leaves the month view for a comparison', () => {
  assert.deepEqual(moveRange(years, { year: 2022, compare: null, month: 3 }, 'compare', 0), { year: 2022, compare: 2019, month: null });
});

test('moveRange outside the month view is moveHandle', () => {
  assert.deepEqual(moveRange(years, { year: 2022, compare: 2019, month: null }, 'year', 2), { year: 2021, compare: 2019, month: null });
});
