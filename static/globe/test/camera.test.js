import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ZMIN, ZMAX, clamp, defaultView, easeAngle, rotationFor, zoomForKm, followStep, releaseVelocity, easeToward, glide, fitView,
} from '../src/camera.js';
import { loadD3 } from './d3.js';

const d3 = loadD3();

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);

test('clamp and zoom limits', () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-1, 0, 3), 0);
  assert.equal(ZMIN, 0.8);
  assert.equal(ZMAX, 4);
});

test('defaultView returns a fresh object each time', () => {
  const a = defaultView();
  a.rot[0] = 5;
  assert.notEqual(defaultView().rot[0], 5);
  assert.equal(defaultView().zoom, 1);
});

test('easeAngle: no motion at dt 0, converges, takes the short way round', () => {
  assert.equal(easeAngle(10, 50, 0, 0.5), 10);
  near(easeAngle(10, 20, 100, 0.1), 20, 1e-6);
  const v = easeAngle(170, -170, 1, 1); // short way is +20 degrees, i.e. past 170
  assert.ok(v > 170 && v < 190, String(v));
});

test('rotationFor centres a point and limits tilt', () => {
  assert.deepEqual(rotationFor(-122, 37), [122, -37]);
  assert.equal(rotationFor(0, 89)[1], -70);
  assert.equal(rotationFor(0, -89)[1], 70);
});

test('zoomForKm zooms in on short hops and out on long ones, never past 1.4x', () => {
  assert.equal(zoomForKm(300), 1.4);
  assert.equal(zoomForKm(9000), 1);
  near(zoomForKm(4250), 1.2);
  for (let km = 0; km < 20000; km += 250) assert.ok(zoomForKm(km) >= 1 && zoomForKm(km) <= 1.4);
});

test('followStep converges on the target', () => {
  const v = defaultView();
  for (let i = 0; i < 600; i++) followStep(v, { lon: -122, lat: 37, km: 3000 }, 1 / 60);
  near(v.rot[0], 122, 0.01);
  near(v.rot[1], -37, 0.01);
  near(v.followZoom, zoomForKm(3000), 0.01);
});

test('releaseVelocity: a slow release stops dead, a real flick keeps its momentum', () => {
  assert.deepEqual(releaseVelocity([5, -3]), [0, 0]);
  assert.deepEqual(releaseVelocity([0, 0]), [0, 0]);
  assert.deepEqual(releaseVelocity([60, 10]), [60, 10]);
  assert.deepEqual(releaseVelocity([-40, 0]), [-40, 0]);
  assert.deepEqual(releaseVelocity([10, 10], 5), [10, 10]);
});

test('easeToward snaps onto the target once close, so motion actually stops', () => {
  assert.equal(easeToward(1.4, 1, 0, 0.8), 1.4);
  const mid = easeToward(1.4, 1, 0.016, 0.8);
  assert.ok(mid < 1.4 && mid > 1);
  assert.equal(easeToward(1.0004, 1, 0.016, 0.8), 1);
  assert.equal(easeToward(1, 1, 0.016, 0.8), 1);
});

test('easeAngle and followStep reach rest exactly', () => {
  assert.equal(easeAngle(19.998, 20, 0.016, 0.5), 20);
  const v = defaultView();
  for (let i = 0; i < 2000; i++) followStep(v, { lon: -122, lat: 37, km: 3000 }, 1 / 60);
  const settled = [v.rot[0], v.rot[1], v.followZoom];
  followStep(v, { lon: -122, lat: 37, km: 3000 }, 1 / 60);
  assert.deepEqual([v.rot[0], v.rot[1], v.followZoom], settled);
});

test('glide eases to the target and then lets go of it', () => {
  const v = defaultView();
  v.target = { rot: [87.9, -42], zoom: 2 };
  for (let i = 0; i < 600 && v.target; i++) assert.equal(glide(v, 1 / 60), true);
  assert.equal(v.target, null);
  assert.deepEqual([v.rot[0], v.rot[1], v.zoom], [87.9, -42, 2]);
  assert.equal(glide(v, 1 / 60), false);
});

// where each point lands on screen in the fitted view
const placed = (points, fit, projection, { centre, baseScale }) => {
  projection.rotate(fit.rot).scale(baseScale * fit.zoom).translate(centre);
  return points.map((p) => projection(p));
};

test('fitView frames the points in the box, touching it, centred, north up', () => {
  // ORD and the far corners of its domestic network
  const points = [[-87.9, 41.98], [-157.9, 21.3], [-149.99, 61.17], [-70.3, 43.6], [-80.3, 25.8], [-117.2, 32.7]];
  const opts = { centre: [500, 368], baseScale: 268, box: { left: 24, right: 952, top: 300, bottom: 620 } };
  const fit = fitView(points, d3.geoOrthographic(), opts);
  assert.equal(fit.rot.length, 2);  // no roll: north stays up
  assert.ok(fit.zoom > 1 && fit.zoom <= ZMAX, String(fit.zoom));
  const xy = placed(points, fit, d3.geoOrthographic(), opts);
  const xs = xy.map((p) => p[0]), ys = xy.map((p) => p[1]);
  for (const [x, y] of xy) assert.ok(x >= 23 && x <= 953 && y >= 299 && y <= 621, `${x},${y}`);
  // as tight as it goes: the points reach the box on one axis, and sit in its middle on both
  const { box } = opts;
  assert.ok(Math.min(...xs) - box.left < 2 || box.bottom - Math.max(...ys) < 2 || Math.min(...ys) - box.top < 2);
  near((Math.min(...xs) + Math.max(...xs)) / 2, (box.left + box.right) / 2, 1);
  near((Math.min(...ys) + Math.max(...ys)) / 2, (box.top + box.bottom) / 2, 1);
});

test('fitView stops at the zoom limit for a tight cluster, and shows the hemisphere when points are round the back', () => {
  const opts = { centre: [500, 400], baseScale: 300, box: { left: 0, right: 1000, top: 0, bottom: 800 } };
  assert.equal(fitView([[-87.9, 41.98], [-87.75, 41.79]], d3.geoOrthographic(), opts).zoom, ZMAX);
  assert.equal(fitView([[-87.9, 41.98], [151.2, -33.9], [28.2, -26.1]], d3.geoOrthographic(), opts).zoom, 1);
  assert.equal(fitView([], d3.geoOrthographic(), opts), null);
});
