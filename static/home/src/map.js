import { colourFor } from '../../globe/src/scale.js';

export const MAP_LABELS = 20; // the labels that fit; each is placed clear of the others, so more than the old 10 are shown
export const MAP_DOTS = 50;

// 1 -> "1st", 12 -> "12th", 23 -> "23rd"
export const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th')}`;

// "5th busiest city" (the busiest, for rank 1)
export const rankPhrase = (rank, group) => `${rank === 1 ? '' : `${ordinal(rank)} `}busiest ${group === 'city' ? 'city' : 'airport'}`;

// The busiest `n` airports, or the busiest `n` cities (BTS city markets, as /airports?group=city counts them): a city is one dot
// sized by its airports' passengers together, placed at their passenger-weighted centre, named for the place most of them are in,
// and carrying its busiest airport's code, and the address a click on it goes to (the city's page, or the airport's). Points are {code, city, pos: [lon, lat], passengers, marketId}.
const airportHref = (code) => `/airports/${encodeURIComponent(code)}`;
// a city's page is /airports/cities/<5-digit market id>; one without a market (or with an odd id) goes to its airport's page
const cityHref = (marketId, code) => (/^[0-9]{5}$/.test(String(marketId)) ? `/airports/cities/${marketId}` : airportHref(code));

export function topDots(points, group, n = MAP_DOTS) {
  if (group !== 'city') return points.slice(0, n).map((p) => ({ ...p, label: p.code, airports: [p.code], href: airportHref(p.code) }));
  const markets = new Map();
  for (const p of points) {
    const key = p.marketId ? `m${p.marketId}` : `a${p.code}`;
    const m = markets.get(key) || { members: [] };
    m.members.push(p);
    markets.set(key, m);
  }
  const dots = [...markets.values()].map(({ members }) => {
    const weight = (p) => Number(p.passengers) || 0;
    const total = members.reduce((t, p) => t + weight(p), 0);
    const at = (i) => (total > 0 ? members.reduce((t, p) => t + p.pos[i] * weight(p), 0) / total : members[0].pos[i]);
    const names = new Map();
    for (const p of members) names.set(p.city, (names.get(p.city) || 0) + weight(p));
    const city = [...names].sort((a, b) => b[1] - a[1])[0][0];
    const top = [...members].sort((a, b) => weight(b) - weight(a))[0];
    return { code: top.code, city, label: String(city).split(',')[0], pos: [at(0), at(1)], passengers: total, airports: members.map((p) => p.code), href: cityHref(top.marketId, top.code) };
  });
  return dots.sort((a, b) => b.passengers - a.passengers || a.code.localeCompare(b.code)).slice(0, n);
}

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
  separateDots(placed);
  return { placed, dropped };
}

// SPIKE, ported from the globe-presentation branch (renderer.js layoutDots, itself from scripts/flightmaps): push overlapping
// dots apart until they just touch, the bigger moving less, so NYC's or Dallas's airports each get their own dot
export function separateDots(dots, gap = 0.5, iterations = 120) {
  for (let it = 0; it < iterations; it++) {
    let moved = false;
    for (let i = 0; i < dots.length; i++) {
      const a = dots[i];
      for (let j = i + 1; j < dots.length; j++) {
        const b = dots[j];
        const dx = b.x - a.x, dy = b.y - a.y, need = a.r + b.r + gap;
        if (Math.abs(dx) >= need || Math.abs(dy) >= need) continue;
        const dist = Math.hypot(dx, dy);
        if (dist >= need) continue;
        const [ux, uy] = dist > 1e-9 ? [dx / dist, dy / dist] : [1, 0];
        const push = need - dist, ma = a.r * a.r, mb = b.r * b.r;
        a.x -= (ux * push * mb) / (ma + mb); a.y -= (uy * push * mb) / (ma + mb);
        b.x += (ux * push * ma) / (ma + mb); b.y += (uy * push * ma) / (ma + mb);
        moved = true;
      }
    }
    if (!moved) break;
  }
  return dots;
}

// SPIKE, from the same branch's drawAirportDots: each wanted label goes in the first of eight spots round its dot that is clear
// of every dot and of the labels already placed; one with no clear spot is left out unless `force` (the hovered dot's), which
// takes the first spot anyway. `wanted` is [{index, width}] in priority order; returns Map(index -> [x, y, w, h] of the text box)
export function layoutLabels(placed, wanted, { height = 11, force = -1 } = {}) {
  const boxes = [];
  const out = new Map();
  const hitsDot = (b) => placed.some((d) => {
    const cx = Math.max(b[0], Math.min(d.x, b[2])), cy = Math.max(b[1], Math.min(d.y, b[3]));
    return Math.hypot(cx - d.x, cy - d.y) < d.r + 1;
  });
  const hitsLabel = (b) => boxes.some((o) => b[0] < o[2] + 3 && b[2] + 3 > o[0] && b[1] < o[3] && b[3] > o[1]);
  for (const { index, width: w } of wanted) {
    const { x, y, r } = placed[index], h = height, g = r + 3;
    const spots = [[x + g, y - h / 2], [x - g - w, y - h / 2], [x - w / 2, y - g - h], [x - w / 2, y + g],
      [x + g * 0.7, y - g * 0.7 - h], [x - g * 0.7 - w, y - g * 0.7 - h], [x + g * 0.7, y + g * 0.7], [x - g * 0.7 - w, y + g * 0.7]];
    let chosen = spots.find(([lx, ly]) => !hitsDot([lx, ly, lx + w, ly + h]) && !hitsLabel([lx, ly, lx + w, ly + h]));
    if (!chosen && index === force) chosen = spots[0];
    if (!chosen) continue;
    boxes.push([chosen[0], chosen[1], chosen[0] + w, chosen[1] + h]);
    out.set(index, [chosen[0], chosen[1], w, h]);
  }
  return out;
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

// the dots' colour: orange for airports, the palette's teal for cities
export const dotColour = (group, dark) => colourFor(group === 'city' ? 'domestic' : 'international', dark);

// scene: {w, h, path (d3.geoPath on the context), frames, nation, borders, placed, theme, highlight, group}
export function drawMap(ctx, { w, h, path, frames, nation, borders, placed, theme: t, highlight = -1, group = 'airport' }) {
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
    ctx.fillStyle = i === highlight ? t.ui.fg : dotColour(group, t.dark);
    ctx.globalAlpha = i === highlight ? 1 : 0.75;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;
    ctx.strokeStyle = t.bg;
    ctx.stroke();
  }

  // the busiest dots (placed is busiest first) and the hovered one get their codes (a city, its name), each where nothing is in the way
  ctx.font = '600 11px -apple-system, system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = t.ui.fg;
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = t.bg;
  const text = (p) => p.label ?? p.code;
  // always in the same order, busiest first, so hovering never reshuffles the others' labels; a hovered dot that has none at rest
  // is added last (and forced), so it can't take a spot a busier dot's label had
  const wanted = placed.map((p, index) => index).filter((i) => i < MAP_LABELS || i === highlight)
    .map((index) => ({ index, width: ctx.measureText(text(placed[index])).width }));
  for (const [index, [lx, ly, , lh]] of layoutLabels(placed, wanted, { force: highlight })) {
    ctx.strokeText(text(placed[index]), lx, ly + lh / 2);
    ctx.fillText(text(placed[index]), lx, ly + lh / 2);
  }
}
