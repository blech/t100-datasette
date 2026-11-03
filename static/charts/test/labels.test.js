import test from 'node:test';
import assert from 'node:assert/strict';
import { airportTip, groupTip } from '../src/labels.js';

const info = new Map([
  ['LHR', { code: 'LHR', name: 'London Heathrow Airport', city: 'London', country: 'United Kingdom', place: 'London, United Kingdom', icao: 'EGLL' }],
  ['LGW', { code: 'LGW', name: 'London Gatwick Airport', city: 'London', country: 'United Kingdom', place: 'London, United Kingdom', icao: 'EGKK' }],
  ['SEL', { code: 'SEL', name: 'Seoul (all airports)', city: 'Seoul', country: 'South Korea', place: 'Seoul, South Korea', icao: null }],
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

test('airport tip shows the place once, not the city and country on top of it', () => {
  const rdu = new Map([['RDU', { code: 'RDU', name: 'Raleigh Durham International Airport', city: 'Raleigh-durham', country: 'United States', place: 'Raleigh/Durham, NC', icao: 'KRDU' }]]);
  assert.equal(airportTip('RDU', rdu), 'Raleigh Durham International Airport\nRDU · KRDU\nRaleigh/Durham, NC');
});

test('on an airport\'s own pages, an airport\'s hover text ends with how far it is, and a city lists each airport\'s distance', () => {
  const info = new Map([['LGA', { name: 'LaGuardia Airport', icao: 'KLGA', place: 'New York, NY' }], ['JFK', { name: 'John F Kennedy International Airport', icao: 'KJFK', place: 'New York, NY' }]]);
  const distances = new Map([['LGA', 762], ['JFK', 760]]);
  assert.equal(airportTip('LGA', info, { from: 'ATL', distances }), 'LaGuardia Airport\nLGA · KLGA\nNew York, NY\n762 miles from ATL');
  assert.equal(airportTip('ZZZ', info, { from: 'ATL', distances: new Map([['ZZZ', 1234]]) }), 'ZZZ\n1,234 miles from ATL');
  assert.equal(airportTip('LGA', info), 'LaGuardia Airport\nLGA · KLGA\nNew York, NY');
  const tip = groupTip({ label: 'New York, NY · JFK, LGA', codes: ['JFK', 'LGA'] }, info, { distances }).split('\n');
  assert.deepEqual(tip.slice(2), ['JFK · KJFK  John F Kennedy International Airport · 760 miles', 'LGA · KLGA  LaGuardia Airport · 762 miles']);
});
