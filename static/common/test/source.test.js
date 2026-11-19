import { test } from 'node:test';
import assert from 'node:assert/strict';
import { airportHref, database, countBy, isEurope } from '../source.js';

test('without a page saying otherwise, the data is T-100s and destinations count by flights', () => {
  assert.equal(database(), 't100');
  assert.equal(isEurope(), false);
  assert.equal(countBy(), 'deps');
});

test('on a T-100 page an airport always has its page', () => {
  assert.equal(airportHref('LHR'), '/airports/LHR');
  assert.equal(airportHref('LHR', '/globe'), '/airports/LHR/globe');
});

test('on a European page an airport links to its European pages, its T-100 ones, or nowhere', () => {
  const info = new Map([['CDG', { page: 'europe' }], ['JFK', { page: 't100' }], ['DXB', { page: null }]]);
  assert.equal(airportHref('CDG', '', info, true), '/europe/airports/CDG');
  assert.equal(airportHref('CDG', '/globe', info, true), '/europe/airports/CDG/globe');
  assert.equal(airportHref('JFK', '', info, true), '/airports/JFK');
  assert.equal(airportHref('DXB', '', info, true), null);
  assert.equal(airportHref('ZZZ', '', info, true), null);
});
