import test from 'node:test';
import assert from 'node:assert/strict';
import { tapAction } from '../src/tap.js';

test('tapAction: a tap on the airport already showing opens it', () => {
  assert.equal(tapAction(3, 3), 'open');
});

test('tapAction: a tap on another airport shows it first (touch has no hover)', () => {
  assert.equal(tapAction(-1, 3), 'show');
  assert.equal(tapAction(5, 3), 'show');
});

test('tapAction: a tap on empty map clears', () => {
  assert.equal(tapAction(3, -1), 'clear');
});
