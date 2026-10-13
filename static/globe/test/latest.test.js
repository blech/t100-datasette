import test from 'node:test';
import assert from 'node:assert/strict';
import { createLatest } from '../src/latest.js';

test('only the most recently started request is current', () => {
  const seq = createLatest();
  const a = seq.next();
  assert.equal(seq.isCurrent(a), true);
  const b = seq.next();
  assert.equal(seq.isCurrent(a), false);
  assert.equal(seq.isCurrent(b), true);
});
