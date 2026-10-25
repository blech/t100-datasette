import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { THEMES } from '../../globe/src/themes.js';

const css = readFileSync(new URL('../base.css', import.meta.url), 'utf8');
const tokens = (block) => Object.fromEntries([...block.matchAll(/--([a-z]+)\s*:\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()]));
const light = tokens(css.match(/^:root\s*\{([^}]*)\}/m)[1]);
const dark = tokens(css.match(/prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([^}]*)\}/)[1]);
const norm = (v) => v.replace(/\s+/g, '').replace(/0\./g, '.').toLowerCase();

test('the CSS fallbacks are the theme script\'s colours', () => {
  for (const [name, values] of [['light', light], ['dark', dark]]) {
    const t = THEMES[name];
    assert.equal(values.bg, t.bg, `${name} --bg`);
    assert.equal(values.fg, t.ui.fg, `${name} --fg`);
    assert.equal(values.muted, t.ui.muted, `${name} --muted`);
    assert.equal(norm(values.panel), norm(t.ui.panel), `${name} --panel`);
    assert.equal(values.accent, t.ui.accent, `${name} --accent`);
  }
});

test('both themes define every token', () => {
  const all = ['bg', 'fg', 'muted', 'line', 'rule', 'panel', 'accent'];
  assert.deepEqual(Object.keys(light).sort(), [...all].sort());
  assert.deepEqual(Object.keys(dark).sort(), [...all].sort());
});

// the theme script mixes --line and --rule from the text and background colours (static/nav/main.js); the flat
// fallbacks must be that same mix
const mix = (fg, bg, p) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(fg.slice(i, i + 2), 16) * p + parseInt(bg.slice(i, i + 2), 16) * (1 - p))
  .toString(16).padStart(2, '0')).join('');

test('the line and rule fallbacks are the theme script\'s mixes', () => {
  for (const [name, values] of [['light', light], ['dark', dark]]) {
    const t = THEMES[name];
    assert.equal(values.line, mix(t.ui.fg, t.bg, 0.18), `${name} --line`);
    assert.equal(values.rule, mix(t.ui.fg, t.bg, 0.45), `${name} --rule`);
  }
});
