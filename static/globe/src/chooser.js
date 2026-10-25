// The all-airports map: each airport's domestic routes, shown while it is hovered (or, on touch, after one tap).

export function routesByOrigin(rows) {
  const m = new Map();
  for (const r of rows) {
    if (!m.has(r.origin)) m.set(r.origin, []);
    m.get(r.origin).push(r);
  }
  return m;
}

// A mouse hovers before it clicks, so a click lands on the airport already showing and opens it.
// A touch has no hover: its first tap shows the routes and a second tap on the same airport opens it.
export function chooserTap(showing, tapped) {
  if (tapped < 0) return 'clear';
  return tapped === showing ? 'open' : 'show';
}
