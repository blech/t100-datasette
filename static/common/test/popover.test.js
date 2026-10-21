import test from 'node:test';
import assert from 'node:assert/strict';
import { periodRows, tapAction } from '../popover.js';

const pts = [
  { year: 2019, series: 'Delta', value: 430000 },
  { year: 2019, series: 'JetBlue', value: 87800 },
  { year: 2019, series: 'Other', value: 964 },
  { year: 2020, series: 'Delta', value: 168000 },
];
const fmt = (v) => String(v);

test('periodRows groups by period and lists the top of the stack first', () => {
  const out = periodRows(pts, { key: (p) => p.year, order: ['Delta', 'JetBlue', 'Other'], format: fmt });
  assert.deepEqual(out.map((d) => d.period), [2019, 2020]);
  assert.deepEqual(out[0].rows, [{ label: 'Other', value: '964' }, { label: 'JetBlue', value: '87800' }, { label: 'Delta', value: '430000' }]);
  assert.equal(out[0].top, 430000 + 87800 + 964);
  assert.deepEqual(out[1].rows, [{ label: 'Delta', value: '168000' }], 'a series missing that year is left out');
});

test('a series not in the order goes on top', () => {
  const out = periodRows(pts, { key: (p) => p.year, order: ['Delta', 'JetBlue'], format: fmt });
  assert.equal(out[0].rows[0].label, 'Other');
});

test('without an order the rows are highest first, and top is the highest (lines, not a stack)', () => {
  const lines = [{ m: 3, series: 'A', value: 71.2 }, { m: 3, series: 'B', value: 88.4 }];
  const [d] = periodRows(lines, { key: (p) => p.m, format: (v) => `${v}%` });
  assert.deepEqual(d.rows.map((r) => r.label), ['B', 'A']);
  assert.equal(d.top, 88.4);
});

test('value, extra and top can be supplied', () => {
  const shares = [{ year: 1990, series: 'Twin jet', share: 0.25, amount: 1000 }, { year: 1990, series: 'Quad jet', share: 0.75, amount: 3000 }];
  const [d] = periodRows(shares, {
    key: (p) => p.year, order: ['Twin jet', 'Quad jet'], value: (p) => p.share,
    format: (v) => `${v * 100}%`, extra: (p) => `${p.amount}`, top: () => 1,
  });
  assert.deepEqual(d.rows, [{ label: 'Quad jet', value: '75%', extra: '3000' }, { label: 'Twin jet', value: '25%', extra: '1000' }]);
  assert.equal(d.top, 1);
});

test('tapAction: a new target shows, the same one follows its link, nothing hides', () => {
  assert.equal(tapAction(null, '2019', true), 'show');
  assert.equal(tapAction('2018', '2019', true), 'show');
  assert.equal(tapAction('2019', '2019', true), 'follow');
  assert.equal(tapAction('2019', '2019', false), 'show');
  assert.equal(tapAction('2019', null, true), 'hide');
});
