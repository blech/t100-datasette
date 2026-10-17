import test from 'node:test';
import assert from 'node:assert/strict';
import { targetOf, carryParams, decorate, replaceSearch } from '../src/state.js';

test('targetOf recognises the site pages and nothing else', () => {
  assert.equal(targetOf('/'), 'home');
  assert.equal(targetOf('/globe'), 'globe');
  assert.equal(targetOf('/airports/ATL/globe'), 'globe');
  assert.equal(targetOf('/airports'), 'home');
  assert.equal(targetOf('/airports/ATL'), 'routes');
  assert.equal(targetOf('/airports/ATL/LAX'), 'route');
  assert.equal(targetOf('/airports/ATL/LAX/2024'), 'route');
  for (const p of ['/t100', '/-/', '/static/x.js', '#toggle:a', 'https://example.com/airports/ATL', '', '/globe/ATL', '/routes/ATL', '/route/ATL/LAX', '/airports/ATL/LAX/2024/01']) assert.equal(targetOf(p), null, p);
});

test('home keeps only the theme', () => {
  assert.deepEqual(carryParams('?theme=night&measure=deps&service=domestic', 'home'), { theme: 'night' });
});

test('the default theme and default values are not carried', () => {
  assert.deepEqual(carryParams('?theme=paper&service=all&measure=passengers', 'routes'), {});
  assert.deepEqual(carryParams('?theme=bogus&service=bogus&measure=bogus&group=bogus&n=7', 'routes'), {});
});

test('routes pages carry the heat map settings', () => {
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

test('route pages pass the heat map settings through and accept load factor', () => {
  assert.deepEqual(carryParams('?measure=load_factor&split=aircraft&group=city', 'route'), { measure: 'load_factor', group: 'city' });
  assert.deepEqual(carryParams('?measure=load_factor', 'routes'), {});
});

test('globe takes service and width, and width and measure translate', () => {
  assert.deepEqual(carryParams('?measure=deps&service=international&theme=night&n=50', 'globe'), { theme: 'night', service: 'international', width: 'deps' });
  assert.deepEqual(carryParams('?measure=seats', 'globe'), {});
  assert.deepEqual(carryParams('?width=freight', 'routes'), { measure: 'freight' });
  assert.deepEqual(carryParams('?width=freight&measure=deps', 'routes'), { measure: 'deps' });
});

test('decorate adds carried settings to a path', () => {
  assert.deepEqual(decorate('/airports/MCO', '?measure=deps&service=domestic'), { href: '/airports/MCO?measure=deps&service=domestic', keys: ['measure', 'service'] });
});

test('decorate keeps a link\'s own parameters and never overrides them', () => {
  const r = decorate('/airports/ATL/globe?year=2025&service=international', '?service=domestic&theme=night');
  assert.deepEqual(new URL(r.href, 'http://x').searchParams.getAll('service'), ['international']);
  assert.equal(new URL(r.href, 'http://x').searchParams.get('year'), '2025');
  assert.equal(new URL(r.href, 'http://x').searchParams.get('theme'), 'night');
  assert.deepEqual(r.keys, ['theme']);
});

test('decorate replaces what it added before, so a changed setting does not go stale', () => {
  const first = decorate('/airports/MCO', '?theme=night&measure=deps');
  const second = decorate(first.href, '?theme=natural', first.keys);
  assert.equal(second.href, '/airports/MCO?theme=natural');
  assert.deepEqual(second.keys, ['theme']);
  assert.equal(decorate(second.href, '', second.keys).href, '/airports/MCO');
});

test('decorate leaves other links alone and keeps hashes', () => {
  assert.deepEqual(decorate('/t100/route?origin=ATL', '?theme=night'), { href: '/t100/route?origin=ATL', keys: [] });
  assert.deepEqual(decorate('#toggle:a', '?theme=night'), { href: '#toggle:a', keys: [] });
  assert.equal(decorate('/airports/MCO#top', '?theme=night').href, '/airports/MCO?theme=night#top');
});

test('replaceSearch swaps a page\'s own keys and keeps everything else', () => {
  assert.equal(replaceSearch('?theme=night&year=2020&sort=deps', ['year', 'sort'], '?year=2021'), '?theme=night&year=2021');
  assert.equal(replaceSearch('?theme=night&year=2020', ['year'], ''), '?theme=night');
  assert.equal(replaceSearch('?year=2020', ['year'], ''), '');
});

test('a map hiding one service carries the other as the service setting', () => {
  assert.deepEqual(carryParams('?hide=international,dropped', 'routes'), { service: 'domestic' });
  assert.deepEqual(carryParams('?hide=domestic', 'globe'), { service: 'international' });
  assert.deepEqual(carryParams('?hide=domestic,international', 'routes'), {});
  assert.deepEqual(carryParams('?hide=kept', 'routes'), {});
  assert.deepEqual(carryParams('?hide=domestic&service=domestic', 'routes'), { service: 'domestic' });
});
