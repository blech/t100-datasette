// A composite equal-area projection of the United States: d3.geoAlbersUsa's lower 48, Alaska and Hawaii,
// plus a third inset for Puerto Rico and the US Virgin Islands off the coast east of Florida. It follows
// d3-geo's albersUsa source. Takes the d3 namespace (the vendored UMD build sets window.d3) as an argument.
// Places it has no part for (Guam, Saipan, American Samoa) project to null.
const EPSILON = 1e-6;

// the insets' boxes in units of the lower 48's scale, relative to its translate
export const INSETS = {
  alaska: [[-0.425, 0.120], [-0.214, 0.234]],
  hawaii: [[-0.214, 0.166], [-0.115, 0.234]],
  caribbean: [[0.300, 0.140], [0.440, 0.234]],
};
// the whole map is this many lower-48 units across and down
const WIDTH = 0.91;
const HEIGHT = 0.476;

const inBox = (x, y, [[x0, y0], [x1, y1]]) => x >= x0 && x < x1 && y >= y0 && y < y1;

function multiplex(streams) {
  return {
    point(x, y) { for (const s of streams) s.point(x, y); },
    sphere() { for (const s of streams) s.sphere(); },
    lineStart() { for (const s of streams) s.lineStart(); },
    lineEnd() { for (const s of streams) s.lineEnd(); },
    polygonStart() { for (const s of streams) s.polygonStart(); },
    polygonEnd() { for (const s of streams) s.polygonEnd(); },
  };
}

export function geoAlbersUsaTerritories(d3) {
  const lower48 = d3.geoAlbers();
  const alaska = d3.geoConicEqualArea().rotate([154, 0]).center([-2, 58.5]).parallels([55, 65]);
  const hawaii = d3.geoConicEqualArea().rotate([157, 0]).center([-3, 19.9]).parallels([8, 18]);
  const caribbean = d3.geoMercator().center([-65.9, 18.1]);
  const parts = [lower48, alaska, hawaii, caribbean];
  let point;
  const pointStream = { point(x, y) { point = [x, y]; } };
  let pointStreams = [];
  let cache = null;
  let cacheStream = null;

  // the first part whose clip box takes the point wins
  function projection([lon, lat]) {
    point = null;
    for (const s of pointStreams) {
      s.point(lon, lat);
      if (point) return point;
    }
    return null;
  }

  projection.invert = (coordinates) => {
    const k = lower48.scale();
    const [tx, ty] = lower48.translate();
    const x = (coordinates[0] - tx) / k;
    const y = (coordinates[1] - ty) / k;
    const part = inBox(x, y, INSETS.alaska) ? alaska
      : inBox(x, y, INSETS.hawaii) ? hawaii
        : inBox(x, y, INSETS.caribbean) ? caribbean
          : lower48;
    return part.invert(coordinates);
  };

  projection.stream = (stream) => {
    if (cache && cacheStream === stream) return cache;
    cacheStream = stream;
    cache = multiplex(parts.map((p) => p.stream(stream)));
    return cache;
  };

  const box = ([[x0, y0], [x1, y1]], x, y, k) => [[x + x0 * k + EPSILON, y + y0 * k + EPSILON], [x + x1 * k - EPSILON, y + y1 * k - EPSILON]];

  projection.translate = (t) => {
    if (t === undefined) return lower48.translate();
    const k = lower48.scale();
    const [x, y] = t;
    lower48.translate(t).clipExtent([[x - 0.455 * k, y - 0.238 * k], [x + 0.455 * k, y + 0.238 * k]]);
    alaska.translate([x - 0.307 * k, y + 0.201 * k]).clipExtent(box(INSETS.alaska, x, y, k));
    hawaii.translate([x - 0.205 * k, y + 0.212 * k]).clipExtent(box(INSETS.hawaii, x, y, k));
    caribbean.translate([x + 0.370 * k, y + 0.187 * k]).clipExtent(box(INSETS.caribbean, x, y, k));
    pointStreams = parts.map((p) => p.stream(pointStream));
    cache = null;
    return projection;
  };

  projection.scale = (k) => {
    if (k === undefined) return lower48.scale();
    lower48.scale(k);
    alaska.scale(k * 0.35);
    hawaii.scale(k);
    caribbean.scale(k * 1.5);
    return projection.translate(lower48.translate());
  };

  // fit the whole map, insets included, inside width x height, centred
  projection.fitSize = ([w, h], margin = 8) => {
    projection.scale(Math.max(1, Math.min((w - 2 * margin) / WIDTH, (h - 2 * margin) / HEIGHT)));
    return projection.translate([w / 2, h / 2]);
  };

  // the insets' frames in pixels, for outlining them
  projection.insetFrames = () => {
    const k = lower48.scale();
    const [x, y] = lower48.translate();
    return Object.values(INSETS).map((b) => box(b, x, y, k));
  };

  return projection.scale(1070);
}
