export const ZMIN = 0.8;
export const ZMAX = 4;

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function defaultView() {
  return { rot: [100, -30], zoom: 1, followZoom: 1, vel: [0, 0], dragging: false, target: null };
}

const wrap180 = (d) => ((d + 540) % 360) - 180;

export function easeAngle(cur, target, dt, tau) {
  const diff = wrap180(target - cur);
  if (Math.abs(diff) < 0.005) return target; // close enough: land exactly (same direction mod 360) so the globe is truly still
  const k = 1 - Math.exp(-dt / tau);
  return cur + diff * k;
}

export function easeToward(cur, target, dt, tau, eps = 0.001) {
  if (Math.abs(target - cur) < eps) return target;
  return cur + (target - cur) * (1 - Math.exp(-dt / tau));
}

export function rotationFor(lon, lat) {
  return [-lon, clamp(-lat, -70, 70)];
}

export function zoomForKm(km) {
  // 1.4x on short hops easing to 1x on long hauls; capped so the globe stays clear of the controls
  return clamp(1.4 - ((km - 500) * 0.4) / 7500, 1, 1.4);
}

export function followStep(view, target, dt) {
  const [tl, tp] = rotationFor(target.lon, target.lat);
  view.rot[0] = easeAngle(view.rot[0], tl, dt, 0.5);
  view.rot[1] = easeAngle(view.rot[1], tp, dt, 0.5);
  view.followZoom = easeToward(view.followZoom, zoomForKm(target.km), dt, 0.8);
}

const MIN_FLICK_DEG_PER_S = 25;

// Momentum only carries after a real flick; a slow, deliberate drag stops dead where it was released.
export function releaseVelocity(vel, minSpeed = MIN_FLICK_DEG_PER_S) {
  return Math.hypot(vel[0], vel[1]) >= minSpeed ? [vel[0], vel[1]] : [0, 0];
}

// Ease the view toward view.target ({ rot, zoom }) set by a button, dropping the target once there.
export function glide(view, dt) {
  if (!view.target) return false;
  const { rot, zoom } = view.target;
  view.rot[0] = easeAngle(view.rot[0], rot[0], dt, 0.25);
  view.rot[1] = easeAngle(view.rot[1], rot[1], dt, 0.25);
  view.zoom = easeToward(view.zoom, zoom, dt, 0.25);
  if (view.rot[0] === rot[0] && view.rot[1] === rot[1] && view.zoom === zoom) view.target = null;
  return true;
}

const DEG = 180 / Math.PI;

// whether [lon, lat] is on the near side of a globe turned to `rot`
function facing([lon, lat], rot) {
  const [clon, clat] = [-rot[0] / DEG, -rot[1] / DEG];
  const [la, lo] = [lat / DEG, lon / DEG];
  return Math.sin(la) * Math.sin(clat) + Math.cos(la) * Math.cos(clat) * Math.cos(lo - clon) > 0;
}

// The globe's rotation and zoom that put every [lon, lat] in `points` inside `box` ({ left, right, top, bottom }, in
// pixels), as close as the zoom limits allow, north up. `projection` is an orthographic d3 projection, whose centre
// lands at `centre` on the canvas at `baseScale` times the zoom.
export function fitView(points, projection, { centre, baseScale, box }) {
  const n = points.length;
  if (!n) return null;
  // start from the points' mean direction, then nudge until their extent sits in the middle of the box
  let x = 0, y = 0, z = 0;
  for (const [lon, lat] of points) {
    const la = lat / DEG, lo = lon / DEG;
    x += Math.cos(la) * Math.cos(lo); y += Math.cos(la) * Math.sin(lo); z += Math.sin(la);
  }
  const rot = rotationFor(Math.atan2(y, x) * DEG, Math.atan2(z, Math.hypot(x, y)) * DEG);
  const [cx, cy] = centre;
  let k = baseScale;
  for (let i = 0; i < 8; i++) {
    projection.rotate(rot).scale(1).translate([0, 0]);
    // on the globe, a point round the back can't be framed: show the whole hemisphere instead
    if (points.some((p) => !facing(p, rot))) return { rot, zoom: 1 };
    const xy = points.map((p) => projection(p));
    k = Infinity;
    for (const [px, py] of xy) {
      if (px > 0) k = Math.min(k, (box.right - cx) / px); else if (px < 0) k = Math.min(k, (box.left - cx) / px);
      if (py > 0) k = Math.min(k, (box.bottom - cy) / py); else if (py < 0) k = Math.min(k, (box.top - cy) / py);
    }
    k = clamp(Number.isFinite(k) ? k : baseScale * ZMAX, baseScale * ZMIN, baseScale * ZMAX);
    // how far the points' middle is from the box's middle, in pixels at that scale
    const mx = (Math.min(...xy.map((p) => p[0])) + Math.max(...xy.map((p) => p[0]))) / 2;
    const my = (Math.min(...xy.map((p) => p[1])) + Math.max(...xy.map((p) => p[1]))) / 2;
    const ex = (box.left + box.right) / 2 - (cx + k * mx);
    const ey = (box.top + box.bottom) / 2 - (cy + k * my);
    if (i === 7 || (Math.abs(ex) < 0.5 && Math.abs(ey) < 0.5)) break;
    // the same turn a drag of that many pixels makes
    rot[0] += (ex / k) * DEG;
    rot[1] = clamp(rot[1] - (ey / k) * DEG, -90, 90);
  }
  return { rot, zoom: k / baseScale };
}
