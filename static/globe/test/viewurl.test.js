import test from 'node:test';
import assert from 'node:assert/strict';
import { formatView, parseView } from '../src/viewurl.js';
import { ZMAX, ZMIN } from '../src/camera.js';

test('a view is written as the middle of the map, then the zoom', () => {
  assert.equal(formatView({ rot: [-2.14, -48.66], zoom: 5.304 }), '2.1,48.7,5.3');
  assert.equal(formatView({ rot: [100, -30], zoom: 1 }), '-100,30,1');
  assert.equal(formatView({ rot: [0, 0], zoom: 1 }), '0,0,1'); // never "-0"
});

test('a written view reads back as the camera keeps it', () => {
  assert.deepEqual(parseView('2.1,48.7,5.3'), { rot: [-2.1, -48.7], zoom: 5.3 });
  assert.deepEqual(parseView(formatView({ rot: [100, -30], zoom: 1 })), { rot: [100, -30], zoom: 1 });
});

test('out-of-range values are brought in range: longitude wraps, latitude and zoom clamp', () => {
  assert.deepEqual(parseView('190,95,99'), { rot: [170, -90], zoom: ZMAX });
  assert.equal(parseView('0,0,0.1').zoom, ZMIN);
});

test('anything that is not three numbers is ignored', () => {
  for (const bad of [null, undefined, '', '1,2', '1,2,3,4', 'a,b,c', '1,,3', 'Infinity,0,1']) assert.equal(parseView(bad), null, String(bad));
});
