import test from 'node:test';
import assert from 'node:assert/strict';
import { airportTip, groupTip } from '../src/labels.js';

const info = new Map([
  ['LHR', { code: 'LHR', name: 'London Heathrow Airport', city: 'London', country: 'United Kingdom', icao: 'EGLL' }],
  ['LGW', { code: 'LGW', name: 'London Gatwick Airport', city: 'London', country: 'United Kingdom', icao: 'EGKK' }],
  ['SEL', { code: 'SEL', name: 'Seoul (all airports)', city: 'Seoul', country: 'South Korea', icao: null }],
]);

test('airport tip gives the name, then IATA and ICAO codes, then city and country', () => {
  assert.equal(airportTip('LHR', info), 'London Heathrow Airport\nLHR · EGLL\nLondon, United Kingdom');
});

test('airport tip copes with no ICAO code and with an unknown airport', () => {
  assert.equal(airportTip('SEL', info), 'Seoul (all airports)\nSEL\nSeoul, South Korea');
  assert.equal(airportTip('ZZZ', info), 'ZZZ');
});

test('group tip lists each airport with its codes and name', () => {
  const tip = groupTip({ label: 'London, United Kingdom · LHR, LGW', codes: ['LHR', 'LGW'] }, info);
  assert.equal(tip, 'London, United Kingdom · LHR, LGW\n\nLHR · EGLL  London Heathrow Airport\nLGW · EGKK  London Gatwick Airport');
});

test('group tip stops after eight airports and counts the rest', () => {
  const codes = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
  const lines = groupTip({ label: 'Big', codes }, new Map()).split('\n');
  assert.equal(lines.length, 2 + 8 + 1);
  assert.equal(lines.at(-1), '+2 more');
});
