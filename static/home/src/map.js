import { colourFor } from '../../globe/src/scale.js';

export const MAP_LABELS = 10;

// `a` blended into `b` by `f` (0 gives b), for #rrggbb colours
export function mix(a, b, f) {
  const ch = (hex, i) => parseInt(hex.slice(i, i + 2), 16);
  return `#${[1, 3, 5].map((i) => Math.round(ch(a, i) * f + ch(b, i) * (1 - f)).toString(16).padStart(2, '0')).join('')}`;
}

// The map sits straight on the page, with no ocean behind it, so its land is a tint of the text colour
// on the page colour rather than the theme's land colour (which in some themes is almost the page colour).
export function mapColours(t) {
  return { land: mix(t.ui.fg, t.bg, 0.12), border: mix(t.ui.fg, t.bg, 0.3) };
}
const R_MIN = 2.5;
const R_MAX = 12;

// dot area in proportion to passengers
export function radiusFor(passengers, max) {
  const v = Math.max(0, Number(passengers) || 0);
  if (!(max > 0)) return R_MIN;
  return R_MIN + (R_MAX - R_MIN) * Math.sqrt(Math.min(1, v / max));
}

// screen positions for points ({code, pos: [lon, lat], passengers}); those the projection can't place are listed by code
export function placeOnMap(points, proj) {
  const max = Math.max(0, ...points.map((p) => Number(p.passengers) || 0));
  const placed = [];
  const dropped = [];
  for (const p of points) {
    const xy = proj(p.pos);
    if (!xy) { dropped.push(p.code); continue; }
    placed.push({ ...p, x: xy[0], y: xy[1], r: radiusFor(p.passengers, max) });
  }
  return { placed, dropped };
}

// the smallest dot within `slop` px of (x, y), so a small airport next to a big one can still be picked
export function hitTest(placed, x, y, slop = 4) {
  let best = -1;
  for (let i = 0; i < placed.length; i++) {
    const p = placed[i];
    if (Math.hypot(p.x - x, p.y - y) <= p.r + slop && (best < 0 || p.r < placed[best].r)) best = i;
  }
  return best;
}

// scene: {w, h, path (d3.geoPath on the context), frames, nation, borders, placed, theme, highlight}
export function drawMap(ctx, { w, h, path, frames, nation, borders, placed, theme: t, highlight = -1 }) {
  const c = mapColours(t);
  ctx.clearRect(0, 0, w, h);
  ctx.beginPath();
  path(nation);
  ctx.fillStyle = c.land;
  ctx.fill();
  ctx.beginPath();
  path(borders);
  ctx.lineWidth = 0.5;
  ctx.strokeStyle = c.border;
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = c.border;
  for (const [[x0, y0], [x1, y1]] of frames) ctx.strokeRect(Math.round(x0) + 0.5, Math.round(y0) + 0.5, Math.round(x1 - x0), Math.round(y1 - y0));

  // big dots first so small ones stay visible on top
  const order = placed.map((p, i) => i).sort((a, b) => placed[b].r - placed[a].r);
  for (const i of order) {
    const p = placed[i];
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + (i === highlight ? 1.5 : 0), 0, Math.PI * 2);
    ctx.fillStyle = i === highlight ? t.ui.fg : colourFor('international');
    ctx.globalAlpha = i === highlight ? 1 : 0.75;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;
    ctx.strokeStyle = t.bg;
    ctx.stroke();
  }

  // the busiest airports (placed is busiest first) and the hovered one get their codes
  ctx.font = '600 11px -apple-system, system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = t.ui.fg;
  ctx.lineWidth = 3;
  ctx.strokeStyle = t.bg;
  placed.forEach((p, i) => {
    if (i >= MAP_LABELS && i !== highlight) return;
    ctx.strokeText(p.code, p.x + p.r + 3, p.y);
    ctx.fillText(p.code, p.x + p.r + 3, p.y);
  });
}
