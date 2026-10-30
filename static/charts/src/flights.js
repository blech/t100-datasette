// Which flights a chart counts when nobody has chosen: passenger flights, except for freight, where all flights, since
// freighters carry most of it (an airport like ANC or OAK would look nearly empty on passenger flights alone)
export const FLIGHTS = ['passenger', 'freight', 'all'];

export const defaultFlights = (measure) => (measure === 'freight' ? 'all' : 'passenger');

// the flights to show after the measure changes: a choice left at the old measure's default moves to the new one's; one
// made on purpose stays. Departures count either kind of flight equally well, so changing to them leaves flights alone,
// and changing from them treats any default (passenger or all) as not chosen
export const flightsAfter = (flights, from, to) => {
  if (to === 'deps') return flights;
  const unchosen = from === 'deps' ? ['passenger', 'all'] : [defaultFlights(from)];
  return unchosen.includes(flights) ? defaultFlights(to) : flights;
};

// The settings once one has been chosen (`after`, from `before`), or as an address asks for them (`before` alone),
// settled as the sentence reads, left to right: a measure the page doesn't offer becomes passengers; the measure moves
// flights left at its default; a split by passenger or freight needs all flights, so choosing it (or an address asking
// for it, with flights left at their default) takes them, and other flights put the split back to `splitDefault`.
// `offered` lists, per setting, the choices the page has (all, if left out).
export function settle(before, after = null, { offered = {}, splitDefault = 'service' } = {}) {
  const ok = (key, v) => !offered[key] || offered[key].includes(v);
  let { measure, flights, split } = after ?? before;
  if (!ok('measure', measure)) measure = 'passengers';
  if (split !== undefined && !ok('split', split)) split = splitDefault;
  if (measure !== before.measure && split !== 'kind') flights = flightsAfter(flights, before.measure, measure);
  const asked = after === null && flights === defaultFlights(measure);
  if (split === 'kind' && (before.split !== 'kind' || asked)) flights = 'all';
  if (!ok('flights', flights)) flights = defaultFlights(measure);
  if (split === 'kind' && flights !== 'all') split = splitDefault;
  return split === undefined ? { measure, flights } : { measure, flights, split };
}

// What a page's rows (airport_size, carrier_group_detail) leave worth offering: freight, if they carry any; freight
// flights, and a split by passenger or freight, if any are freighters'
export function offeredBy(rows, { measures, splits }) {
  const freight = rows.some((r) => Number(r.freight) > 0);
  const freighters = rows.some((r) => r.kind === 'freight');
  return {
    measure: measures.filter((m) => m !== 'freight' || freight),
    flights: FLIGHTS.filter((f) => f !== 'freight' || freighters),
    split: splits.filter((s) => s !== 'kind' || freighters),
  };
}
