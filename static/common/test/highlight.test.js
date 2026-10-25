import test from 'node:test';
import assert from 'node:assert/strict';
import { seriesByFill, parseHighlight, highlightedSeries, highlightMessage } from '../highlight.js';

test('seriesByFill maps each colour to the series drawn in it', () => {
  const lookup = seriesByFill({ domain: ['737 NG', '737 MAX', 'Other'], range: ['#7f1d1d', '#9e261f', '#a1a1aa'] });
  assert.equal(lookup('#7f1d1d'), '737 NG');
  assert.equal(lookup('#A1A1AA'), 'Other', 'case does not matter');
  assert.equal(lookup('rgb(158, 38, 31)'), '737 MAX', 'a computed rgb() colour works too');
  assert.equal(lookup('#000000'), null);
  assert.equal(lookup(null), null);
});

test('series sharing the last step highlight together, as the first of them', () => {
  const lookup = seriesByFill({ domain: ['A', 'B', 'C'], range: ['#111111', '#222222', '#222222'] });
  assert.equal(lookup('#222222'), 'B');
});

test('parseHighlight reads airline:{id} and ignores anything else', () => {
  assert.deepEqual(parseHighlight('?highlight=airline:delta&split=carrier'), { kind: 'airline', id: 'delta' });
  for (const s of ['', '?highlight=delta', '?highlight=airline:', '?highlight=version:737-800', '?x=1']) assert.equal(parseHighlight(s), null, s);
});

test('highlightedSeries finds every series an airline group appears in', () => {
  const rows = [{ group_id: 'delta', carrier: 'Delta' }, { group_id: 'delta', carrier: 'Northwest' }, { group_id: 'jetblue', carrier: 'JetBlue' }];
  const label = (r) => r.carrier;
  assert.deepEqual([...highlightedSeries(rows, { kind: 'airline', id: 'delta' }, label)].sort(), ['Delta', 'Northwest']);
  assert.equal(highlightedSeries(rows, { kind: 'airline', id: 'nope' }, label).size, 0);
  assert.equal(highlightedSeries(rows, null, label).size, 0);
});

test('highlightMessage says what the highlight line shows, and offers the other way when the airline is not on this one', () => {
  assert.equal(highlightMessage({ highlight: null }), null);
  assert.deepEqual(highlightMessage({ highlight: { kind: 'airline', id: 'fedex' }, name: undefined, byAirline: true, shown: false }),
    { text: "This airline doesn't fly this way", reverse: true });  // an airline's pages link pairs, which may be the direction it never flew
  assert.deepEqual(highlightMessage({ highlight: { kind: 'airline', id: 'delta' }, name: 'Delta', byAirline: true, shown: true }), { text: 'Highlighting Delta', reverse: false });
  assert.deepEqual(highlightMessage({ highlight: { kind: 'airline', id: 'delta' }, name: 'Delta', byAirline: true, shown: false }), { text: "Delta doesn't appear here", reverse: false });
  assert.deepEqual(highlightMessage({ highlight: { kind: 'airline', id: 'delta' }, name: 'Delta', byAirline: false, splitLabel: 'aircraft', shown: false }),
    { text: "Delta isn't shown when split by aircraft", reverse: false });
});
