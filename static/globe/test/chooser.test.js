import test from 'node:test';
import assert from 'node:assert/strict';
import { routesByOrigin, chooserTap } from '../src/chooser.js';

test('routesByOrigin groups rows by their origin, keeping order', () => {
  const rows = [{ origin: 'DEN', dest: 'ATL' }, { origin: 'ATL', dest: 'DEN' }, { origin: 'DEN', dest: 'LAX' }];
  const m = routesByOrigin(rows);
  assert.deepEqual(m.get('DEN').map((r) => r.dest), ['ATL', 'LAX']);
  assert.deepEqual(m.get('ATL').map((r) => r.dest), ['DEN']);
  assert.equal(m.get('ORD'), undefined);
});

test('chooserTap: a tap on the airport already showing opens it', () => {
  assert.equal(chooserTap(3, 3), 'open');
});

test('chooserTap: a tap on another airport shows its routes first (touch has no hover)', () => {
  assert.equal(chooserTap(-1, 3), 'show');
  assert.equal(chooserTap(5, 3), 'show');
});

test('chooserTap: a tap on empty map clears', () => {
  assert.equal(chooserTap(3, -1), 'clear');
});
