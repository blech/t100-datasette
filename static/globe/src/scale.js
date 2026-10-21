import { palette } from '../../common/palette.js';

// a route's colour by service, from the site palette; anything unknown counts as international
export const colourFor = (service, dark = false) => palette(dark).service[service] ?? palette(dark).service.international;

export function widthFor(value, max, lo = 0.6, hi = 4.5) {
  const v = Number(value);
  if (!(v > 0) || !(max > 0)) return lo;
  return lo + (hi - lo) * Math.sqrt(Math.min(1, v / max));
}

// dash and gap grow with the line, so its round caps never close the gap and a thick dropped route still reads as dashed
export const dashFor = (width) => [5 + width, 4 + width];

export function maxOf(routes, key) {
  let m = 0;
  for (const r of routes) {
    const v = Number(r[key]);
    if (v > m) m = v;
  }
  return m;
}
