import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const tokens = (block) => Object.fromEntries([...block.matchAll(/--([a-z]+)\s*:\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()]));
const mine = read('../style.css');
const base = read('../../common/base.css');

test('the data pages use the site\'s light tokens', () => {
  const ours = tokens(mine.match(/^:root\s*\{([^}]*)\}/m)[1]);
  const theirs = tokens(base.match(/^:root\s*\{([^}]*)\}/m)[1]);
  for (const [name, value] of Object.entries(ours)) assert.equal(value, theirs[name], `--${name}`);
  assert.deepEqual(Object.keys(ours).sort(), ['accent', 'bg', 'fg', 'line', 'muted', 'rule']);
});

test('the data pages are light only', () => {
  assert.doesNotMatch(mine, /prefers-color-scheme/);
  assert.match(mine, /color-scheme:\s*light/);
});

test('the compact tables keep Datasette\'s padding and type sizes', () => {
  const rule = [...mine.matchAll(/[^{}]*rows-and-columns[^{}]*\{([^}]*)\}/g)].map((m) => m[1]).join(' ');
  assert.doesNotMatch(rule, /padding|font-size|line-height/);
});
