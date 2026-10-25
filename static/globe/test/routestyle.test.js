import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseStyle, styleParams, colourMode, toggleHide, visibleRoutes, alphaFor, styleRoutes, legendItems,
} from '../src/routestyle.js';
import { palette } from '../../common/palette.js';

test('parseStyle defaults to no colour choice and nothing hidden', () => {
  assert.deepEqual(parseStyle(''), { colour: null, hide: [] });
  assert.deepEqual(parseStyle('?colour=change&hide=dropped,domestic'), { colour: 'change', hide: ['domestic', 'dropped'] });
});

test('parseStyle ignores junk and repeats, and keeps a canonical order', () => {
  assert.deepEqual(parseStyle('?colour=rainbow&hide=dropped,,nope,dropped,international,__proto__'), { colour: null, hide: ['international', 'dropped'] });
});

test('the old ?service= means hiding the other service', () => {
  assert.deepEqual(parseStyle('?service=domestic').hide, ['international']);
  assert.deepEqual(parseStyle('?service=international&hide=kept').hide, ['domestic', 'kept']);
  assert.deepEqual(parseStyle('?service=all').hide, []);
});

test('styleParams leaves out defaults and round-trips', () => {
  assert.deepEqual(styleParams({ colour: null, hide: [] }), {});
  const p = styleParams({ colour: 'service', hide: ['domestic', 'dropped'] });
  assert.deepEqual(p, { colour: 'service', hide: 'domestic,dropped' });
  assert.deepEqual(parseStyle(`?${new URLSearchParams(p)}`), { colour: 'service', hide: ['domestic', 'dropped'] });
});

test('colourMode is service unless comparing, and change by default when comparing', () => {
  assert.equal(colourMode(null, false), 'service');
  assert.equal(colourMode('change', false), 'service');
  assert.equal(colourMode(null, true), 'change');
  assert.equal(colourMode('service', true), 'service');
});

test('toggleHide adds and removes, in canonical order', () => {
  assert.deepEqual(toggleHide([], 'dropped'), ['dropped']);
  assert.deepEqual(toggleHide(['dropped'], 'domestic'), ['domestic', 'dropped']);
  assert.deepEqual(toggleHide(['domestic', 'dropped'], 'domestic'), ['dropped']);
});

const route = (service, status, passengers = 100) => ({ service, status, passengers });

test('visibleRoutes hides by service always and by status only when comparing', () => {
  const routes = [route('domestic', 'kept'), route('international', 'dropped'), route('domestic', 'added')];
  assert.equal(visibleRoutes(routes, ['domestic'], true).length, 1);
  assert.equal(visibleRoutes(routes, ['dropped'], true).length, 2);
  assert.equal(visibleRoutes(routes, ['dropped'], false).length, 3);
  assert.deepEqual(visibleRoutes(routes, ['domestic', 'international'], true), []);
  assert.deepEqual(visibleRoutes([], ['kept'], true), []);
});

test('alphaFor falls as more routes are shown and rises with a route\'s size', () => {
  assert.ok(alphaFor(1000, 10, 100) < alphaFor(10, 10, 100));
  assert.ok(alphaFor(500, 100, 100) > alphaFor(500, 1, 100));
});

test('alphaFor stays a finite number between 0.08 and 0.9 at the extremes', () => {
  for (const n of [0, 1, 30, 5000, 1e6]) {
    for (const [v, max] of [[0, 0], [undefined, 100], [NaN, 100], [-5, 100], [100, 100], [1e9, 100], [50, 0]]) {
      const a = alphaFor(n, v, max);
      assert.ok(Number.isFinite(a) && a >= 0.08 && a <= 0.9, `n=${n} v=${v} max=${max} -> ${a}`);
    }
  }
});

const theme = { ui: { muted: '#777777' } };

test('styleRoutes colours by service or by change, kept in the theme\'s muted colour', () => {
  const routes = [route('domestic', 'kept'), route('international', 'added'), route('domestic', 'dropped')];
  const byService = styleRoutes(routes, { mode: 'service', theme, widthKey: 'passengers' });
  assert.deepEqual(byService.map((s) => s.colour), [palette(false).service.domestic, palette(false).service.international, palette(false).service.domestic]);
  const byChange = styleRoutes(routes, { mode: 'change', theme, widthKey: 'passengers' });
  assert.deepEqual(byChange.map((s) => s.colour), ['#777777', palette(false).change.added, palette(false).change.dropped]);
});

test('dropped routes are dashed whichever dimension is coloured', () => {
  const routes = [route('domestic', 'kept'), route('domestic', 'dropped'), route('domestic', null)];
  for (const mode of ['service', 'change']) {
    assert.deepEqual(styleRoutes(routes, { mode, theme, widthKey: 'passengers' }).map((s) => s.dashed), [false, true, false]);
  }
});

test('legendItems lists services always and changes only when comparing, with counts before hiding', () => {
  const routes = [route('domestic', 'kept'), route('domestic', 'added'), route('international', 'dropped')];
  const single = legendItems({ mode: 'service', comparing: false, hide: [], routes });
  assert.deepEqual(single.map((g) => g.name), ['service']);
  assert.deepEqual(single[0].items.map((i) => [i.key, i.count, i.colour]), [['international', 1, palette(false).service.international], ['domestic', 2, palette(false).service.domestic]]);

  const both = legendItems({ mode: 'change', comparing: true, hide: ['kept'], routes });
  assert.deepEqual(both.map((g) => g.name), ['service', 'change']);
  assert.deepEqual(both[0].items.map((i) => i.colour), [null, null]);
  assert.deepEqual(both[1].items.map((i) => [i.key, i.count, i.colour, i.dashed, i.hidden]), [
    ['added', 1, palette(false).change.added, false, false],
    ['kept', 1, 'var(--muted)', false, true],
    ['dropped', 1, palette(false).change.dropped, true, false],
  ]);
});

test('colouring by change, kept routes step back and changed ones come forward', () => {
  const routes = [route('domestic', 'kept'), route('domestic', 'added'), route('domestic', 'dropped'), ...Array(300).fill(route('domestic', 'kept', 10))];
  const [kept, added, dropped] = styleRoutes(routes, { mode: 'change', theme, widthKey: 'passengers' });
  assert.ok(added.alpha > kept.alpha * 2 && dropped.alpha > kept.alpha * 2, `${kept.alpha} ${added.alpha} ${dropped.alpha}`);
  const byService = styleRoutes(routes, { mode: 'service', theme, widthKey: 'passengers' });
  assert.equal(byService[0].alpha, byService[1].alpha);
  for (const s of styleRoutes(routes, { mode: 'change', theme, widthKey: 'passengers' })) assert.ok(s.alpha >= 0.08 && s.alpha <= 0.9);
});

test('the legend and styles follow the theme', () => {
  const routes = [{ service: 'domestic', status: 'added', passengers: 1 }];
  const dark = { ...theme, dark: true };
  assert.equal(styleRoutes(routes, { mode: 'service', theme: dark, widthKey: 'passengers' })[0].colour, palette(true).service.domestic);
  assert.equal(legendItems({ mode: 'service', comparing: false, hide: [], routes, dark: true })[0].items[1].colour, palette(true).service.domestic);
});
