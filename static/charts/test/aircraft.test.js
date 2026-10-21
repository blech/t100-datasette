import test from 'node:test';
import assert from 'node:assert/strict';
import { kindOptions, makerOptions, kindMatches, groupFamilies, sortFamilies, limitFamilies } from '../src/aircraft.js';

const t = (type_id, name, family, maker, aircraft_kind, deps, extra = {}) => ({
  type_id, name, family, maker, aircraft_kind, first_year: 1990, last_year: 2025, deps, seats: deps * 100, passengers: deps * 80, freight: deps * 2000, ...extra,
});
const rows = [
  t('614', 'Boeing 737-800', 'Boeing 737', 'Boeing', 'Jet, twin-engine', 60),
  t('619', 'Boeing 737-300', 'Boeing 737', 'Boeing', 'Jet, twin-engine', 30, { first_year: 1990, last_year: 2018 }),
  t('694', 'Airbus Industrie A320-100/200', 'Airbus A320 family', 'Airbus', 'Jet, twin-engine', 100),
  t('479', 'Pilatus PC-12', 'Other turboprop', 'Pilatus', 'Turboprop, one or two engines', 10),
  t('091', 'Float/Amphib Turbine', 'Unknown', 'Unknown maker', 'Piston, single-engine', 0),
];

test('families add up their types and rank by the chosen measure, with shares of the total', () => {
  const { families, total } = groupFamilies(rows, { measure: 'deps' });
  assert.deepEqual(families.map((f) => [f.family, f.value]), [['Airbus A320 family', 100], ['Boeing 737', 90], ['Other turboprop', 10]]);
  assert.equal(total, 200);
  assert.equal(families[1].share, 0.45);
  assert.deepEqual(families[1].types.map((x) => x.typeId), ['614', '619']);
  assert.equal(families[1].lastYear, 2025);
  assert.equal(families[1].slug, 'boeing-737');
});

test('a family with nothing in the year is hidden, and shares do not divide by zero', () => {
  const none = rows.map((r) => ({ ...r, deps: 0 }));
  const { families, total } = groupFamilies(none, { measure: 'deps' });
  assert.deepEqual(families, []);
  assert.equal(total, 0);
});

test('freight is shown in short tons', () => {
  const { families } = groupFamilies([t('1', 'Boeing 747-400F', 'Boeing 747', 'Boeing', 'Jet, four-engine', 3)], { measure: 'freight' });
  assert.equal(families[0].value, 3);  // 3 deps x 2,000 lb = 6,000 lb = 3 short tons
});

test('a family takes the maker and kind of its busiest type', () => {
  const mixed = [t('1', 'Canadair RJ-200', 'Regional jets', 'Canadair', 'Jet, twin-engine', 5), t('2', 'Bombardier CRJ 900', 'Regional jets', 'Bombardier', 'Jet, twin-engine', 9)];
  assert.equal(groupFamilies(mixed, { measure: 'deps' }).families[0].maker, 'Bombardier');
});

test('the kind and maker filters narrow the types, and the total follows', () => {
  const jets = groupFamilies(rows, { measure: 'deps', kind: 'jet-twin-engine' });
  assert.deepEqual(jets.families.map((f) => f.family), ['Airbus A320 family', 'Boeing 737']);
  assert.equal(jets.total, 190);
  const boeing = groupFamilies(rows, { measure: 'deps', maker: 'boeing' });
  assert.deepEqual(boeing.families.map((f) => f.family), ['Boeing 737']);
  assert.equal(boeing.families[0].share, 1);
});

test('a search matching a family name keeps all its types; one matching a type keeps only that type', () => {
  const byFamily = groupFamilies(rows, { measure: 'deps', q: 'boeing 737' }).families;
  assert.deepEqual(byFamily.map((f) => [f.family, f.types.length, f.matched]), [['Boeing 737', 2, false]]);
  const byType = groupFamilies(rows, { measure: 'deps', q: '737-300' }).families;
  assert.deepEqual(byType.map((f) => [f.family, f.types.map((x) => x.typeId), f.matched, f.value]), [['Boeing 737', ['619'], true, 90]]);
});

test('a search finds a family with nothing in the year', () => {
  const found = groupFamilies(rows, { measure: 'deps', q: 'float' }).families;
  assert.deepEqual(found.map((f) => f.family), ['Unknown']);
});

test('sortFamilies orders by any key in either direction without changing its input', () => {
  const { families } = groupFamilies(rows, { measure: 'deps' });
  assert.deepEqual(sortFamilies(families, 'family', 'asc').map((f) => f.family), ['Airbus A320 family', 'Boeing 737', 'Other turboprop']);
  assert.deepEqual(sortFamilies(families, 'value', 'asc').map((f) => f.family), ['Other turboprop', 'Boeing 737', 'Airbus A320 family']);
  assert.deepEqual(families.map((f) => f.family), ['Airbus A320 family', 'Boeing 737', 'Other turboprop']);
});

test('kinds match exactly, by their URL form, so one kind of jet is not another', () => {
  assert.ok(kindMatches('Jet, twin-engine', 'jet-twin-engine') && kindMatches('anything', 'all'));
  assert.ok(!kindMatches('Jet, four-engine', 'jet-twin-engine') && !kindMatches('Jet, twin-engine', 'jet'));
});

test('the kind menu lists every kind in the data, sorted, after "all aircraft"', () => {
  assert.deepEqual(kindOptions(rows), [
    { value: 'all', label: 'all aircraft' },
    { value: 'jet-twin-engine', label: 'Jet, twin-engine' },
    { value: 'piston-single-engine', label: 'Piston, single-engine' },
    { value: 'turboprop-one-or-two-engines', label: 'Turboprop, one or two engines' },
  ]);
  assert.deepEqual(kindOptions([]), [{ value: 'all', label: 'all aircraft' }]);
});

test('the maker menu lists each maker once, sorted, with a URL-friendly value', () => {
  assert.deepEqual(makerOptions([...rows, ...rows]).map((o) => [o.value, o.label]),
    [['all', 'any maker'], ['airbus', 'Airbus'], ['boeing', 'Boeing'], ['pilatus', 'Pilatus'], ['unknown-maker', 'Unknown maker']]);
});

test('names with markup characters come through as plain strings', () => {
  const { families } = groupFamilies([t('1', '<b>x</b> & y', 'Fam <i>', 'M&M', 'Jet, twin-engine', 1)], { measure: 'deps' });
  assert.equal(families[0].types[0].name, '<b>x</b> & y');
});

test('types with nothing in the chosen measure are left out of an open family, unless the search names them', () => {
  const withZeros = [
    t('872', 'Airbus Industrie A340-500', 'Airbus A340', 'Airbus', 'Jet, four-engine', 0),
    t('871', 'Airbus Industrie A340-300', 'Airbus A340', 'Airbus', 'Jet, four-engine', 7),
    t('697', 'Airbus Industrie A340', 'Airbus A340', 'Airbus', 'Jet, four-engine', 0),
  ];
  assert.deepEqual(groupFamilies(withZeros, { measure: 'deps' }).families[0].types.map((x) => x.typeId), ['871']);
  assert.deepEqual(groupFamilies(withZeros, { measure: 'deps', q: 'a340' }).families[0].types.map((x) => x.typeId), ['871']);
  assert.deepEqual(groupFamilies(withZeros, { measure: 'deps', q: 'a340-500' }).families[0].types.map((x) => x.typeId), ['872']);
});

const fam = (family, value, share) => ({ family, value, share, types: [] });
const ranked = [fam('A', 50, 0.5), fam('B', 30, 0.3), fam('C', 15, 0.15), fam('D', 4.5, 0.045), fam('E', 0.5, 0.005)];

test('limitFamilies keeps the top N by value, or those at or above a share', () => {
  assert.deepEqual(limitFamilies(ranked, 'top2').shown.map((f) => f.family), ['A', 'B']);
  assert.deepEqual(limitFamilies(ranked, 'min1').shown.map((f) => f.family), ['A', 'B', 'C', 'D']);
  assert.deepEqual(limitFamilies(ranked, 'min0.1').shown.map((f) => f.family), ['A', 'B', 'C', 'D', 'E']);
  assert.deepEqual(limitFamilies(ranked, 'all').shown.length, 5);
});

test('limitFamilies says how much is hidden, and leaves a search alone', () => {
  const cut = limitFamilies(ranked, 'top2');
  assert.equal(cut.hidden, 3);
  assert.ok(Math.abs(cut.shownShare - 0.8) < 1e-9);
  assert.equal(limitFamilies(ranked, 'top2', { searching: true }).shown.length, 5);
  assert.equal(limitFamilies(ranked, 'top2', { searching: true }).hidden, 0);
});

test('limitFamilies reads any top N and falls back to showing everything for a limit it does not know', () => {
  assert.equal(limitFamilies(ranked, 'top20').shown.length, 5);
  assert.equal(limitFamilies(ranked, 'nonsense').shown.length, 5);
  assert.equal(limitFamilies([], 'top2').shown.length, 0);
});

test('limitFamilies ranks by value even when the families come in another order', () => {
  const shuffled = [ranked[3], ranked[0], ranked[4], ranked[1], ranked[2]];
  assert.deepEqual(limitFamilies(shuffled, 'top2').shown.map((f) => f.family), ['A', 'B']);
});
