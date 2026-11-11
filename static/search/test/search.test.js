import test from 'node:test';
import assert from 'node:assert/strict';
import { tokens, searchUrl, groupResults, moveSelection } from '../src/search.js';

test('tokens lowercases and splits on spaces, giving three, padded with empty strings', () => {
  assert.deepEqual(tokens('  Airbus A340-600 '), ['airbus', 'a340-600', '']);
  assert.deepEqual(tokens(''), ['', '', '']);
  assert.deepEqual(tokens('a b c d e'), ['a', 'b', 'c']);
});

test('searchUrl is null for a blank search and otherwise names the search query with each token', () => {
  assert.equal(searchUrl('   '), null);
  const url = searchUrl('KEF');
  assert.ok(url.startsWith('/t100/search.json?'));
  const q = new URL(url, 'http://x').searchParams;
  assert.equal(q.get('t1'), 'kef');
  assert.equal(q.get('t2'), '');
  assert.equal(q.get('_shape'), 'objects');
});

test('searchUrl encodes characters that mean something in a URL', () => {
  const q = new URL(searchUrl("50% o'hare & co"), 'http://x').searchParams;
  assert.deepEqual([q.get('t1'), q.get('t2'), q.get('t3')], ['50%', "o'hare", '&']);
});

test('groupResults keeps the order the rows came in, so the best match leads, and drops empty kinds', () => {
  const rows = [
    { kind: 'aircraft', href: '/aircraft/a', label: 'A', hint: '' },
    { kind: 'airport', href: '/airports/KEF', label: 'KEF', hint: '' },
    { kind: 'airport', href: '/airports/SFO', label: 'SFO', hint: '' },
  ];
  const groups = groupResults(rows);
  assert.deepEqual(groups.map((g) => [g.kind, g.title, g.items.length]), [['aircraft', 'Aircraft', 1], ['airport', 'Airports', 2]]);
  assert.deepEqual(groups[1].items.map((r) => r.label), ['KEF', 'SFO']);
  assert.deepEqual(groupResults([]), []);
});

test('moveSelection wraps both ways and copes with no results', () => {
  assert.equal(moveSelection(0, 3, 'ArrowDown'), 1);
  assert.equal(moveSelection(2, 3, 'ArrowDown'), 0);
  assert.equal(moveSelection(0, 3, 'ArrowUp'), 2);
  assert.equal(moveSelection(-1, 3, 'ArrowDown'), 0);
  assert.equal(moveSelection(-1, 3, 'ArrowUp'), 2);
  assert.equal(moveSelection(0, 0, 'ArrowDown'), 0);
});
