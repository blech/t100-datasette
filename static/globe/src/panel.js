import { formatCount, formatTons, exactCount, countLabel } from '../../common/numbers.js';

// A route's figures for the map's side panel: what is shown, what a screen reader hears instead, and the exact figure
const unitless = (s) => (s.startsWith('–') ? '–' : s);

export function routeFigures(r) {
  const count = (label, n, noun) => ({ label, shown: formatCount(n), spoken: unitless(`${countLabel(n)} ${noun}`), title: unitless(`${exactCount(n)} ${noun}`) });
  return [
    count('Departures', r.deps, 'departures'),
    count('Seats', r.seats, 'seats'),
    count('Passengers', r.passengers, 'passengers'),
    { label: 'Freight', shown: formatTons(r.freight), spoken: formatTons(r.freight, 'prose'), title: unitless(`${exactCount(r.freight)} lb`) },
  ];
}
