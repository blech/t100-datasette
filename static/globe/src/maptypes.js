// What every map (an airport's, an airline's, the busiest routes) offers alike: the map types, where each opens, the
// keys, and fitting the routes into the clear part of the window.
import { clamp } from './camera.js';
import { isPlanar } from './renderer.js';

// in menu order, which is also the 1–3 keys' order: the value kept in ?proj= (also the renderer's mode) and the menu's label
export const MAP_TYPES = [
  { value: 'globe', label: 'Globe' },
  { value: 'flat', label: 'Equal Earth' },
  { value: 'azimuthal', label: 'Azimuthal' },
];
export const DEFAULT_MAP_TYPE = 'globe';

// a ?proj= value, or the globe for anything else (old links' equirect, kansas and pole included)
export const parseMapType = (v) => (MAP_TYPES.some((t) => t.value === v) ? v : DEFAULT_MAP_TYPE);

// ?sea=plain draws the land on the page colour with no sea: a setting kept in the address alone, with no menu
export const parseSea = (v) => (v === 'plain' ? 'plain' : 'sea');

// The view's rotation that puts [lon, lat] in the middle: the globe tilts no further than 70° so a pole never faces you
// square on; the flat map (which pans north-south) and the azimuthal map go right over it.
export function centreRot(type, [lon, lat]) {
  return [-lon, type === 'globe' ? clamp(-lat, -70, 70) : clamp(-lat, -90, 90)];
}

// Where a map type opens on a map centred on [lon, lat]: as centreRot, except that the flat map opens on the equator.
export function openingRot(type, centre) {
  const rot = centreRot(type, centre);
  return type === 'flat' ? [rot[0], 0] : rot;
}

// the map-type menu's options, from MAP_TYPES; `azimuthalTitle` says where that map is centred (a hover title)
export function fillMapTypeMenu(select, value, azimuthalTitle = '') {
  select.replaceChildren(...MAP_TYPES.map((t) => {
    const o = Object.assign(document.createElement('option'), { value: t.value, textContent: t.label });
    if (t.value === 'azimuthal' && azimuthalTitle) o.title = azimuthalTitle;
    return o;
  }));
  select.value = value;
}

// The key that a keydown means, or null: 'prev' and 'next' (← →), 'play' (space), or a map type (1–3). Keys with a
// modifier, and keys typed into a menu or a text box, are left alone (a range slider's own arrows are taken over).
export function mapKey(e) {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  if (e.target?.closest?.('select, textarea, input:not([type=range]), [contenteditable]')) return null;
  if (e.key === 'ArrowLeft') return 'prev';
  if (e.key === 'ArrowRight') return 'next';
  if (e.key === ' ') return 'play';
  if (/^[1-9]$/.test(e.key) && Number(e.key) <= MAP_TYPES.length) return MAP_TYPES[Number(e.key) - 1].value;
  return null;
}

// ← → call step(-1 or 1), space play(), 1–3 mapType(value)
export function bindMapKeys({ step, play, mapType }) {
  document.addEventListener('keydown', (e) => {
    const k = mapKey(e);
    if (!k) return;
    e.preventDefault();
    if (k === 'prev' || k === 'next') step(k === 'prev' ? -1 : 1);
    else if (k === 'play') play();
    else mapType(k);
  });
}

// The window's clear area, between the header and the controls, with room left for labels: what Fit routes fills.
export function clearBox() {
  return {
    left: 48, right: innerWidth - 64,
    top: document.getElementById('header').getBoundingClientRect().bottom + 24,
    bottom: document.getElementById('controls').getBoundingClientRect().top - 16,
  };
}

// The view that fits `points` ([lon, lat]) into the clear area: the globe turns and zooms, the flat and azimuthal maps
// move their middle and zoom. With keepCentre (an airport's azimuthal map, whose distances are true only from the
// airport) the middle stays put and only the zoom changes. Null when there's nothing to fit.
export function fitRoutes(renderer, points, { keepCentre = false } = {}) {
  if (!points.length) return null;
  const box = clearBox();
  return isPlanar(renderer.mode) ? renderer.fitPlanar(points, box, { keepCentre }) : renderer.fit(points, box);
}
