import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadD3 } from './d3.js';
import { geoAlbersUsaTerritories, INSETS } from '../src/usamap.js';

const d3 = loadD3();
const W = 910;
const H = 476;
const proj = geoAlbersUsaTerritories(d3).fitSize([W, H], 0);
const AIRPORTS = { ATL: [-84.43, 33.64], BOS: [-71.0, 42.36], ANC: [-149.99, 61.17], HNL: [-157.92, 21.32], SJU: [-66.0, 18.44], STT: [-64.97, 18.34], GUM: [144.8, 13.48] };

// which inset box (in lower-48 units) a pixel falls in
function insetOf([x, y]) {
  const k = proj.scale();
  const [tx, ty] = proj.translate();
  const u = (x - tx) / k;
  const v = (y - ty) / k;
  for (const [name, [[x0, y0], [x1, y1]]] of Object.entries(INSETS)) if (u >= x0 && u < x1 && v >= y0 && v < y1) return name;
  return 'lower48';
}

test('airports land in the right part of the map', () => {
  assert.equal(insetOf(proj(AIRPORTS.ATL)), 'lower48');
  assert.equal(insetOf(proj(AIRPORTS.BOS)), 'lower48');
  assert.equal(insetOf(proj(AIRPORTS.ANC)), 'alaska');
  assert.equal(insetOf(proj(AIRPORTS.HNL)), 'hawaii');
  assert.equal(insetOf(proj(AIRPORTS.SJU)), 'caribbean');
  assert.equal(insetOf(proj(AIRPORTS.STT)), 'caribbean');
});

test('projects GUM to null', () => {
  assert.equal(proj(AIRPORTS.GUM), null);
});

test('everything it places is inside the fitted size', () => {
  for (const [code, ll] of Object.entries(AIRPORTS)) {
    const p = proj(ll);
    if (!p) continue;
    assert.ok(p[0] >= 0 && p[0] <= W && p[1] >= 0 && p[1] <= H, `${code} at ${p}`);
  }
});

test('invert round-trips a point in each part', () => {
  for (const code of ['ATL', 'ANC', 'HNL', 'SJU']) {
    const back = proj.invert(proj(AIRPORTS[code]));
    assert.ok(Math.abs(back[0] - AIRPORTS[code][0]) < 1e-6 && Math.abs(back[1] - AIRPORTS[code][1]) < 1e-6, code);
  }
});

test('fitSize scales to the tighter side and centres', () => {
  const p = geoAlbersUsaTerritories(d3).fitSize([400, 600], 10);
  assert.ok(Math.abs(p.scale() - 380 / 0.91) < 1e-9);
  assert.deepEqual([...p.translate()], [200, 300]); // d3 runs in another context, so copy its array into this one
  assert.equal(p.insetFrames().length, 3);
});
