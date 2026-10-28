import { parseStyle, styleParams } from './routestyle.js';
import { parseDir } from '../../common/direction.js';

const intOrNull = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

const WIDTHS = ['passengers', 'deps', 'freight'];
const yearOrNull = (v) => (v !== null && v >= 1990 && v <= 2100 ? v : null);

export function parseState(search) {
  const q = new URLSearchParams(search || '');
  const month = intOrNull(q.get('month'));
  return {
    year: yearOrNull(intOrNull(q.get('year'))),
    compare: yearOrNull(intOrNull(q.get('compare'))),
    month: month !== null && month >= 1 && month <= 12 ? month : null,
    proj: q.get('proj') === 'flat' ? 'flat' : 'globe',
    width: WIDTHS.includes(q.get('width')) ? q.get('width') : 'passengers',
    dir: parseDir(search),
    ...parseStyle(search),
  };
}

export function toSearch(state, extra = {}) {
  const q = new URLSearchParams();
  if (state.year !== null) q.set('year', state.year);
  if (state.compare !== null) q.set('compare', state.compare);
  if (state.month !== null) q.set('month', state.month);
  if (state.proj === 'flat') q.set('proj', 'flat');
  if (state.width !== 'passengers') q.set('width', state.width);
  if (state.dir) q.set('dir', state.dir);
  for (const [k, v] of Object.entries({ ...styleParams(state), ...extra })) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : '';
}
