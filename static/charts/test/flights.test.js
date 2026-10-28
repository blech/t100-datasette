import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultFlights, flightsAfter } from '../src/flights.js';

test('freight counts all flights by default; every other measure passenger flights', () => {
  assert.deepEqual(['passengers', 'deps', 'seats', 'freight'].map(defaultFlights), ['passenger', 'passenger', 'passenger', 'all']);
});

test('a default choice follows the measure; one made on purpose stays', () => {
  assert.equal(flightsAfter('passenger', 'passengers', 'freight'), 'all');
  assert.equal(flightsAfter('all', 'freight', 'deps'), 'passenger');
  assert.equal(flightsAfter('freight', 'passengers', 'freight'), 'freight');
  assert.equal(flightsAfter('all', 'passengers', 'freight'), 'all');
  assert.equal(flightsAfter('passenger', 'freight', 'seats'), 'passenger'); // chosen on freight, so kept
  assert.equal(flightsAfter('passenger', 'deps', 'seats'), 'passenger');
});
