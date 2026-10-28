// Which flights a chart counts when nobody has chosen: passenger flights, except for freight, where all flights, since
// freighters carry most of it (an airport like ANC or OAK would look nearly empty on passenger flights alone)
export const FLIGHTS = ['passenger', 'freight', 'all'];

export const defaultFlights = (measure) => (measure === 'freight' ? 'all' : 'passenger');

// the flights to show after the measure changes: a choice left at the old measure's default moves to the new one's; one
// made on purpose stays
export const flightsAfter = (flights, from, to) => (flights === defaultFlights(from) ? defaultFlights(to) : flights);
