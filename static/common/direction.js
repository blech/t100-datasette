// Which way a page counts flights: '' both directions (the default), 'out' leaving (or a route's first airport to its
// second), 'in' arriving (or the reverse). The words and cut-offs match plugins/t100_direction.py, which renders the headings.

const WORDS = { '': 'Flights', out: 'Departures', in: 'Arrivals' };

// ?dir= -> '', 'out' or 'in'; anything else counts as both
export function parseDir(search) {
  const d = new URLSearchParams(search || '').get('dir');
  return d === 'out' || d === 'in' ? d : '';
}

// an airport outside the US has only its flights to and from the US in the data, so leaving it is flying to the US
const WORDS_ABROAD = { '': 'Flights', out: 'Flights to the US', in: 'Flights from the US' };

export const countWord = (dir) => WORDS[dir];
export const abroadCountWord = (dir) => WORDS_ABROAD[dir];

// a route's one-way count is departures from the airport its heading starts with, whichever way that is
export const routeCountWord = (dir) => (dir === '' ? 'Flights' : 'Departures');

// LAX ↔ LHR, LAX → LHR or LHR → LAX, for the route at /airports/a/b
export const routeHeading = (a, b, dir) => ({ '': `${a} ↔ ${b}`, out: `${a} → ${b}`, in: `${b} → ${a}` })[dir];

// a cut-off defined in departures, doubled when both directions are counted (roughly monthly each way)
export const cutoff = (dir, base = 12) => (dir === '' ? base * 2 : base);

// an airline's pair: alphabetical with both directions together, as flown when each direction is its own row
export const pairLabel = (a, b, each) => (each ? `${a} → ${b}` : [a, b].sort().join(' ↔ '));

// a new direction reloads the page, so the server-written headings always match the numbers
export function setDir(dir) {
  const q = new URLSearchParams(location.search);
  if (dir) q.set('dir', dir); else q.delete('dir');
  const s = q.toString();
  location.search = s ? `?${s}` : '';
}

// the start of the message for a route with nothing to show, in the direction asked for
export const noFlights = (a, b, dir) => (dir === '' ? `No flights between ${a} and ${b}` : `No flights from ${dir === 'in' ? `${b} to ${a}` : `${a} to ${b}`}`);
