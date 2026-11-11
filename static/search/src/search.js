import { queryUrl } from '../../globe/src/api.js';

const KINDS = [['airport', 'Airports'], ['airline', 'Airlines'], ['aircraft', 'Aircraft']];

// What was typed -> the three words the search query takes: lowercase, the first three, padded with ''
export const tokens = (text) => {
  const words = String(text).toLowerCase().split(/\s+/).filter(Boolean).slice(0, 3);
  return [words[0] || '', words[1] || '', words[2] || ''];
};

// The query to run for what was typed, or null when nothing was
export function searchUrl(text) {
  const [t1, t2, t3] = tokens(text);
  return t1 ? queryUrl('search', { t1, t2, t3 }) : null;
}

// Rows from the search query -> [{ kind, title, items }] in the order airports, airlines, aircraft, leaving out a kind with no rows
export const groupResults = (rows) => KINDS
  .map(([kind, title]) => ({ kind, title, items: rows.filter((r) => r.kind === kind) }))
  .filter((g) => g.items.length);

// The selected result after an arrow key, wrapping at both ends; -1 is nothing selected yet
export function moveSelection(index, count, key) {
  if (!count) return 0;
  if (key === 'ArrowDown') return (index + 1) % count;
  return index <= 0 ? count - 1 : index - 1;
}
