import test from 'node:test';
import assert from 'node:assert/strict';
import { dataHref } from '../datalink.js';

test('dataHref keeps every parameter, empty or not, in order', () => {
  assert.equal(dataHref('route', { origin: 'SFO', dest: 'JFK', group: '' }), '/t100/route?origin=SFO&dest=JFK&group=&_hide_sql=1');
  assert.equal(dataHref('route_year', { origin: 'SFO', dest: 'JFK', year: 2019, group: null }), '/t100/route_year?origin=SFO&dest=JFK&year=2019&group=&_hide_sql=1');
});

test('dataHref with no parameters', () => {
  assert.equal(dataHref('maker_by_year', {}), '/t100/maker_by_year?_hide_sql=1');
});

test('dataHref encodes values', () => {
  assert.equal(dataHref('family_detail', { family: 'Boeing 737 & co' }), '/t100/family_detail?family=Boeing+737+%26+co&_hide_sql=1');
});
