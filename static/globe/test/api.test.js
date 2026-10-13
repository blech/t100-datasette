import test from 'node:test';
import assert from 'node:assert/strict';
import { queryUrl, fetchRows } from '../src/api.js';

test('queryUrl builds a Datasette JSON url', () => {
  assert.equal(queryUrl('routes_by_year', { origin: 'ATL' }), '/t100/routes_by_year.json?_shape=objects&origin=ATL');
  assert.equal(queryUrl('airports'), '/t100/airports.json?_shape=objects');
});
test('queryUrl encodes values', () => {
  assert.match(queryUrl('x', { origin: 'A B&C' }), /origin=A\+B%26C$/);
});
test('fetchRows returns rows and truncated flag', async () => {
  const fake = async () => ({ ok: true, json: async () => ({ rows: [{ a: 1 }], truncated: true }) });
  assert.deepEqual(await fetchRows('/u', fake), { rows: [{ a: 1 }], truncated: true });
});
test('fetchRows defaults truncated to false and throws on HTTP errors', async () => {
  const ok = async () => ({ ok: true, json: async () => ({ rows: [] }) });
  assert.equal((await fetchRows('/u', ok)).truncated, false);
  const bad = async () => ({ ok: false, status: 500 });
  await assert.rejects(() => fetchRows('/u', bad), /500/);
});
