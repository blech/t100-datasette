import { distPointSegment } from './geo.js';
import { colourFor, widthFor } from './scale.js';

const ARC_SAMPLES = 24;

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
    this.projections = {
      globe: d3.geoOrthographic().clipAngle(90).precision(0.3),
      flat: d3.geoEqualEarth().precision(0.3),
    };
    this.baseScale = 100;
    this.R = 100;
    this.viewCentre = [0, 0];
    this.path = d3.geoPath(this.projections.globe, this.ctx);
  }

  get proj() { return this.projections[this.mode]; }

  setTheme(theme) { this.theme = theme; }

  setMode(mode) {
    this.mode = mode;
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
    const probe = window.d3.geoEqualEarth();
    probe.fitExtent([[16, 130], [Math.max(17, this.w - 16), Math.max(131, this.h - 150)]], { type: 'Sphere' });
    return probe.scale();
  }

  // degrees of rotation per pixel of drag
  degPerPx() { return 57.2958 / Math.max(1, this.R); }

  centre() { return [this.w / 2, this.mode === 'globe' ? this.h * 0.46 : this.h * 0.5]; }

  visible(lon, lat) {
    if (this.mode === 'flat') return true;
    return window.d3.geoDistance([lon, lat], this.viewCentre) < Math.PI / 2 - 0.01;
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
    this.proj.scale(this.R).translate([cx, cy]);
    if (this.mode === 'globe') {
      this.proj.rotate([view.rot[0], view.rot[1]]);
      this.viewCentre = [-view.rot[0], -view.rot[1]];
    } else {
      this.proj.rotate([view.rot[0], 0]);
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

    ctx.beginPath();
    this.path({ type: 'Sphere' });
    ctx.fillStyle = t.ocean;
    ctx.fill();

    ctx.beginPath();
    this.path(this.land);
    ctx.fillStyle = t.land;
    ctx.fill();
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = t.coast;
    ctx.stroke();

    if (t.outline) {
      ctx.beginPath();
      this.path({ type: 'Sphere' });
      ctx.lineWidth = 1;
      ctx.strokeStyle = t.outline;
      ctx.stroke();
    }

    const key = opts.widthKey || 'passengers';
    const order = routes.map((r, i) => i).sort((a, b) => Number(routes[b][key]) - Number(routes[a][key]));
    ctx.lineCap = 'round';
    for (const i of order) {
      const r = routes[i];
      ctx.beginPath();
      this.path({ type: 'LineString', coordinates: [r.from, r.to] });
      ctx.strokeStyle = colourFor(r.service);
      ctx.globalAlpha = i === opts.highlight ? 1 : 0.65;
      ctx.lineWidth = widthFor(r[key], opts.max) + (i === opts.highlight ? 1.5 : 0);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    ctx.font = '11px -apple-system, system-ui, sans-serif';
    ctx.textBaseline = 'alphabetic';
    for (const r of routes) {
      if (!this.visible(r.to[0], r.to[1])) continue;
      const p = this.proj(r.to);
      if (!p) continue;
      ctx.fillStyle = t.dot;
      ctx.beginPath();
      ctx.arc(p[0], p[1], 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = t.ui.fg;
    for (const i of order.slice(0, opts.labels ?? 8)) {
      const r = routes[i];
      if (!this.visible(r.to[0], r.to[1])) continue;
      const p = this.proj(r.to);
      if (p) ctx.fillText(r.dest, p[0] + 5, p[1] - 5);
    }

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

  hitTest(x, y, routes, maxPx = 6) {
    let best = -1;
    let bestD = maxPx;
    for (let i = 0; i < routes.length; i++) {
      let prev = null;
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
