import { THEMES, DEFAULT_THEME } from '../../globe/src/themes.js';

// Settings that follow a visitor from page to page, and which pages they mean something to.
const SERVICES = ['domestic', 'international'];
const HEAT_MEASURES = ['passengers', 'deps', 'seats', 'freight'];
const WIDTHS = ['passengers', 'deps', 'freight'];

export function targetOf(href) {
  if (typeof href !== 'string' || !href.startsWith('/') || href.startsWith('//')) return null;
  const path = href.split(/[?#]/)[0];
  if (path === '/') return 'home';
  if (/^\/globe(\/[^/]+)?$/.test(path)) return 'globe';
  if (/^\/routes(\/[^/]+)?$/.test(path)) return 'routes';
  if (/^\/route\/[^/]+\/[^/]+(\/\d{4})?$/.test(path)) return 'route';
  return null;
}

// The settings in `search` that make sense on `target`, with defaults left out.
export function carryParams(search, target) {
  const q = new URLSearchParams(search || '');
  const out = {};
  const theme = q.get('theme');
  if (Object.hasOwn(THEMES, theme) && theme !== DEFAULT_THEME) out.theme = theme;
  if (target === 'home') return out;
  const service = q.get('service');
  const measure = q.get('measure') ?? q.get('width');
  if (target === 'globe') {
    if (SERVICES.includes(service)) out.service = service;
    if (WIDTHS.includes(measure) && measure !== 'passengers') out.width = measure;
    return out;
  }
  const allowed = target === 'route' ? [...HEAT_MEASURES, 'load_factor'] : HEAT_MEASURES;
  if (allowed.includes(measure) && measure !== 'passengers') out.measure = measure;
  if (SERVICES.includes(service)) out.service = service;
  if (q.get('group') === 'city') out.group = 'city';
  if (['10', '50'].includes(q.get('n'))) out.n = q.get('n');
  if (q.get('rank') === 'latest') out.rank = 'latest';
  return out;
}

// Add the carried settings to an in-site link. `previous` lists keys added by an earlier call,
// which are removed first so a changed setting replaces its old value. A link's own parameters win.
export function decorate(href, search, previous = []) {
  if (targetOf(href) === null) return { href, keys: [] };
  const [rest, ...hash] = href.split('#');
  const [path, query = ''] = rest.split('?');
  const q = new URLSearchParams(query);
  for (const k of previous) q.delete(k);
  const keys = [];
  for (const [k, v] of Object.entries(carryParams(search, targetOf(href)))) {
    if (q.has(k)) continue;
    q.set(k, v);
    keys.push(k);
  }
  const s = q.toString();
  return { href: `${path}${s ? `?${s}` : ''}${hash.length ? `#${hash.join('#')}` : ''}`, keys };
}

// A page's own state replaces its own keys in the address bar; everything else (theme, carried settings) stays.
export function replaceSearch(current, ownKeys, ownSearch) {
  const q = new URLSearchParams(current || '');
  for (const k of ownKeys) q.delete(k);
  new URLSearchParams(ownSearch || '').forEach((v, k) => q.set(k, v));
  const s = q.toString();
  return s ? `?${s}` : '';
}
