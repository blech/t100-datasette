import { distPointSegment } from './geo.js';
import { colourFor, widthFor, dashFor } from './scale.js';
import { fitView, ZMIN, ZMAX, clamp } from './camera.js';

const ARC_SAMPLES = 24;

// Map types. Rotating ones turn on both axes as you drag (the globe, and the azimuthal maps, whose centre moves); the
// others only spin east-west. `clip` is how far from the centre an azimuthal map reaches, in degrees.
const MODES = {
  globe: { make: (d3) => d3.geoOrthographic().clipAngle(90), rotates: true, clip: 90 },
  flat: { make: (d3) => d3.geoEqualEarth(), rotates: false },
  equirect: { make: (d3) => d3.geoEquirectangular(), rotates: false },
  azimuthal: { make: (d3) => d3.geoAzimuthalEquidistant().clipAngle(150), rotates: true, clip: 150 },
};
export const MAP_MODES = Object.keys(MODES);
// whether a map type is drawn flat, so a route can be drawn as a bowed arc between its projected ends
export const isPlanar = (mode) => mode !== 'globe';
const BOW = 0.22; // the control point's offset, as a share of the route's length on screen (as scripts/flightmaps' bowed)

export class NetworkRenderer {
  constructor(canvas, land) {
    const d3 = window.d3;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.land = land;
    this.theme = null;
    this.w = 1;
    this.h = 1;
    this.mode = 'globe';
    this.projections = Object.fromEntries(Object.entries(MODES).map(([k, m]) => [k, m.make(d3).precision(0.3)]));
    this.baseScale = 100;
    this.R = 100;
    this.viewCentre = [0, 0];
    // with panFlat, a map that only spins east-west also pans north-south: the view's second rotation is the latitude
    // at its middle, so dragging up and down (and fitPlanar) can move it
    this.panFlat = false;
    this.path = d3.geoPath(this.projections.globe, this.ctx);
  }

  get proj() { return this.projections[this.mode]; }

  setTheme(theme) { this.theme = theme; }

  setMode(mode) {
    this.mode = MODES[mode] ? mode : 'globe';
    this.path = window.d3.geoPath(this.proj, this.ctx);
    this.baseScale = this.computeBaseScale();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.baseScale = this.computeBaseScale();
  }

  computeBaseScale() {
    if (this.mode === 'globe') return Math.min(this.w, this.h * 0.8) * 0.42;
    const probe = MODES[this.mode].make(window.d3);
    probe.fitExtent([[16, 130], [Math.max(17, this.w - 16), Math.max(131, this.h - 150)]], { type: 'Sphere' });
    return probe.scale();
  }

  // degrees of rotation per pixel of drag
  degPerPx() { return 57.2958 / Math.max(1, this.R); }

  centre() { return [this.w / 2, this.mode === 'globe' ? this.h * 0.46 : this.mode === 'azimuthal' ? (130 + this.h - 150) / 2 : this.h * 0.5]; }

  // the globe view that frames `points` inside `box` (see fitView)
  fit(points, box) {
    return fitView(points, window.d3.geoOrthographic(), { centre: this.centre(), baseScale: this.baseScale, box });
  }

  // on a flat or azimuthal map, the view ({ rot, zoom }) that frames `points` ([lon, lat]) inside `box` (screen pixels):
  // move the points' middle to the box's middle and scale their extent to fill it, a few times over, since moving a map
  // changes its shape. Null on the globe, which has fit().
  fitPlanar(points, box) {
    if (!isPlanar(this.mode) || !points.length) return null;
    const m = MODES[this.mode];
    const probe = m.make(window.d3);
    const [cx, cy] = this.centre();
    const bc = [(box.left + box.right) / 2, (box.top + box.bottom) / 2];
    let rot = [...(this.lastRot || [0, 0])];
    let zoom = 1;
    for (let pass = 0; pass < 4; pass++) {
      probe.scale(this.baseScale * zoom).translate([cx, cy]);
      if (m.rotates) probe.rotate(rot).center([0, 0]); else probe.rotate([rot[0], 0]).center([0, -rot[1]]);
      const xy = points.map((p) => probe(p)).filter((p) => p && Number.isFinite(p[0]) && Number.isFinite(p[1]));
      if (!xy.length) return null;
      const [x0, x1] = [Math.min(...xy.map((p) => p[0])), Math.max(...xy.map((p) => p[0]))];
      const [y0, y1] = [Math.min(...xy.map((p) => p[1])), Math.max(...xy.map((p) => p[1]))];
      const k = Math.min((box.right - box.left) / Math.max(1, x1 - x0), (box.bottom - box.top) / Math.max(1, y1 - y0));
      // the place that should sit at the map's own middle, so the points' middle lands on the box's middle
      const mid = probe.invert([cx + ((x0 + x1) / 2 - bc[0]), cy + ((y0 + y1) / 2 - bc[1])]);
      if (!mid || !mid.every(Number.isFinite)) return null;
      rot = [-mid[0], clamp(-mid[1], -90, 90)];
      zoom = clamp(zoom * k, ZMIN, ZMAX);
    }
    return { rot, zoom };
  }

  visible(lon, lat) {
    const clip = MODES[this.mode].clip;
    if (!clip) return true;
    return window.d3.geoDistance([lon, lat], this.viewCentre) < (clip * Math.PI) / 180 - 0.01;
  }

  // a bowed route on a flat map: a quadratic curve between its projected ends, bulging to the left going west to east
  // (north, on most maps), as airline route maps draw them; null when an end is off the map
  bowedCurve(r) {
    if (!this.visible(r.from[0], r.from[1]) || !this.visible(r.to[0], r.to[1])) return null;
    // ends at their airports' dots, where the dot layout has moved them apart
    let p = this.moved?.get(r.origin) ?? this.proj(r.from);
    let q = this.moved?.get(r.dest) ?? this.proj(r.to);
    if (!p || !q) return null;
    if (p[0] > q[0]) [p, q] = [q, p];
    const [dx, dy] = [q[0] - p[0], q[1] - p[1]];
    return { p, q, c: [(p[0] + q[0]) / 2 + dy * BOW, (p[1] + q[1]) / 2 - dx * BOW] };
  }

  // the screen points of a bowed curve, for hit-testing
  bowedPoints(r) {
    const k = this.bowedCurve(r);
    if (!k) return [];
    return Array.from({ length: ARC_SAMPLES + 1 }, (_, i) => {
      const t = i / ARC_SAMPLES, u = 1 - t;
      return [u * u * k.p[0] + 2 * u * t * k.c[0] + t * t * k.q[0], u * u * k.p[1] + 2 * u * t * k.c[1] + t * t * k.q[1]];
    });
  }

  arcPoints(route) {
    if (!route._arc) {
      const interp = window.d3.geoInterpolate(route.from, route.to);
      route._arc = Array.from({ length: ARC_SAMPLES + 1 }, (_, i) => interp(i / ARC_SAMPLES));
    }
    return route._arc;
  }

  draw(view, routes, opts = {}) {
    const { ctx, theme: t } = this;
    const [cx, cy] = this.centre();
    this.R = this.baseScale * view.zoom;
    this.lastRot = [view.rot[0], view.rot[1]];
    this.proj.scale(this.R).translate([cx, cy]);
    if (MODES[this.mode].rotates) {
      this.proj.rotate([view.rot[0], view.rot[1]]);
      this.viewCentre = [-view.rot[0], -view.rot[1]];
    } else {
      this.proj.rotate([view.rot[0], 0]).center([0, this.panFlat ? -view.rot[1] : 0]);
      this.viewCentre = [-view.rot[0], 0];
    }

    ctx.fillStyle = t.bg;
    ctx.fillRect(0, 0, this.w, this.h);

    if (this.mode === 'globe' && t.glow) {
      const g = ctx.createRadialGradient(cx, cy, this.R, cx, cy, this.R * 1.12);
      g.addColorStop(0, t.glow);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, this.R * 1.12, 0, Math.PI * 2);
      ctx.fill();
    }

    // `plain` leaves out the water, as on a printed route map: land on the page's own ground, inside a thin outline
    const plain = opts.plain;
    ctx.beginPath();
    this.path({ type: 'Sphere' });
    ctx.fillStyle = plain ? t.bg : t.ocean;
    ctx.fill();

    ctx.beginPath();
    this.path(this.land);
    ctx.fillStyle = t.land;
    ctx.fill();
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = t.coast;
    ctx.stroke();

    if (t.outline || plain) {
      ctx.beginPath();
      this.path({ type: 'Sphere' });
      ctx.lineWidth = 1;
      ctx.strokeStyle = t.outline || t.coast;
      ctx.stroke();
    }

    this.moved = opts.airportDots ? this.layoutDots(opts.airportDots) : null;
    const key = opts.widthKey || 'passengers';
    // highlighted routes: one index, or a set of them (an airport's routes); they're drawn last, on top
    const lit = opts.highlightSet ?? new Set(opts.highlight >= 0 ? [opts.highlight] : []);
    const order = routes.map((r, i) => i).sort((a, b) => (lit.has(a) - lit.has(b)) || Number(routes[b][key]) - Number(routes[a][key]));
    ctx.lineCap = 'round';
    // while a route is highlighted the rest step back; with fadeAll they always do, and only highlighted ones come forward
    const dim = lit.size || opts.fadeAll ? 0.6 : 1;
    const bowed = opts.bowed && isPlanar(this.mode);
    this.bowed = bowed;
    for (const i of order) {
      const r = routes[i];
      const s = opts.styles?.[i];
      ctx.beginPath();
      if (bowed) {
        const k = this.bowedCurve(r);
        if (!k) continue;
        ctx.moveTo(k.p[0], k.p[1]);
        ctx.quadraticCurveTo(k.c[0], k.c[1], k.q[0], k.q[1]);
      } else this.path({ type: 'LineString', coordinates: [r.from, r.to] });
      ctx.strokeStyle = s?.colour ?? colourFor(r.service, t.dark);
      ctx.globalAlpha = lit.has(i) ? 1 : (s?.alpha ?? 0.65) * dim;
      ctx.lineWidth = widthFor(r[key], opts.max) + (lit.has(i) ? 1.5 : 0);
      ctx.setLineDash(s?.dashed ? dashFor(ctx.lineWidth) : []);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    ctx.font = '11px -apple-system, system-ui, sans-serif';
    ctx.textBaseline = 'alphabetic';
    if (opts.airportDots) { this.drawAirportDots(opts.airportDots, opts.dotLabels ?? 40, opts.dotFocus); return; }
    for (const r of routes) {
      if (!this.visible(r.to[0], r.to[1])) continue;
      const p = this.proj(r.to);
      if (!p) continue;
      ctx.fillStyle = t.dot;
      ctx.beginPath();
      ctx.arc(p[0], p[1], 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    if (opts.bothEnds) {
      // a network has no single origin: dot the other end of each route too
      for (const r of routes) {
        if (!this.visible(r.from[0], r.from[1])) continue;
        const p = this.proj(r.from);
        if (!p) continue;
        ctx.fillStyle = t.dot;
        ctx.beginPath();
        ctx.arc(p[0], p[1], 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = t.ui.fg;
    for (const i of order.slice(0, opts.labels ?? 8)) {
      const r = routes[i];
      if (!this.visible(r.to[0], r.to[1])) continue;
      const p = this.proj(r.to);
      if (p) ctx.fillText(r.dest, p[0] + 5, p[1] - 5);
    }

    if (opts.points) this.drawPoints(opts.points, opts.highlightPoint);

    if (opts.origin && this.visible(opts.origin.lon, opts.origin.lat)) {
      const p = this.proj([opts.origin.lon, opts.origin.lat]);
      if (p) {
        ctx.beginPath();
        ctx.arc(p[0], p[1], 5, 0, Math.PI * 2);
        ctx.fillStyle = t.bg;
        ctx.fill();
        ctx.lineWidth = 2.2;
        ctx.strokeStyle = t.ui.fg;
        ctx.stroke();
        ctx.fillStyle = t.ui.fg;
        ctx.font = '600 12px -apple-system, system-ui, sans-serif';
        ctx.fillText(opts.origin.code, p[0] + 8, p[1] - 8);
      }
    }
  }

  // airports as dots sized by their traffic (area by value), placed on screen and pushed apart until they just touch, the
  // bigger ones moving less (as scripts/flightmaps' separate); returns each code's moved position, for the routes to end at
  layoutDots(dots) {
    const max = Math.max(1, ...dots.map((d) => d.value));
    for (const d of dots) {
      d.screen = this.visible(d.pos[0], d.pos[1]) ? this.proj(d.pos) : null;
      if (d.screen) d.screen = [...d.screen];
      d.r = 1.6 + 9 * Math.sqrt(d.value / max);
    }
    const on = dots.filter((d) => d.screen);
    const GAP = 0.5;
    for (let it = 0; it < 120; it++) {
      let moved = false;
      for (let i = 0; i < on.length; i++) {
        const a = on[i];
        for (let j = i + 1; j < on.length; j++) {
          const b = on[j];
          const dx = b.screen[0] - a.screen[0], dy = b.screen[1] - a.screen[1];
          const need = a.r + b.r + GAP;
          if (Math.abs(dx) >= need || Math.abs(dy) >= need) continue;
          const dist = Math.hypot(dx, dy);
          if (dist >= need) continue;
          const [ux, uy] = dist > 1e-9 ? [dx / dist, dy / dist] : [1, 0];
          const push = need - dist, ma = a.r * a.r, mb = b.r * b.r;
          a.screen[0] -= (ux * push * mb) / (ma + mb); a.screen[1] -= (uy * push * mb) / (ma + mb);
          b.screen[0] += (ux * push * ma) / (ma + mb); b.screen[1] += (uy * push * ma) / (ma + mb);
          moved = true;
        }
      }
      if (!moved) break;
    }
    return new Map(on.map((d) => [d.code, d.screen]));
  }

  // the dots from layoutDots, then labels, each put in the first of a few spots round its dot that's clear of other labels
  // and dots. Three levels: every dot faded; `focus.related` (the ends of a hovered route, or a hovered airport's
  // destinations) in the full dot colour; `focus.code` (the hovered airport) in the text colour. Focused dots are drawn
  // last, on top, and labelled first, then the rest biggest first up to `labels` in all; while anything is focused the
  // other labels fade too.
  drawAirportDots(dots, labels, focus = {}) {
    const { ctx, theme: t } = this;
    const placed = [];
    const related = focus.related || new Set();
    const level = (d) => (d.code === focus.code ? 2 : related.has(d.code) ? 1 : 0);
    const focused = Boolean(focus.code) || related.size > 0;
    const bySize = dots.filter((d) => d.screen).sort((a, b) => b.value - a.value);
    const order = [...bySize].sort((a, b) => level(a) - level(b)); // stable: biggest first within each level
    for (const d of order) {
      const lv = level(d);
      ctx.beginPath();
      ctx.arc(d.screen[0], d.screen[1], d.r + (lv === 2 ? 1.5 : 0), 0, Math.PI * 2);
      ctx.globalAlpha = lv ? 1 : focused ? 0.35 : 0.55;
      ctx.fillStyle = lv === 2 ? t.ui.fg : t.dot;
      ctx.fill();
      ctx.lineWidth = lv === 2 ? 2 : 1;
      ctx.strokeStyle = t.bg;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.font = '600 11px -apple-system, system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    const hitsDot = (b) => order.some((d) => {
      const cx = Math.max(b[0], Math.min(d.screen[0], b[2])), cy = Math.max(b[1], Math.min(d.screen[1], b[3]));
      return Math.hypot(cx - d.screen[0], cy - d.screen[1]) < d.r + 1;
    });
    const hitsLabel = (b) => placed.some((o) => b[0] < o[2] + 3 && b[2] + 3 > o[0] && b[1] < o[3] && b[3] > o[1]);
    const toLabel = [...bySize].sort((a, b) => level(b) - level(a));
    for (const d of toLabel.slice(0, Math.max(labels, toLabel.filter((x) => level(x)).length))) {
      const lv = level(d);
      ctx.globalAlpha = lv || !focused ? 1 : 0.4;
      const w = ctx.measureText(d.code).width, h = 11, g = d.r + 3 + (lv === 2 ? 1.5 : 0);
      const [x, y] = d.screen;
      const spots = [[x + g, y - h / 2], [x - g - w, y - h / 2], [x - w / 2, y - g - h], [x - w / 2, y + g],
        [x + g * 0.7, y - g * 0.7 - h], [x - g * 0.7 - w, y - g * 0.7 - h], [x + g * 0.7, y + g * 0.7], [x - g * 0.7 - w, y + g * 0.7]];
      for (const [lx, ly] of spots) {
        const b = [lx, ly, lx + w, ly + h];
        if (hitsDot(b) || hitsLabel(b)) continue;
        placed.push(b);
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round'; // a mitred halo spikes off the letters' corners
        ctx.strokeStyle = t.bg;
        ctx.strokeText(d.code, lx, ly + h / 2);
        ctx.fillStyle = t.ui.fg;
        ctx.fillText(d.code, lx, ly + h / 2);
        break;
      }
    }
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'alphabetic';
  }

  // the dot under (x, y) from the last drawAirportDots, or -1
  hitTestDots(x, y, dots) {
    let best = -1, bestD = Infinity;
    dots.forEach((d, i) => {
      if (!d.screen) return;
      const dist = Math.hypot(d.screen[0] - x, d.screen[1] - y);
      if (dist <= Math.max(d.r, 4) + 2 && dist < bestD) { bestD = dist; best = i; }
    });
    return best;
  }

  // airport dots for the chooser page; the highlighted one is larger and labelled
  drawPoints(points, highlight = -1) {
    const { ctx, theme: t } = this;
    ctx.font = '600 12px -apple-system, system-ui, sans-serif';
    points.forEach((pt, i) => {
      if (!this.visible(pt.pos[0], pt.pos[1])) return;
      const p = this.proj(pt.pos);
      if (!p) return;
      ctx.beginPath();
      ctx.arc(p[0], p[1], i === highlight ? 6.5 : 4, 0, Math.PI * 2);
      ctx.fillStyle = i === highlight ? t.ui.fg : colourFor('international', t.dark);
      ctx.globalAlpha = i === highlight ? 1 : 0.85;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = t.bg;
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (i === highlight) { ctx.fillStyle = t.ui.fg; ctx.fillText(pt.code, p[0] + 9, p[1] - 8); }
    });
  }

  // index of the nearest visible dot within maxPx, or -1
  hitTestPoints(x, y, points, maxPx = 10) {
    let best = -1;
    let bestD = maxPx;
    points.forEach((pt, i) => {
      if (!this.visible(pt.pos[0], pt.pos[1])) return;
      const p = this.proj(pt.pos);
      if (!p) return;
      const d = Math.hypot(p[0] - x, p[1] - y);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }

  hitTest(x, y, routes, maxPx = 6) {
    let best = -1;
    let bestD = maxPx;
    for (let i = 0; i < routes.length; i++) {
      let prev = null;
      if (this.bowed) {
        for (const s of this.bowedPoints(routes[i])) {
          if (prev) {
            const d = distPointSegment([x, y], prev, s);
            if (d < bestD) { bestD = d; best = i; }
          }
          prev = s;
        }
        continue;
      }
      for (const pt of this.arcPoints(routes[i])) {
        const s = this.visible(pt[0], pt[1]) ? this.proj(pt) : null;
        if (s && prev && Math.hypot(s[0] - prev[0], s[1] - prev[1]) < this.R * 0.9) {
          const d = distPointSegment([x, y], prev, s);
          if (d < bestD) { bestD = d; best = i; }
        }
        prev = s;
      }
    }
    return best;
  }
}
