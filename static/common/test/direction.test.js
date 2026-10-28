import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDir, countWord, routeCountWord, routeHeading, cutoff, pairLabel } from '../direction.js';

test('parseDir accepts out and in, and treats anything else as both', () => {
  assert.equal(parseDir('?dir=out'), 'out');
  assert.equal(parseDir('?dir=in&measure=deps'), 'in');
  for (const s of ['', '?dir=', '?dir=OUT', '?dir=both', '?dir=each', '?measure=deps']) assert.equal(parseDir(s), '', s);
});

test('the count of flights is named for its direction', () => {
  assert.deepEqual(['', 'out', 'in'].map(countWord), ['Flights', 'Departures', 'Arrivals']);
});

test('a route heading keeps the address order', () => {
  assert.deepEqual(['', 'out', 'in'].map((d) => routeHeading('LAX', 'LHR', d)), ['LAX ↔ LHR', 'LAX → LHR', 'LHR → LAX']);
});

test('cut-offs double when both directions are counted', () => {
  assert.deepEqual([cutoff(''), cutoff('out'), cutoff('in'), cutoff('', 365)], [24, 12, 12, 730]);
});

test('an airline pair is alphabetical together and as flown when split', () => {
  assert.equal(pairLabel('LGA', 'ATL', false), 'ATL ↔ LGA');
  assert.equal(pairLabel('LGA', 'ATL', true), 'LGA → ATL');
});

test('an empty route names what was asked for', async () => {
  const { noFlights } = await import('../direction.js');
  assert.equal(noFlights('ATL', 'LAX', ''), 'No flights between ATL and LAX');
  assert.equal(noFlights('ATL', 'LAX', 'out'), 'No flights from ATL to LAX');
  assert.equal(noFlights('ATL', 'LAX', 'in'), 'No flights from LAX to ATL');
});

test('a route counts departures from whichever airport leads the heading', () => {
  assert.deepEqual(['', 'out', 'in'].map(routeCountWord), ['Flights', 'Departures', 'Departures']);
});
