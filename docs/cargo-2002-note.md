# Cargo airlines: the October 2002 note on airline pages

Not started. Waiting for the rollup rework, which this would touch.

## The problem

From October 2002 BTS required domestic all-cargo airlines to report (see "Known gaps and breaks" on the about page). Before that, most of their domestic flying is missing. So an airline page in freight mode makes FedEx look as if its freight leapt at the end of 2002. The about page explains this, but someone on FedEx's page won't see it.

## Which airlines it affects

Only US airlines' domestic flying. Foreign cargo airlines, such as Cargolux, Nippon Cargo and AeroLogic, have no domestic flying in the data, so their pages are consistent throughout.

The test: compare an airline's monthly rate of domestic all-cargo departures (classes G and P) in October–December 2002 with January–September 2002. It is affected if the later rate is at least 1.5 times the earlier one, or there was none before. In the current data that picks out 13 airlines:

| Airline | Jan–Sep 2002 | Oct–Dec 2002 |
|---|---|---|
| FedEx (FX) | none | 74,331 |
| Air Transport International (8C) | 1 | 1,806 |
| Astar, DHL's US airline (ER) | 531 | 5,076 |
| Kitty Hawk (KR) | none | 3,158 |
| Express.Net (TCQ) | none | 2,134 |
| Sky Lease Cargo (WI) | none | 1,274 |
| Alaska Central Express (KO) | none | 2,716 |
| Northern Air Cargo (NC) | none | 1,747 |
| USA Jet (U7) | 1,188 | 1,745 |
| Atlas (5Y) | 574 | 965 |
| PT | 221 | 1,661 |
| Gemini (GR) | 80 | 514 |
| Southern Air (9S) | 88 | 281 |

Not affected:
- **UPS:** steady through 2002. Its domestic flying appears in January 2001, which the about page notes separately.
- **Steady through 2002:** Evergreen, Amerijet, Arrow, Polar, Lynden and Kalitta report at much the same monthly rate before and after.

## How to build it

1. **Rollup build:** record the `airline_id`s that pass the test, as a small table or a column on `carrier_group`. It needs months, and the rollups the pages read (`carrier_group_year`) are yearly. Querying the segment tables on each page load would be too slow.
2. **Page render:** `resolve_airline` in `plugins/t100_globe.py` sets a flag when the airline, or any member of its group, is on that list. The airline template includes the note, hidden by default, linking to `/about#breaks`.
3. **Browser:** `static/charts/airline.js` shows the note while the chart measures freight or includes freight flights, and hides it otherwise. The airline page now reads `measure` and `flights` from the address (branch `airline-chart-settings`), so links from an airport's freight chart arrive with the note showing.

## Related

- **Airborne Express (ABX):** no domestic flying in the data until January 2005, and its international flying starts in October 2002. The about page doesn't mention this yet. It probably needs its own line under "Known gaps and breaks", and perhaps the same kind of note on its page.
- **Freight-carrier label:** a possible later addition. Label an airline by its share of departures in classes G and P, per year: 90% or more is a cargo airline, 10–90% is mixed, under 10% is a passenger airline. The mixed group is mostly foreign flag carriers whose freighters share the passenger code (China Airlines 66% in 2024, Cathay 56%, Korean 46%), plus Sun Country (25%), which flies Amazon freighters. Passengers per departure is a poor signal, because small commuter carriers also average only 2–6. Freight weight is patchy too: Nippon Cargo reports almost none.
