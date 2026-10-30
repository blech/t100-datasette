import test from 'node:test';
import assert from 'node:assert/strict';
import { groupAirlines, sortAirlines, sharedQuery, airlineQuery, matchesElsewhere } from '../src/airlines.js';
import { limitFamilies, limitOptions } from '../src/aircraft.js';

const r = (group_id, group_name, airline_id, airline_name, deps, extra = {}) => ({
  group_id, group_name, airline_id, airline_name, service: 'domestic', kind: 'passenger', first_year: 1990, last_year: 2025,
  deps, seats: deps * 100, passengers: deps * 80, freight: deps * 2000, ...extra,
});
const rows = [
  r('delta', 'Delta (incl. Northwest)', '19790', 'Delta Air Lines Inc.', 60),
  r('delta', 'Delta (incl. Northwest)', '19790', 'Delta Air Lines Inc.', 10, { service: 'international', first_year: 1991 }),
  r('delta', 'Delta (incl. Northwest)', '19386', 'Northwest Airlines Inc.', 30, { first_year: 1990, last_year: 2009 }),
  r('southwest', 'Southwest', '19393', 'Southwest Airlines Co.', 80, { first_year: 1995 }),
  r('fedex', 'FedEx', '20107', 'Federal Express Corporation', 20, { kind: 'freight', service: 'international', first_year: 2003 }),
];

test('a group adds up its members, ranked by the chosen measure, with shares of the total', () => {
  const { groups, total } = groupAirlines(rows, { measure: 'deps' });
  assert.deepEqual(groups.map((g) => [g.id, g.value]), [['delta', 100], ['southwest', 80]]);
  assert.equal(total, 180);
  assert.ok(Math.abs(groups[0].share - 100 / 180) < 1e-9);
  assert.deepEqual(groups[0].members.map((m) => [m.id, m.name, m.value]), [['19790', 'Delta Air Lines Inc.', 70], ['19386', 'Northwest Airlines Inc.', 30]]);
  assert.deepEqual([groups[0].firstYear, groups[0].lastYear], [1990, 2025]);
  assert.equal(groups[0].name, 'Delta (incl. Northwest)');
});

test('flights and service filter the rows, and the years come from what is left', () => {
  assert.deepEqual(groupAirlines(rows, { measure: 'deps', flights: 'freight' }).groups.map((g) => g.id), ['fedex']);
  assert.deepEqual(groupAirlines(rows, { measure: 'deps', flights: 'all' }).groups.map((g) => g.id), ['delta', 'southwest', 'fedex']);
  const intl = groupAirlines(rows, { measure: 'deps', service: 'international' }).groups;
  assert.deepEqual(intl.map((g) => [g.id, g.value, g.firstYear]), [['delta', 10, 1991]]);
  assert.deepEqual(intl[0].members.map((m) => m.id), ['19790']);
});

test('freight is in short tons', () => {
  const { groups } = groupAirlines(rows, { measure: 'freight', flights: 'freight' });
  assert.equal(groups[0].value, 20);
});

test('a search matches a group or one of its members, and opens a group found through a member', () => {
  const byGroup = groupAirlines(rows, { measure: 'deps', q: 'delta' }).groups;
  assert.deepEqual(byGroup.map((g) => [g.id, g.matched, g.members.length]), [['delta', false, 2]]);
  const byMember = groupAirlines(rows, { measure: 'deps', q: 'northwest airlines' }).groups;
  assert.deepEqual(byMember.map((g) => [g.id, g.matched, g.members.map((m) => m.id)]), [['delta', true, ['19386']]]);  // the group's name has "Northwest" but not "Northwest Airlines"
  const legal = groupAirlines(rows, { measure: 'deps', q: 'airlines co' }).groups;
  assert.deepEqual(legal.map((g) => [g.id, g.matched, g.members.map((m) => m.id)]), [['southwest', true, ['19393']]]);
  assert.deepEqual(groupAirlines(rows, { measure: 'deps', q: 'nothing like it' }).groups, []);
  assert.equal(groupAirlines(rows, { measure: 'deps', q: 'airlines co' }).total, 180);  // shares stay of everything the filters leave
});

test('a group with nothing in the selection is left out, and shares do not divide by zero', () => {
  const none = rows.map((x) => ({ ...x, deps: 0 }));
  assert.deepEqual(groupAirlines(none, { measure: 'deps' }), { groups: [], total: 0 });
});

test('sortAirlines sorts groups and their members by name, first year or value, either way', () => {
  const { groups } = groupAirlines(rows, { measure: 'deps', flights: 'all' });
  assert.deepEqual(sortAirlines(groups, 'name', 'asc').map((g) => g.id), ['delta', 'fedex', 'southwest']);
  assert.deepEqual(sortAirlines(groups, 'firstYear', 'desc').map((g) => g.id), ['fedex', 'southwest', 'delta']);
  assert.deepEqual(sortAirlines(groups, 'value', 'asc').map((g) => g.id), ['fedex', 'southwest', 'delta']);
  const delta = sortAirlines(groups, 'value', 'asc').at(-1);
  assert.deepEqual(delta.members.map((m) => m.id), ['19386', '19790']);
  assert.deepEqual(groups.map((g) => g.id), ['delta', 'southwest', 'fedex']);  // the input is left alone
});

test('airlineQuery carries the measure and flights to an airline\'s own page, defaults left out', () => {
  assert.equal(airlineQuery({ measure: 'freight', flights: 'freight' }), '?measure=freight&flights=freight');
  assert.equal(airlineQuery({ measure: 'freight', flights: 'all' }), '?measure=freight');  // all flights is freight's default
  assert.equal(airlineQuery({ measure: 'passengers', flights: 'all' }), '?flights=all');
  assert.equal(airlineQuery({ measure: 'passengers', flights: 'passenger' }), '');
});

test('sharedQuery keeps only the settings both airline pages read', () => {
  assert.equal(sharedQuery('?measure=seats&flights=all&service=domestic&n=25&scale=busiest&theme=night&year=2019'), '?measure=seats&flights=all&service=domestic');
  assert.equal(sharedQuery('?n=25'), '');
  assert.equal(sharedQuery(''), '');
});

test('the limit works on airline groups and names them in its menu', () => {
  const { groups } = groupAirlines(rows, { measure: 'deps', flights: 'all' });
  assert.deepEqual(limitFamilies(groups, 'top2').shown.map((g) => g.id), ['delta', 'southwest']);
  assert.deepEqual(limitOptions('airlines', 'airline').map((o) => o.label),
    ['the top 15 airlines', 'the top 20 airlines', 'the top 50 airlines', 'every airline', 'airlines with at least 1%', 'airlines with at least 0.1%']);
});

test('a search the flight and route filters hide is found when they are widened', () => {
  const state = { measure: 'deps', q: 'federal' };
  assert.deepEqual(groupAirlines(rows, state).groups, []);
  assert.equal(matchesElsewhere(rows, state), 1);
  assert.equal(matchesElsewhere(rows, { measure: 'deps', q: 'nothing like it' }), 0);
  assert.equal(matchesElsewhere(rows, { measure: 'deps', q: '' }), 0);
});
