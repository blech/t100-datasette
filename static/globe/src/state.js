const intOrNull = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

export function parseState(search) {
  const q = new URLSearchParams(search || '');
  const year = intOrNull(q.get('year'));
  const month = intOrNull(q.get('month'));
  return {
    year: year !== null && year >= 1990 && year <= 2100 ? year : null,
    month: month !== null && month >= 1 && month <= 12 ? month : null,
    proj: q.get('proj') === 'flat' ? 'flat' : 'globe',
  };
}

export function toSearch(state, extra = {}) {
  const q = new URLSearchParams();
  if (state.year !== null) q.set('year', state.year);
  if (state.month !== null) q.set('month', state.month);
  if (state.proj === 'flat') q.set('proj', 'flat');
  for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : '';
}
