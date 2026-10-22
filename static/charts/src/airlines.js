const LB_PER_SHORT_TON = 2000;
const amount = (row, measure) => (Number(row[measure]) || 0) / (measure === 'freight' ? LB_PER_SHORT_TON : 1);
const byValue = (a, b) => b.value - a.value || a.name.localeCompare(b.name);
const firstOf = (xs) => { const ys = xs.map((x) => x.firstYear).filter(Boolean); return ys.length ? Math.min(...ys) : null; };
const lastOf = (xs) => Math.max(0, ...xs.map((x) => x.lastYear || 0)) || null;

// Rows from airline_table (one per member airline, service and kind) -> airline groups, each with its members.
// Rows are filtered by kind of flight and service; a member's years are those of the rows left. Groups with nothing in
// the selection are left out unless the search `q` names them (or one of their members). Shares are of everything the
// filters leave, not of what the search shows.
export function groupAirlines(rows, { measure = 'passengers', flights = 'passenger', service = 'all', q = '' } = {}) {
  const needle = String(q).trim().toLowerCase();
  const byGroup = new Map();
  for (const r of rows) {
    if (flights !== 'all' && r.kind !== flights) continue;
    if (service !== 'all' && r.service !== service) continue;
    const g = byGroup.get(r.group_id) || { id: r.group_id, name: r.group_name, members: new Map() };
    byGroup.set(r.group_id, g);
    const m = g.members.get(r.airline_id) || { id: r.airline_id, name: r.airline_name, value: 0, firstYear: null, lastYear: null, share: 0 };
    g.members.set(r.airline_id, m);
    m.value += amount(r, measure);
    const first = Number(r.first_year) || null, last = Number(r.last_year) || null;
    if (first && (!m.firstYear || first < m.firstYear)) m.firstYear = first;
    if (last && (!m.lastYear || last > m.lastYear)) m.lastYear = last;
  }
  const sum = (ms) => ms.reduce((s, m) => s + m.value, 0);
  const total = [...byGroup.values()].reduce((s, g) => s + sum([...g.members.values()]), 0);
  const groups = [];
  for (const g of byGroup.values()) {
    const all = [...g.members.values()];
    const value = sum(all);
    const nameHit = g.name.toLowerCase().includes(needle);
    const memberHits = needle ? all.filter((m) => m.name.toLowerCase().includes(needle)) : all;
    if (needle && !nameHit && !memberHits.length) continue;
    if (value <= 0 && !needle) continue;
    const members = (nameHit ? all.filter((m) => m.value > 0) : memberHits).sort(byValue);
    for (const m of members) m.share = total > 0 ? m.value / total : 0;
    groups.push({ id: g.id, name: g.name, firstYear: firstOf(all), lastYear: lastOf(all), value,
      share: total > 0 ? value / total : 0, matched: Boolean(needle) && !nameHit, members });
  }
  groups.sort(byValue);
  return { groups, total };
}

// How many groups a search finds once the flight and route filters are widened to everything: a freight airline searched
// for among passenger flights is in the data, just not in this selection
export function matchesElsewhere(rows, opts = {}) {
  if (!String(opts.q || '').trim()) return 0;
  return groupAirlines(rows, { ...opts, flights: 'all', service: 'all' }).groups.length;
}

function compare(key, dir) {
  const sign = dir === 'asc' ? 1 : -1;
  return (a, b) => {
    const c = key === 'name' ? a.name.localeCompare(b.name) : (a[key] ?? -Infinity) - (b[key] ?? -Infinity);
    return sign * c || a.name.localeCompare(b.name);
  };
}

// Groups sorted by a column, and each group's members by the same column
export function sortAirlines(groups, key, dir = 'desc') {
  const by = compare(key, dir);
  return [...groups].sort(by).map((g) => ({ ...g, members: [...g.members].sort(by) }));
}

// The settings the airlines table and the airlines heat map both read, to carry between them
const SHARED = ['measure', 'flights', 'service'];
export function sharedQuery(search) {
  const from = new URLSearchParams(search || '');
  const q = new URLSearchParams();
  for (const k of SHARED) if (from.has(k)) q.set(k, from.get(k));
  const s = q.toString();
  return s ? `?${s}` : '';
}
