import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { PALETTE, palette, seriesColours } from '../palette.js';

const HEX = /^#[0-9a-f]{6}$/i;
const ROLES = ['series', 'other', 'service', 'kind', 'single', 'engines', 'change', 'accent'];
const flat = (v) => (typeof v === 'string' ? [v] : Array.isArray(v) ? v : Object.values(v));

test('both themes have every role, all as hex colours', () => {
  for (const t of ['light', 'dark']) {
    assert.deepEqual(Object.keys(PALETTE[t]).sort(), [...ROLES].sort(), t);
    for (const role of ROLES) for (const c of flat(PALETTE[t][role])) assert.match(c, HEX, `${t}.${role}`);
  }
  assert.equal(PALETTE.light.series.length, 8);
  assert.equal(PALETTE.dark.series.length, 8);
  assert.equal(PALETTE.light.engines.length, 5);
});

test('the values the spec fixes', () => {
  assert.equal(PALETTE.light.series[0], '#7f1d1d');
  assert.equal(PALETTE.dark.series[0], '#c53a2a');
  assert.deepEqual(PALETTE.light.service, { domestic: '#0d9488', international: '#e36d2a' });
  assert.deepEqual(PALETTE.dark.change, PALETTE.light.change);
  assert.equal(palette(true), PALETTE.dark);
  assert.equal(palette(false), PALETTE.light);
});

test('seriesColours gives Ember steps in order and Other its grey', () => {
  const { domain, range } = seriesColours(['Delta', 'JetBlue', 'Other'], false);
  assert.deepEqual(domain, ['Delta', 'JetBlue', 'Other']);
  assert.deepEqual(range, [PALETTE.light.series[0], PALETTE.light.series[1], PALETTE.light.other]);
  assert.equal(seriesColours(['A'], true).range[0], PALETTE.dark.series[0]);
});

test('more than eight series reuse the last step rather than running out', () => {
  const names = Array.from({ length: 10 }, (_, i) => `S${i}`);
  const { range } = seriesColours([...names, 'Other'], false);
  assert.equal(range.length, 11);
  assert.ok(range.every((c) => HEX.test(c)));
  assert.equal(range[9], PALETTE.light.series[7]);
  assert.equal(range[10], PALETTE.light.other);
});

test('no page hard-codes a data colour or a Plot scheme outside the palette', () => {
  const root = new URL('../../', import.meta.url);
  const allowed = new Set(['common/palette.js', 'globe/src/themes.js', 'home/src/airlines.js']);
  const offenders = [];
  for (const f of readdirSync(root, { recursive: true })) {
    if (!f.endsWith('.js') || /(^|\/)(vendor|test)\//.test(f) || allowed.has(f)) continue;
    const src = readFileSync(new URL(f, root), 'utf8').replace(/scheme: 'YlOrRd'/g, '');
    if (/#[0-9a-fA-F]{6}\b|scheme: '/.test(src)) offenders.push(f);
  }
  assert.deepEqual(offenders, []);
});
