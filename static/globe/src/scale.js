export const SERVICE_COLOURS = { international: '#ff5a00', domestic: '#2a9df4' };

export const colourFor = (service) => SERVICE_COLOURS[service] ?? SERVICE_COLOURS.international;

export function widthFor(value, max, lo = 0.6, hi = 4.5) {
  const v = Number(value);
  if (!(v > 0) || !(max > 0)) return lo;
  return lo + (hi - lo) * Math.sqrt(Math.min(1, v / max));
}

export function maxOf(routes, key) {
  let m = 0;
  for (const r of routes) {
    const v = Number(r[key]);
    if (v > m) m = v;
  }
  return m;
}
