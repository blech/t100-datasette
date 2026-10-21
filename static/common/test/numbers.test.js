import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { formatCount, formatTons, exactCount, countLabel, millionsAxis, MILLIONS } from '../numbers.js';

const CASES = JSON.parse(readFileSync(new URL('../../../tests/fixtures/number_formats.json', import.meta.url), 'utf8'));

test('every shared case, in both forms', () => {
  for (const c of CASES) {
    assert.equal(formatCount(c.value, 'prose'), c.prose, `prose ${c.value}`);
    assert.equal(formatCount(c.value, 'dense'), c.dense, `dense ${c.value}`);
  }
});

test('dense is the default form, and countLabel is the prose form', () => {
  assert.equal(formatCount(51512883), `51.5${MILLIONS}`);
  assert.equal(countLabel(51512883), '51.5 million');
});

test('the space before million never breaks', () => {
  assert.ok(!/ /.test(formatCount(51512883)), 'no ordinary space in the dense form');
  assert.equal(MILLIONS, '\u00a0million');
});

test('missing values are a dash; numeric strings are numbers', () => {
  for (const v of [null, undefined, NaN, '', 'x']) {
    assert.equal(formatCount(v), '–');
    assert.equal(formatCount(v, 'prose'), '–');
    assert.equal(exactCount(v), '–');
    assert.equal(formatTons(v), '–');
  }
  assert.equal(formatCount('48210'), '48,200');
});

test('exactCount writes the whole number with separators', () => {
  assert.equal(exactCount(1106009313), '1,106,009,313');
  assert.equal(exactCount(0), '0');
  assert.equal(exactCount(12.6), '13');
});

test('formatTons converts pounds to short tons, then rounds', () => {
  assert.equal(formatTons(0), '0 tons');
  assert.equal(formatTons(4000), '2 tons');
  assert.equal(formatTons(300), '0.15 tons');
  assert.equal(formatTons(2_100_000_000), `1.05${MILLIONS} tons`);
  assert.equal(formatTons(2_100_000_000, 'prose'), '1.05 million tons');
});

test('millionsAxis switches to millions at a maximum of a million', () => {
  const big = millionsAxis(1_106_009_313, 'Passengers');
  assert.equal(big.label, 'Passengers (millions)');
  assert.equal(big.tickFormat(0), '0');
  assert.equal(big.tickFormat(250e6), '250');
  assert.equal(big.tickFormat(1e9), '1,000');
  assert.equal(big.tickFormat(2.5e6), '2.5');
  const edge = millionsAxis(1e6, 'Seats');
  assert.equal(edge.label, 'Seats (millions)');
  const small = millionsAxis(999_999, 'Departures');
  assert.equal(small.label, 'Departures');
  assert.equal(small.tickFormat(250000), '250,000');
  assert.equal(millionsAxis(0, 'Seats').label, 'Seats');
});

test('no page formats numbers on its own', () => {
  const root = new URL('../../', import.meta.url);
  const offenders = readdirSync(root, { recursive: true })
    .filter((f) => f.endsWith('.js') && !/(^|\/)(vendor|test)\//.test(f) && f !== 'common/numbers.js')
    .filter((f) => /toLocaleString\(|tickFormat: '~s'/.test(readFileSync(new URL(f, root), 'utf8')));
  assert.deepEqual(offenders, []);
});
