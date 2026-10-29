import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFocus, focusSearch } from '../src/focus.js';

test('the marked year is year= when the chart shows it, else none', () => {
  const domain = ['2014', '2015', '2016'];
  assert.equal(parseFocus('?year=2015', domain), '2015');
  assert.equal(parseFocus('?year=1999', domain), null);  // outside the years shown: ignored, the chart isn't widened
  assert.equal(parseFocus('?year=junk', domain), null);
  assert.equal(parseFocus('', domain), null);
});

test("a link to a route's chart over time carries the year in focus; any other link drops it", () => {
  const search = '?measure=seats&year=2015&dir=out';
  assert.equal(focusSearch('/airports/STL/ORD', search, 2015), '?measure=seats&dir=out&year=2015');
  assert.equal(focusSearch('/airports/ORD/STL', search, 2015), '?measure=seats&dir=out&year=2015');  // the other way, marked too
  assert.equal(focusSearch('/airports/STL/ORD/table', search, 2015), '?measure=seats&dir=out');
  assert.equal(focusSearch('/airports/STL/ORD/2016', search, 2015), '?measure=seats&dir=out');
  assert.equal(focusSearch('/airports/STL/ORD', '?measure=seats', null), '?measure=seats');
  assert.equal(focusSearch('/airports/STL/ORD/2016', '?year=2015', 2015), '');
});
