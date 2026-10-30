import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultFlights, flightsAfter, settle, offeredBy } from '../src/flights.js';

test('freight counts all flights by default; every other measure passenger flights', () => {
  assert.deepEqual(['passengers', 'deps', 'seats', 'freight'].map(defaultFlights), ['passenger', 'passenger', 'passenger', 'all']);
});

test('a default choice follows the measure; one made on purpose stays', () => {
  assert.equal(flightsAfter('passenger', 'passengers', 'freight'), 'all');
  assert.equal(flightsAfter('freight', 'passengers', 'freight'), 'freight');
  assert.equal(flightsAfter('all', 'passengers', 'freight'), 'all');
  assert.equal(flightsAfter('passenger', 'freight', 'seats'), 'passenger'); // chosen on freight, so kept
  assert.equal(flightsAfter('passenger', 'deps', 'seats'), 'passenger');
});

test('departures leave flights alone; leaving them, either default follows the new measure', () => {
  assert.equal(flightsAfter('all', 'freight', 'deps'), 'all');
  assert.equal(flightsAfter('passenger', 'passengers', 'deps'), 'passenger');
  assert.equal(flightsAfter('freight', 'passengers', 'deps'), 'freight');
  assert.equal(flightsAfter('all', 'deps', 'passengers'), 'passenger');
  assert.equal(flightsAfter('passenger', 'deps', 'freight'), 'all');
  assert.equal(flightsAfter('freight', 'deps', 'seats'), 'freight');
});

test('settle: a measure moves flights left at its default, and only those', () => {
  const before = { measure: 'passengers', flights: 'passenger', split: 'service' };
  assert.deepEqual(settle(before, { ...before, measure: 'freight' }), { measure: 'freight', flights: 'all', split: 'service' });
  const chosen = { ...before, flights: 'freight' };
  assert.deepEqual(settle(chosen, { ...chosen, measure: 'deps' }), { measure: 'deps', flights: 'freight', split: 'service' });
  // a page without a split
  assert.deepEqual(settle({ measure: 'freight', flights: 'all' }, { measure: 'seats', flights: 'all' }), { measure: 'seats', flights: 'passenger' });
});

test('settle: splitting by passenger or freight takes all flights, and other flights take the split back', () => {
  const before = { measure: 'passengers', flights: 'passenger', split: 'service' };
  assert.deepEqual(settle(before, { ...before, split: 'kind' }), { measure: 'passengers', flights: 'all', split: 'kind' });
  const byKind = { measure: 'passengers', flights: 'all', split: 'kind' };
  assert.deepEqual(settle(byKind, { ...byKind, flights: 'freight' }), { measure: 'passengers', flights: 'freight', split: 'service' });
  // the measure leaves all flights alone while they're split by kind, though they're at freight's default
  const freight = { measure: 'freight', flights: 'all', split: 'kind' };
  assert.deepEqual(settle(freight, { ...freight, measure: 'passengers' }), { measure: 'passengers', flights: 'all', split: 'kind' });
});

test('settle: on its own, it puts an address\'s settings right for what the page offers', () => {
  const offered = { measure: ['passengers', 'deps', 'seats'], flights: ['passenger', 'all'], split: ['service', 'airline'] };
  // freight there's none of falls back to passengers, and its all flights with it
  assert.deepEqual(settle({ measure: 'freight', flights: 'all', split: 'service' }, null, { offered }), { measure: 'passengers', flights: 'passenger', split: 'service' });
  assert.deepEqual(settle({ measure: 'deps', flights: 'freight', split: 'kind' }, null, { offered }), { measure: 'deps', flights: 'passenger', split: 'service' });
  // an address asking for a split by kind takes all flights, unless its flights were chosen off their default
  assert.deepEqual(settle({ measure: 'deps', flights: 'passenger', split: 'kind' }), { measure: 'deps', flights: 'all', split: 'kind' });
  assert.deepEqual(settle({ measure: 'deps', flights: 'freight', split: 'kind' }), { measure: 'deps', flights: 'freight', split: 'service' });
  assert.deepEqual(settle({ measure: 'deps', flights: 'freight', split: 'airline' }), { measure: 'deps', flights: 'freight', split: 'airline' });
});

test('offeredBy leaves out freight with none carried, and freight flights and the split by kind with no freighters', () => {
  const opts = { measures: ['passengers', 'freight', 'deps', 'seats'], splits: ['service', 'kind', 'airline'] };
  const pax = { kind: 'passenger', freight: 0 };
  assert.deepEqual(offeredBy([pax], opts), { measure: ['passengers', 'deps', 'seats'], flights: ['passenger', 'all'], split: ['service', 'airline'] });
  // belly freight alone: freight offered, freighters not
  assert.deepEqual(offeredBy([{ ...pax, freight: 2000 }], opts).measure, opts.measures);
  assert.deepEqual(offeredBy([{ ...pax, freight: 2000 }], opts).flights, ['passenger', 'all']);
  const both = offeredBy([pax, { kind: 'freight', freight: '4000' }], opts);
  assert.deepEqual(both, { measure: opts.measures, flights: ['passenger', 'freight', 'all'], split: opts.splits });
});
