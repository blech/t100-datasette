const TITLES = { airport: 'Airports', europe_airport: 'European airports', city: 'Cities', europe_country: 'European countries', airline: 'Airlines', aircraft: 'Aircraft' };

// What was typed -> the three words the search query takes: lowercase, the first three, padded with ''
export const tokens = (text) => {
  const words = String(text).toLowerCase().split(/\s+/).filter(Boolean).slice(0, 3);
  return [words[0] || '', words[1] || '', words[2] || ''];
};

// The site search's address for what was typed, or null when nothing was
export function searchUrl(text) {
  const [t1, t2, t3] = tokens(text);
  return t1 ? `/-/search.json?${new URLSearchParams({ t1, t2, t3 })}` : null; // plugins/t100_search.py: T-100's and the European pages
}

// Rows from the search query -> [{ kind, title, items }], the kinds in the order their first row comes (the query puts the best match first),
// leaving out a kind with no rows
export function groupResults(rows) {
  const groups = new Map();
  for (const r of rows) {
    if (!groups.has(r.kind)) groups.set(r.kind, { kind: r.kind, title: TITLES[r.kind], items: [] });
    groups.get(r.kind).items.push(r);
  }
  return [...groups.values()];
}

// The selected result after an arrow key, wrapping at both ends; -1 is nothing selected yet
export function moveSelection(index, count, key) {
  if (!count) return 0;
  if (key === 'ArrowDown') return (index + 1) % count;
  return index <= 0 ? count - 1 : index - 1;
}
