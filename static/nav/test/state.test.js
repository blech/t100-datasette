import test from 'node:test';
import assert from 'node:assert/strict';
import { targetOf, carryParams, decorate, replaceSearch } from '../src/state.js';

test('targetOf recognises the site pages and nothing else', () => {
  assert.equal(targetOf('/'), 'home');
  assert.equal(targetOf('/globe'), 'globe');
  assert.equal(targetOf('/airports/ATL/globe'), 'globe');
  assert.equal(targetOf('/airports/globe'), 'globe');
  assert.equal(targetOf('/airports'), 'home');
  assert.equal(targetOf('/airports/ATL'), 'airport');
  assert.equal(targetOf('/airports/ATL/destinations'), 'routes');
  assert.equal(targetOf('/airports/ATL/changes'), 'changes');
  assert.equal(targetOf('/airports/ATL/LAX'), 'route');
  assert.equal(targetOf('/airports/ATL/LAX/2024'), 'route');
  for (const p of ['/t100', '/-/', '/static/x.js', '#toggle:a', 'https://example.com/airports/ATL', '', '/globe/ATL', '/routes/ATL', '/route/ATL/LAX', '/airports/ATL/LAX/2024/01']) assert.equal(targetOf(p), null, p);
});

test('home keeps only the theme', () => {
  assert.deepEqual(carryParams('?theme=dark&measure=deps&service=domestic', 'home'), { theme: 'dark' });
});

test('an explicit theme is carried, light included, since the default follows the system', () => {
  assert.deepEqual(carryParams('?theme=light', 'routes'), { theme: 'light' });
});

test('default values and unknown or retired themes are not carried', () => {
  assert.deepEqual(carryParams('?service=all&measure=passengers', 'routes'), {});
  assert.deepEqual(carryParams('?theme=night', 'home'), {});
  assert.deepEqual(carryParams('?theme=bogus&service=bogus&measure=bogus&group=bogus&n=7', 'routes'), {});
});

test('routes pages carry the matrix settings', () => {
  assert.deepEqual(
    carryParams('?measure=deps&service=domestic&group=city&n=50&open=ATL&year=2020', 'routes'),
    { measure: 'deps', service: 'domestic', group: 'city', n: '50' },
  );
});

test('the ranking year follows the routes pages but is not carried to the globe or the home page', () => {
  assert.deepEqual(carryParams('?rank=latest&measure=deps', 'routes'), { measure: 'deps', rank: 'latest' });
  assert.deepEqual(carryParams('?rank=latest', 'route'), { rank: 'latest' });
  assert.deepEqual(carryParams('?rank=latest', 'globe'), {});
  assert.deepEqual(carryParams('?rank=latest', 'home'), {});
  assert.deepEqual(carryParams('?rank=all&rank=bogus', 'routes'), {});
});

test('colouring by year follows the routes pages like the ranking does', () => {
  assert.deepEqual(carryParams('?scale=year&rank=latest', 'routes'), { rank: 'latest', scale: 'year' });
  assert.deepEqual(carryParams('?scale=year', 'route'), { scale: 'year' });
  assert.deepEqual(carryParams('?scale=busiest', 'routes'), { scale: 'busiest' });
  assert.deepEqual(carryParams('?scale=year', 'globe'), {});
  assert.deepEqual(carryParams('?scale=absolute&scale=bogus', 'routes'), {});
});

test('route pages pass the matrix settings through and accept load factor', () => {
  assert.deepEqual(carryParams('?measure=load_factor&split=aircraft&group=city', 'route'), { measure: 'load_factor', group: 'city' });
  assert.deepEqual(carryParams('?measure=load_factor', 'routes'), {});
});

test('globe takes service and width, and width and measure translate', () => {
  assert.deepEqual(carryParams('?measure=deps&service=international&theme=dark&n=50', 'globe'), { theme: 'dark', service: 'international', width: 'deps' });
  assert.deepEqual(carryParams('?measure=seats', 'globe'), {});
  assert.deepEqual(carryParams('?width=freight', 'routes'), { measure: 'freight' });
  assert.deepEqual(carryParams('?width=freight&measure=deps', 'routes'), { measure: 'deps' });
});

test('decorate adds carried settings to a path', () => {
  assert.deepEqual(decorate('/airports/MCO/destinations', '?measure=deps&service=domestic'), { href: '/airports/MCO/destinations?measure=deps&service=domestic', keys: ['measure', 'service'] });
});

test('an airport\'s charts take the measure only, and its changes only the theme', () => {
  assert.deepEqual(decorate('/airports/MCO', '?measure=deps&service=domestic&n=50&scale=year'), { href: '/airports/MCO?measure=deps', keys: ['measure'] });
  assert.deepEqual(carryParams('?measure=passengers&group=city&rank=latest', 'airport'), {});
  assert.equal(decorate('/airports/MCO/changes', '?measure=deps&theme=dark').href, '/airports/MCO/changes?theme=dark');
});

test('decorate keeps a link\'s own parameters and never overrides them', () => {
  const r = decorate('/airports/ATL/globe?year=2025&service=international', '?service=domestic&theme=dark');
  assert.deepEqual(new URL(r.href, 'http://x').searchParams.getAll('service'), ['international']);
  assert.equal(new URL(r.href, 'http://x').searchParams.get('year'), '2025');
  assert.equal(new URL(r.href, 'http://x').searchParams.get('theme'), 'dark');
  assert.deepEqual(r.keys, ['theme']);
});

test('decorate replaces what it added before, so a changed setting does not go stale', () => {
  const first = decorate('/airports/MCO', '?theme=dark&measure=deps');
  const second = decorate(first.href, '?theme=dark', first.keys);
  assert.equal(second.href, '/airports/MCO?theme=dark');
  assert.deepEqual(second.keys, ['theme']);
  assert.equal(decorate(second.href, '', second.keys).href, '/airports/MCO');
});

test('decorate leaves other links alone and keeps hashes', () => {
  assert.deepEqual(decorate('/t100/route?origin=ATL', '?theme=dark'), { href: '/t100/route?origin=ATL', keys: [] });
  assert.deepEqual(decorate('#toggle:a', '?theme=dark'), { href: '#toggle:a', keys: [] });
  assert.equal(decorate('/airports/MCO#top', '?theme=dark').href, '/airports/MCO?theme=dark#top');
});

test('replaceSearch swaps a page\'s own keys and keeps everything else', () => {
  assert.equal(replaceSearch('?theme=dark&year=2020&sort=deps', ['year', 'sort'], '?year=2021'), '?theme=dark&year=2021');
  assert.equal(replaceSearch('?theme=dark&year=2020', ['year'], ''), '?theme=dark');
  assert.equal(replaceSearch('?year=2020', ['year'], ''), '');
});

test('a map hiding one service carries the other as the service setting', () => {
  assert.deepEqual(carryParams('?hide=international,dropped', 'routes'), { service: 'domestic' });
  assert.deepEqual(carryParams('?hide=domestic', 'globe'), { service: 'international' });
  assert.deepEqual(carryParams('?hide=domestic,international', 'routes'), {});
  assert.deepEqual(carryParams('?hide=kept', 'routes'), {});
  assert.deepEqual(carryParams('?hide=domestic&service=domestic', 'routes'), { service: 'domestic' });
});
