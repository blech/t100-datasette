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
