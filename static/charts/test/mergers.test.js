import test from 'node:test';
import assert from 'node:assert/strict';
import { shade, mergerBands } from '../src/mergers.js';
import { airlineColours, OTHER_AIRLINES } from '../../home/src/airlines.js';

const m = (year, airline_id, group_id, airline_name, passengers, extra = {}) =>
  ({ year, airline_id, group_id, group_name: group_id, airline_name, service: 'domestic', kind: 'passenger', passengers, ...extra });

// Delta absorbed Northwest (gone by 2025), American absorbed US Airways, Spirit stands alone
const rows = [
  m(2005, '19790', 'delta', 'Delta Air Lines Inc.', 300), m(2025, '19790', 'delta', 'Delta Air Lines Inc.', 500),
  m(2005, '19386', 'delta', 'Northwest Airlines Inc.', 100),
  m(2005, '19805', 'american', 'American Airlines Inc.', 200), m(2025, '19805', 'american', 'American Airlines Inc.', 400),
  m(2005, '20355', 'american', 'US Airways Inc.', 150),
  m(2005, '20416', '20416', 'Spirit Air Lines', 20), m(2025, '20416', '20416', 'Spirit Air Lines', 50),
  m(2025, '19790', 'delta', 'Delta Air Lines Inc.', 7, { service: 'international' }), // another row of the same airline and year adds up
];

test('shade mixes a colour toward white', () => {
  assert.equal(shade('#000000', 0.5), '#808080');
  assert.equal(shade('#336699', 0), '#336699');
  assert.equal(shade('#336699', 1), '#ffffff');
});

test('only groups that absorbed an airline appear, the one with the biggest survivor first', () => {
  assert.deepEqual(mergerBands(rows).groups.map((g) => g.id), ['delta', 'american']);
});

test('the survivor is the member still flying in the latest year', () => {
  const { groups } = mergerBands(rows);
  assert.equal(groups[0].survivor, 'Delta');
  assert.deepEqual(groups[0].members, ['Delta', 'Northwest']);
  assert.deepEqual(groups[1].members, ['American', 'US Airways']);
});

test('the series run survivor then absorbed airlines group by group, then everyone else', () => {
  assert.deepEqual(mergerBands(rows).series, ['Delta', 'Northwest', 'American', 'US Airways', OTHER_AIRLINES]);
});

test('every year\'s stack reaches the whole market, singletons and all, and rows of one airline and year add up', () => {
  const { bands } = mergerBands(rows);
  const top = (year) => Math.max(...bands.filter((b) => b.year === year).map((b) => b.y2));
  assert.equal(top(2005), 770);
  assert.equal(top(2025), 957);
  assert.equal(bands.find((b) => b.year === 2025 && b.series === 'Delta').passengers, 507);
  assert.equal(bands.find((b) => b.year === 2025 && b.series === OTHER_AIRLINES).passengers, 50);
});

test('an absorbed airline is a lighter shade of its survivor\'s colour', () => {
  const { colours } = mergerBands(rows);
  assert.equal(colours.get('Delta'), airlineColours(['Delta'])[0]);
  assert.equal(colours.get('Northwest'), shade(colours.get('Delta'), 0.3));
  assert.equal(colours.get('US Airways'), shade(colours.get('American'), 0.3));
});

test('bands stack without gaps when an absorbed airline overlaps its survivor in time', () => {
  const overlap = [
    m(2016, '19930', 'alaska', 'Alaska Airlines Inc.', 100), m(2017, '19930', 'alaska', 'Alaska Airlines Inc.', 110), m(2018, '19930', 'alaska', 'Alaska Airlines Inc.', 160),
    m(2016, '21171', 'alaska', 'Virgin America Inc.', 30), m(2017, '21171', 'alaska', 'Virgin America Inc.', 40),
  ];
  const { bands } = mergerBands(overlap);
  for (const year of [2016, 2017, 2018]) {
    const stack = bands.filter((b) => b.year === year).sort((a, b) => a.y1 - b.y1);
    assert.equal(stack[0].y1, 0);
    stack.slice(1).forEach((b, i) => assert.equal(b.y1, stack[i].y2));
  }
});

test('two airlines with the same short name keep distinct series', () => {
  const twins = [m(2000, '1', 'g', 'Foo Airways Inc.', 5), m(2000, '2', 'g', 'Foo Airways Inc.', 3), m(2001, '1', 'g', 'Foo Airways Inc.', 5)];
  const { series } = mergerBands(twins);
  assert.equal(new Set(series).size, series.length);
  assert.ok(series.includes('Foo Airways (1)') && series.includes('Foo Airways (2)'));
});

test('years run from the first to the last in the data', () => {
  assert.deepEqual(mergerBands(rows).years, [2005, 2025]);
});

test('an airline\'s band tapers to nothing the year after it ends and from the year before it begins, so no gap opens beside it', () => {
  const life = [
    m(2000, '1', 'g', 'Big Air', 100), m(2001, '1', 'g', 'Big Air', 100), m(2002, '1', 'g', 'Big Air', 100), m(2003, '1', 'g', 'Big Air', 100),
    m(2001, '2', 'g', 'Small Air', 20), m(2002, '2', 'g', 'Small Air', 20),
  ];
  const { bands } = mergerBands(life);
  const at = (year) => bands.find((b) => b.year === year && b.series === 'Small Air');
  assert.equal(at(2000).passengers, 0);
  assert.equal(at(2003).passengers, 0);
  assert.equal(at(2001).passengers, 20);
});

test('a survivor with many absorbed airlines still gives each a shade of its own', () => {
  const many = [m(2000, '0', 'g', 'Lead Air', 100), ...['1', '2', '3', '4', '5'].map((id) => m(2000, id, 'g', `Absorbed ${id} Air`, 10 - Number(id)))];
  const { colours, groups } = mergerBands(many);
  const shades = groups[0].members.slice(1).map((s) => colours.get(s));
  assert.equal(new Set(shades).size, 5);
  assert.ok(!shades.includes('#ffffff'));
});
