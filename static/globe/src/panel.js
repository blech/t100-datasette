import { formatCount, formatTons, exactCount } from '../../common/numbers.js';
import { countWord } from '../../common/direction.js';

// A route's figures for the map's side panel: each rounded, with the exact figure for hovering
const unitless = (s) => (s.startsWith('–') ? '–' : s);

export function routeFigures(r, dir = '') {
  const count = (label, n, noun) => ({ label, shown: formatCount(n), title: unitless(`${exactCount(n)} ${noun}`) });
  return [
    count(countWord(dir), r.deps, countWord(dir).toLowerCase()),
    count('Seats', r.seats, 'seats'),
    count('Passengers', r.passengers, 'passengers'),
    { label: 'Freight', shown: formatTons(r.freight), title: unitless(`${exactCount(r.freight)} lb`) },
  ];
}
