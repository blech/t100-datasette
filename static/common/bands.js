import { OTHER_AIRLINES } from '../home/src/airlines.js';

// the stacked passenger chart's pure parts (its drawing is in bandchart.js, which needs a browser)
export const ALL_AIRLINES = 'All airlines';

// what a series' colour key looks like in the popover: the others as a grey band, the whole market as a line, an airline its colour
export function bandKey(series, colourOf) {
  if (series === OTHER_AIRLINES) return { kind: 'other' };
  if (series === ALL_AIRLINES) return { kind: 'line' };
  return { kind: 'square', colour: colourOf(series) };
}

// year -> the top of its stack (the whole market, as "every other airline" is stacked last)
export const stackTotals = (bands) => new Map(bands.filter((d) => d.series === OTHER_AIRLINES).map((d) => [d.year, d.y2]));
