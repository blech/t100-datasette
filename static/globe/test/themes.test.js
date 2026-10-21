import test from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, DEFAULT_THEME, THEME_ORDER, resolveTheme, themeChoice } from '../src/themes.js';

test('two themes, light and dark, with the fields the renderer needs', () => {
  assert.deepEqual(THEME_ORDER, ['light', 'dark']);
  for (const id of THEME_ORDER) {
    const t = THEMES[id];
    assert.equal(t.id, id);
    for (const k of ['label', 'bg', 'ocean', 'land', 'coast', 'dot']) assert.ok(t[k], `${id}.${k}`);
    assert.ok(t.settledAlpha > 0 && t.settledAlpha < 1);
    assert.ok(t.activeAlpha > t.settledAlpha && t.activeAlpha <= 1);
    for (const k of ['fg', 'muted', 'panel', 'accent']) assert.ok(t.ui[k], `${id}.ui.${k}`);
  }
  assert.equal(THEMES.light.dark, false);
  assert.equal(THEMES.dark.dark, true);
  assert.equal(DEFAULT_THEME, 'light');
});

test('resolveTheme precedence: query, stored, then the system', () => {
  assert.equal(resolveTheme('?theme=dark', 'light'), 'dark');
  assert.equal(resolveTheme('', 'dark'), 'dark');
  assert.equal(resolveTheme('', null), 'light');
  assert.equal(resolveTheme('?x=1', undefined, true), 'dark');
  assert.equal(resolveTheme('?theme=light', null, true), 'light');
  assert.equal(resolveTheme('', 'light', true), 'light');
});

test('resolveTheme ignores unknown, hostile and retired values', () => {
  for (const bad of ['constructor', '__proto__', 'toString', 'DARK', '', 'nope', 'paper', 'night', 'natural', 'airtrailLight', 'airtrailDark']) {
    assert.equal(resolveTheme(`?theme=${bad}`, null), 'light', bad);
    assert.equal(resolveTheme('', bad, true), 'dark', bad);
  }
  assert.equal(resolveTheme('?theme=nope', 'dark'), 'dark');
});

test('themeChoice is an explicit theme from the query or storage, or auto', () => {
  assert.equal(themeChoice('?theme=dark', null), 'dark');
  assert.equal(themeChoice('', 'light'), 'light');
  assert.equal(themeChoice('?theme=night', 'paper'), 'auto');
  assert.equal(themeChoice('', null), 'auto');
});

test('the accent is the palette\'s', async () => {
  const { palette } = await import('../../common/palette.js');
  assert.equal(THEMES.light.ui.accent, palette(false).accent);
  assert.equal(THEMES.dark.ui.accent, palette(true).accent);
});
