import { SERVICE_COLOURS, colourFor, maxOf } from './scale.js';

// Kept routes take the theme's muted colour, so what changed stands out
export const CHANGE_COLOURS = { added: '#4dac26', dropped: '#c51b7d' };
export const SERVICES = ['domestic', 'international'];
export const STATUSES = ['added', 'kept', 'dropped'];
const HIDEABLE = [...SERVICES, ...STATUSES];
const LABELS = { domestic: 'Domestic', international: 'International', added: 'Added', kept: 'Kept', dropped: 'Dropped' };

const canonical = (keys) => HIDEABLE.filter((k) => keys.has(k));

// ?colour=service|change&hide=domestic,dropped. The older ?service=domestic (still carried by the nav) means "hide international".
export function parseStyle(search) {
  const q = new URLSearchParams(search || '');
  const colour = ['service', 'change'].includes(q.get('colour')) ? q.get('colour') : null;
  const hide = new Set((q.get('hide') || '').split(',').filter((k) => HIDEABLE.includes(k)));
  const service = q.get('service');
  if (SERVICES.includes(service)) for (const s of SERVICES) if (s !== service) hide.add(s);
  return { colour, hide: canonical(hide) };
}

export function styleParams({ colour, hide }) {
  const out = {};
  if (colour) out.colour = colour;
  if (hide.length) out.hide = hide.join(',');
  return out;
}

// change only means something with two years to compare; comparing defaults to it
export const colourMode = (colour, comparing) => (comparing ? colour ?? 'change' : 'service');

export function toggleHide(hide, key) {
  const s = new Set(hide);
  if (s.has(key)) s.delete(key); else s.add(key);
  return canonical(s);
}

export const visibleRoutes = (routes, hide, comparing) =>
  routes.filter((r) => !hide.includes(r.service) && !(comparing && r.status && hide.includes(r.status)));

// fainter as more routes crowd the map, so a big network doesn't turn into a smear; the busiest stay strongest
export function alphaFor(n, value, max) {
  const base = Math.min(0.85, Math.max(0.12, 0.85 * Math.sqrt(30 / Math.max(1, n))));
  const v = Number(value);
  const w = v > 0 && max > 0 ? Math.sqrt(Math.min(1, v / max)) : 0;
  return Math.min(0.9, Math.max(0.08, base * (0.6 + 0.9 * w)));
}

export function styleRoutes(routes, { mode, theme, widthKey }) {
  const max = maxOf(routes, widthKey);
  return routes.map((r) => ({
    colour: mode === 'change' ? CHANGE_COLOURS[r.status] ?? theme.ui.muted : colourFor(r.service),
    alpha: alphaFor(routes.length, r[widthKey], max),
    dashed: r.status === 'dropped',
  }));
}

// The legend's chips: one group per dimension, the coloured one with swatches. Counts are before hiding,
// so a hidden chip still says how many routes it would bring back.
export function legendItems({ mode, comparing, hide, routes }) {
  const item = (key, field, colour) => ({
    key, label: LABELS[key], count: routes.filter((r) => r[field] === key).length,
    colour, dashed: key === 'dropped', hidden: hide.includes(key),
  });
  const groups = [{ name: 'service', items: ['international', 'domestic'].map((s) => item(s, 'service', mode === 'service' ? SERVICE_COLOURS[s] : null)) }];
  if (comparing) {
    groups.push({ name: 'change', items: STATUSES.map((s) => item(s, 'status', mode === 'change' ? CHANGE_COLOURS[s] ?? 'var(--muted)' : null)) });
  }
  return groups;
}
