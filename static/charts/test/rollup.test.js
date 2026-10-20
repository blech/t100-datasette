import test from 'node:test';
import assert from 'node:assert/strict';
import { rollupRows, buildEngineShares, ENGINE_BANDS } from '../src/rollup.js';
import { buildHeatmap } from '../src/heatmap.js';

const f = (year, family, deps, extra = {}) => ({ year, family, deps, seats: deps * 100, passengers: deps * 80, freight: 0, service: 'domestic', kind: 'passenger', ...extra });

test('rollupRows names the row after the chosen field and drops the other kind of flight', () => {
  const rows = [f(2019, 'Boeing 737', 5), f(2019, 'Boeing 747', 1, { kind: 'freight' })];
  const out = rollupRows(rows, { key: 'family', kind: 'passenger' });
  assert.deepEqual(out.map((r) => r.dest), ['Boeing 737']);
  assert.equal(rollupRows(rows, { key: 'family', kind: 'all' }).length, 2);
});

test('rolled-up rows feed the heat map, merging passenger and freight rows of a family', () => {
  const rows = [f(2019, 'A', 5), f(2019, 'A', 3, { kind: 'freight' }), f(2019, 'B', 1)];
  const res = buildHeatmap(rollupRows(rows, { key: 'family', kind: 'all' }), { measure: 'deps', n: 5 });
  assert.deepEqual(res.dests, ['A', 'B']);
  assert.equal(res.cells.find((c) => c.dest === 'A').value, 8);
});

const e = (year, aircraft_group, distance_band, deps, extra = {}) => ({ year, aircraft_group, distance_band, deps, seats: 0, passengers: deps * 10, freight: deps * 1000, service: 'international', kind: 'passenger', ...extra });

test('engine shares are of each year, summed over the chosen distance band', () => {
  const rows = [e(1990, '6', 3000, 1), e(1990, '8', 3000, 3), e(1990, '8', 5000, 4), e(1990, '6', 0, 100)];
  const res = buildEngineShares(rows, { measure: 'deps', kind: 'passenger', band: '3000' });
  const share = (s) => res.points.find((p) => p.year === 1990 && p.series === s).share;
  assert.equal(share('Twin jet'), 1 / 8);
  assert.equal(share('Quad jet'), 7 / 8);
});

test('a band of "all" counts every distance, and freight uses the freight measure', () => {
  const rows = [e(2000, '6', 0, 1, { kind: 'freight' }), e(2000, '8', 3000, 1, { kind: 'freight' }), e(2000, '6', 0, 50)];
  const res = buildEngineShares(rows, { measure: 'freight', kind: 'freight', band: 'all' });
  assert.deepEqual(res.points.map((p) => [p.series, p.share]), [['Twin jet', 0.5], ['Quad jet', 0.5]]);
});

test('piston, helicopter and unlisted groups share one series; series come in a fixed order', () => {
  const rows = [e(2000, '0', 0, 1), e(2000, '3', 0, 1), e(2000, '4', 0, 1), e(2000, '5', 0, 1), e(2000, '8', 0, 1), e(2000, '6', 0, 1)];
  const res = buildEngineShares(rows, { measure: 'deps', kind: 'passenger', band: 'all' });
  assert.deepEqual(res.series, ['Twin jet', 'Quad jet', 'Turboprop', 'Piston and helicopter']);
  assert.equal(res.points.find((p) => p.series === 'Turboprop').amount, 2);
});

test('a year with nothing in the selection is left out', () => {
  const res = buildEngineShares([e(2000, '6', 0, 1), e(2001, '6', 0, 0)], { measure: 'deps', kind: 'passenger', band: 'all' });
  assert.deepEqual(res.years, [2000]);
});

test('the bands offered cover every distance once', () => {
  assert.deepEqual(ENGINE_BANDS.map((b) => b.value), ['all', '0', '500', '1500', '3000']);
});

test('every series has a colour', async () => {
  const { ENGINE_COLORS, ENGINE_SERIES } = await import('../src/rollup.js');
  assert.equal(ENGINE_COLORS.length, ENGINE_SERIES.length);
});

import { slugify, buildFamilySeries, hasVersions } from '../src/rollup.js';

test('slugs are lower-case words joined by hyphens', () => {
  assert.equal(slugify('DC-9 / MD-80 / MD-90'), 'dc-9-md-80-md-90');
  assert.equal(slugify('Boeing 737'), 'boeing-737');
  assert.equal(slugify('ATR 42/72'), 'atr-42-72');
});

const d = (year, subfamily, group_name, deps, extra = {}) => ({ year, subfamily, group_name, group_id: group_name, deps, seats: deps * 100, passengers: deps * 80, freight: deps * 4000, service: 'domestic', kind: 'passenger', ...extra });

test('a family is split by subfamily in the order the subfamilies first appear', () => {
  const rows = [d(2005, 'NG', 'A', 5), d(1995, 'Classic', 'A', 3), d(2015, 'MAX', 'A', 9), d(2015, 'NG', 'B', 1)];
  const res = buildFamilySeries(rows, { measure: 'deps', kind: 'passenger', split: 'subfamily' });
  assert.deepEqual(res.series, ['Classic', 'NG', 'MAX']);
  assert.equal(res.points.find((p) => p.year === 2015 && p.series === 'NG').value, 1);
  assert.deepEqual(res.years, [1995, 2005, 2015]);
});

test('airlines beyond the top n are folded into Other, listed last', () => {
  const rows = [d(2000, '', 'A', 9), d(2000, '', 'B', 5), d(2000, '', 'C', 2), d(2000, '', 'D', 1)];
  const res = buildFamilySeries(rows, { measure: 'deps', kind: 'passenger', split: 'airline', top: 2 });
  assert.deepEqual(res.series, ['A', 'B', 'Other']);
  assert.equal(res.points.find((p) => p.series === 'Other').value, 3);
});

test('values are the raw measure, with freight in short tons, and can be filtered by kind and service', () => {
  const rows = [d(2000, '', 'A', 2, { kind: 'freight' }), d(2000, '', 'A', 3, { service: 'international' })];
  assert.equal(buildFamilySeries(rows, { measure: 'freight', kind: 'all', split: 'airline' }).points[0].value, 5 * 4000 / 2000);
  assert.equal(buildFamilySeries(rows, { measure: 'deps', kind: 'passenger', split: 'airline' }).points[0].value, 3);
  assert.equal(buildFamilySeries(rows, { measure: 'deps', kind: 'all', service: 'domestic', split: 'airline' }).points[0].value, 2);
});

test('splitting by route type gives domestic and international, and an unsplit subfamily is named', () => {
  const rows = [d(2000, '', 'A', 2), d(2000, '', 'A', 3, { service: 'international' })];
  assert.deepEqual(buildFamilySeries(rows, { measure: 'deps', kind: 'all', split: 'service' }).series, ['Domestic', 'International']);
  assert.deepEqual(buildFamilySeries(rows, { measure: 'deps', kind: 'all', split: 'subfamily' }).series, ['All variants']);
});

test('years with nothing in the selection are left out', () => {
  const res = buildFamilySeries([d(2000, '', 'A', 2), d(2001, '', 'A', 0)], { measure: 'deps', kind: 'all', split: 'airline' });
  assert.deepEqual(res.years, [2000]);
});

test('hasVersions is true only when a family has more than one named version', () => {
  assert.equal(hasVersions([{ subfamily: 'A340' }, { subfamily: 'A340' }]), false);
  assert.equal(hasVersions([{ subfamily: '' }, { subfamily: null }]), false);
  assert.equal(hasVersions([{ subfamily: '747-400' }, { subfamily: '747-8' }]), true);
  assert.equal(hasVersions([]), false);
});
