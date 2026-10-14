import test from 'node:test';
import assert from 'node:assert/strict';
import { targetOf, carryParams, decorate, replaceSearch } from '../src/state.js';

test('targetOf recognises the site pages and nothing else', () => {
  assert.equal(targetOf('/'), 'home');
  assert.equal(targetOf('/globe'), 'globe');
  assert.equal(targetOf('/globe/ATL'), 'globe');
  assert.equal(targetOf('/routes'), 'routes');
  assert.equal(targetOf('/routes/ATL'), 'routes');
  assert.equal(targetOf('/route/ATL/LAX/2024'), 'route');
  for (const p of ['/t100', '/-/', '/static/x.js', '#toggle:a', 'https://example.com/routes/ATL', '']) assert.equal(targetOf(p), null, p);
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
  assert.deepEqual(decorate('/routes/MCO', '?measure=deps&service=domestic'), { href: '/routes/MCO?measure=deps&service=domestic', keys: ['measure', 'service'] });
});

test('decorate keeps a link\'s own parameters and never overrides them', () => {
  const r = decorate('/globe/ATL?year=2025&service=international', '?service=domestic&theme=night');
  assert.deepEqual(new URL(r.href, 'http://x').searchParams.getAll('service'), ['international']);
  assert.equal(new URL(r.href, 'http://x').searchParams.get('year'), '2025');
  assert.equal(new URL(r.href, 'http://x').searchParams.get('theme'), 'night');
  assert.deepEqual(r.keys, ['theme']);
});

test('decorate replaces what it added before, so a changed setting does not go stale', () => {
  const first = decorate('/routes/MCO', '?theme=night&measure=deps');
  const second = decorate(first.href, '?theme=natural', first.keys);
  assert.equal(second.href, '/routes/MCO?theme=natural');
  assert.deepEqual(second.keys, ['theme']);
  assert.equal(decorate(second.href, '', second.keys).href, '/routes/MCO');
});

test('decorate leaves other links alone and keeps hashes', () => {
  assert.deepEqual(decorate('/t100/route?origin=ATL', '?theme=night'), { href: '/t100/route?origin=ATL', keys: [] });
  assert.deepEqual(decorate('#toggle:a', '?theme=night'), { href: '#toggle:a', keys: [] });
  assert.equal(decorate('/routes/MCO#top', '?theme=night').href, '/routes/MCO?theme=night#top');
});

test('replaceSearch swaps a page\'s own keys and keeps everything else', () => {
  assert.equal(replaceSearch('?theme=night&year=2020&sort=deps', ['year', 'sort'], '?year=2021'), '?theme=night&year=2021');
  assert.equal(replaceSearch('?theme=night&year=2020', ['year'], ''), '?theme=night');
  assert.equal(replaceSearch('?year=2020', ['year'], ''), '');
});
