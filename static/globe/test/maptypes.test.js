import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAP_TYPES, parseMapType, centreRot, openingRot, mapKey } from '../src/maptypes.js';

test('the three map types, in menu and key order', () => {
  assert.deepEqual(MAP_TYPES.map((t) => [t.value, t.label]), [['globe', 'Globe'], ['flat', 'Equal Earth'], ['azimuthal', 'Azimuthal']]);
});

test('parseMapType keeps the three, and sends anything else (old links included) to the globe', () => {
  for (const v of ['globe', 'flat', 'azimuthal']) assert.equal(parseMapType(v), v);
  for (const v of [null, '', 'equirect', 'kansas', 'pole', 'cube']) assert.equal(parseMapType(v), 'globe');
});

test('the globe tilts no further than 70°; the flat and azimuthal maps go right over the place', () => {
  assert.deepEqual(centreRot('globe', [-95.3, 29.6]), [95.3, -29.6]);
  assert.deepEqual(centreRot('globe', [-150, 80]), [150, -70]);
  assert.deepEqual(centreRot('azimuthal', [-150, 80]), [150, -80]);
  assert.deepEqual(centreRot('flat', [-150, 80]), [150, -80]);
});

test('the flat map opens on the equator; the others open on the place', () => {
  assert.deepEqual(openingRot('flat', [-95.3, 29.6]), [95.3, 0]);
  assert.deepEqual(openingRot('azimuthal', [-95.3, 29.6]), [95.3, -29.6]);
  assert.deepEqual(openingRot('globe', [-95.3, 29.6]), [95.3, -29.6]);
});

const key = (k, extra = {}) => ({ key: k, target: { closest: () => null }, ...extra });

test('mapKey: arrows, space and 1–3', () => {
  assert.equal(mapKey(key('ArrowLeft')), 'prev');
  assert.equal(mapKey(key('ArrowRight')), 'next');
  assert.equal(mapKey(key(' ')), 'play');
  assert.equal(mapKey(key('1')), 'globe');
  assert.equal(mapKey(key('2')), 'flat');
  assert.equal(mapKey(key('3')), 'azimuthal');
  assert.equal(mapKey(key('4')), null);
  assert.equal(mapKey(key('f')), null);
});

test('mapKey leaves modified keys and typing in a menu or box alone', () => {
  assert.equal(mapKey(key('ArrowLeft', { metaKey: true })), null);
  assert.equal(mapKey(key('2', { ctrlKey: true })), null);
  assert.equal(mapKey(key(' ', { target: { closest: () => ({}) } })), null);
});
