// Which of a city's airports are too small to list under it: those with under 2% of the city's flights, of its passengers and
// of its freight, each judged on its own (so an all-cargo airport with almost no passengers stays, and so does a small
// passenger airport with no freight). A city of one airport has nothing to be small beside. The small ones are added up into
// one "N other airports" row, so a city's rows still add up to the city.
export const SMALL_SHARE = 0.02;
const MEASURES = ['deps', 'passengers', 'freight'];

// airports: rows with deps, passengers and freight -> { shown, small }, each in the order given
export function splitSmall(airports, share = SMALL_SHARE) {
  if (airports.length < 2) return { shown: airports, small: [] };
  const total = Object.fromEntries(MEASURES.map((m) => [m, airports.reduce((n, a) => n + (Number(a[m]) || 0), 0)]));
  if (MEASURES.every((m) => total[m] === 0)) return { shown: airports, small: [] };   // nothing to be a share of
  const big = (a) => MEASURES.some((m) => total[m] > 0 && (Number(a[m]) || 0) / total[m] >= share);
  return { shown: airports.filter(big), small: airports.filter((a) => !big(a)) };
}

export const othersLabel = (n) => `${n} other airport${n === 1 ? '' : 's'}`;
