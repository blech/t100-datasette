// The all-airports map: each airport's domestic routes, shown while it is hovered (or, on touch, after one tap).
// domestic_routes gives each pair once, both ways together (a before b): file it under both, the other end as dest.

export function routesByOrigin(rows) {
  const m = new Map();
  const add = (code, r) => {
    if (!m.has(code)) m.set(code, []);
    m.get(code).push(r);
  };
  for (const r of rows) {
    add(r.a, { ...r, origin: r.a, dest: r.b });
    add(r.b, { ...r, origin: r.b, dest: r.a });
  }
  return m;
}

// A mouse hovers before it clicks, so a click lands on the airport already showing and opens it.
// A touch has no hover: its first tap shows the routes and a second tap on the same airport opens it.
export function chooserTap(showing, tapped) {
  if (tapped < 0) return 'clear';
  return tapped === showing ? 'open' : 'show';
}
