// A map's view as the page's address carries it, so a link opens on the same place: "view=<lon>,<lat>,<zoom>", the longitude and
// latitude of the middle of the map (to a tenth of a degree, about 10 km) and the zoom (to a hundredth). The camera keeps the
// opposite, a rotation of [-lon, -lat], which is the same on the globe, the azimuthal map and the flat map's pan.
import { ZMIN, ZMAX, clamp } from './camera.js';

const round = (v, places) => String(Number(v.toFixed(places)) + 0); // + 0 turns -0 into 0

export function formatView(view) {
  return [round(-view.rot[0], 1), round(-view.rot[1], 1), round(view.zoom, 2)].join(',');
}

// { rot, zoom } for a "view" value, or null when it isn't three numbers (a link edited by hand, say), so the map opens as usual
export function parseView(text) {
  const parts = String(text ?? '').split(',');
  if (parts.length !== 3 || parts.some((p) => p.trim() === '')) return null;
  const [lon, lat, zoom] = parts.map(Number);
  if (![lon, lat, zoom].every(Number.isFinite)) return null;
  const wrapped = lon > 180 || lon < -180 ? ((lon + 540) % 360) - 180 : lon; // only when needed, so a tenth stays a tenth
  return { rot: [-wrapped, -clamp(lat, -90, 90)].map((v) => v + 0), zoom: clamp(zoom, ZMIN, ZMAX) };
}
