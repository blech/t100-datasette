import test from 'node:test';
import assert from 'node:assert/strict';
import { shortName, shortNames, shortenField } from '../src/names.js';

test('a trade name after d/b/a replaces the legal name', () => {
  assert.equal(shortName('Hyannis Air Service, Inc. dba Cape Air'), 'Cape Air');
  assert.equal(shortName('Corvus Airlines, Inc d/b/a Era Aviation d/b/a Ravn Alaska'), 'Era Aviation');
  assert.equal(shortName('Corporate Flight Management Inc.d/b/a Crystal Luxury Air'), 'Crystal Luxury Air');
});

test('a trade name that is a mainline brand, or tiny, leaves the legal name', () => {
  assert.equal(shortName('GoJet Airlines LLC d/b/a United Express'), 'GoJet Airlines');
  assert.equal(shortName('ExpressJet Airlines LLC d/b/a aha!'), 'ExpressJet Airlines');
});

test('legal endings, merger notes and former names are dropped', () => {
  assert.equal(shortName('Federal Express Corporation'), 'Federal Express');
  assert.equal(shortName('Korean Air Lines Co. Ltd.'), 'Korean Air Lines');
  assert.equal(shortName('American (incl. TWA, US Airways, America West)'), 'American');
  assert.equal(shortName('Eastern Airlines f/k/a Dynamic Airways, LLC'), 'Eastern Airlines');
  assert.equal(shortName('Aeroenlaces Nacionales, S.A. de C.V. d/b/a VivaAerobus'), 'VivaAerobus');
});

test('names that are already short are left alone, and Mesa is not an "SA"', () => {
  assert.equal(shortName('Delta Air Lines Inc.'), 'Delta Air Lines');
  assert.equal(shortName('Mesa'), 'Mesa');
  assert.equal(shortName(null), '');
});

test('shortNames keeps the full names of airlines whose short names would collide', () => {
  const m = shortNames(['Pacific International Airlines', 'Pacific International Airlines Inc.', 'Delta Air Lines Inc.']);
  assert.equal(m.get('Delta Air Lines Inc.'), 'Delta Air Lines');
  assert.equal(m.get('Pacific International Airlines Inc.'), 'Pacific International Airlines Inc.');
});

test('shortenField shortens each row once, even when the same rows are in two lists', () => {
  const rows = [{ carrier: 'British Airways Plc' }, { carrier: 'Delta Air Lines Inc.' }, { carrier: null }];
  const full = shortenField([rows, rows], 'carrier');
  assert.deepEqual(rows.map((r) => r.carrier), ['British Airways', 'Delta Air Lines', '']);
  assert.equal(full.get('British Airways'), 'British Airways Plc');
});
