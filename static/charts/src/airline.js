// Rows from carrier_route_changes (one per airport pair, with departures in year A and year B) ->
// each pair's fate between the two years, for an airline's own page.
export function classifyRoutes(rows, { min = 12 } = {}) {
  const out = [];
  for (const r of rows) {
    const a = Number(r.deps_a) >= min;
    const b = Number(r.deps_b) >= min;
    if (!a && !b) continue;
    out.push({ ...r, status: a && b ? 'kept' : a ? 'dropped' : 'added' });
  }
  return out;
}

export function summariseRoutes(routes) {
  const counts = { kept: 0, dropped: 0, added: 0 };
  for (const r of routes) counts[r.status] += 1;
  return counts;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// 201902 -> "Feb 2019"
export function formatYearMonth(ym) {
  const n = Number(ym);
  if (!n) return '';
  return `${MONTHS[(n % 100) - 1] || ''} ${Math.floor(n / 100)}`.trim();
}
