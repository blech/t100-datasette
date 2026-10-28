# Cargo airlines: the October 2002 note on airline pages

Done (branch `cargo-2002-note`).

## The problem

From October 2002 BTS required domestic all-cargo airlines to report (see "Known gaps and breaks" on the about page). Before that, most of their domestic flying is missing. So an airline page in freight mode makes FedEx look as if its freight leapt at the end of 2002. The about page explains this, but someone on FedEx's page won't see it.

## Which airlines it affects

Only the airlines whose own data show the change, found from the data rather than from what kind of airline they are. Foreign cargo airlines, such as Cargolux, Nippon Cargo and AeroLogic, have no domestic flying in the data, so their pages are consistent throughout and never qualify.

The test, on each airline's domestic all-cargo departures (classes G and P), as monthly rates:
- **October–December 2002 at least 1.5 times January–September 2002**, or any where there were none;
- **still at least 1.5 times through 2003**, so a busy fourth quarter on its own doesn't count (World Airways repeats its 2002 jump in Q4 2003; Southern Air and Omni fall back);
- **at least 10 a month in both**, so a handful of flights doesn't count, nor an airline that only started in 2003 (Custom Air Transport, Gulf and Caribbean Cargo).

Airlines are counted by `airline_id`, as the pages group them. In the current data that picks out 22:

| Airline | Jan–Sep 2002, a month | Oct–Dec 2002, a month |
|---|---|---|
| Federal Express | 0 | 24,777 |
| Empire Airlines (FedEx's feeder) | 0 | 1,844 |
| Astar USA (DHL) | 59 | 1,692 |
| Kitty Hawk Aircargo | 0 | 1,053 |
| Aloha Airlines | 0 | 949 |
| Alaska Central Express | 0 | 905 |
| Express.Net Airlines | 0 | 711 |
| Ryan International Airlines | 0 | 703 |
| Air Transport International | 0 | 589 |
| Northern Air Cargo | 0 | 582 |
| USA Jet Airlines | 132 | 582 |
| Capital Cargo International | 25 | 554 |
| Everts Air Cargo | 170 | 452 |
| Sky Lease Cargo | 0 | 425 |
| Atlas Air | 64 | 322 |
| Polar Air Cargo Airways | 113 | 227 |
| Northwest Airlines (in the Delta group) | 1 | 217 |
| Gemini Air Cargo Airways | 9 | 171 |
| Olson Air Service | 95 | 146 |
| Bering Air | 24 | 47 |
| Pacific Island Aviation | 0 | 42 |
| Mountain Bird/Salmon Air | 0 | 27 |

The small Alaskan carriers arrive with the same October 2002 change, which also brought in aircraft of 60 seats or fewer.

Not affected:
- **UPS:** steady through 2002. Its domestic flying appears in January 2001, which the about page notes separately.
- **Airborne (ABX):** its domestic flying appears in January 2005 (see Related).

## How it works

1. **Server:** `plugins/t100_globe.py` runs `REPORTING_2002_SQL` (2002 and 2003 of the segment tables, about a second) the first time an airline page is rendered, applies the test in `reporting_2002()`, and keeps the result for as long as the server runs. There is no new table, so a deploy needs no change to the Fly volume.
2. **Page:** the over-time page of an airline, or of a group with such a member, includes the note, hidden, naming each one: "Federal Express went from none to about 24,800 a month at the end of 2002: that jump is the reporting, not new flying", with a link to `/about#breaks`. A group's page names its members, so Delta's names Northwest.
3. **Browser:** `static/charts/airline.js` shows the note while the "How big" chart includes all-cargo flights (freight flights or all flights), whatever it measures, and hides it on passenger flights alone.

## Related

- **The airport-pairs chart:** "How many places" on the same page counts every flight, so FedEx's pairs jump at the end of 2002 too, whatever the menus say. The note sits under "How big" and doesn't mention it.
- **Airborne Express (ABX):** no domestic flying in the data until January 2005, and its international flying starts in October 2002. The about page doesn't mention this yet. It probably needs its own line under "Known gaps and breaks", and perhaps the same kind of note on its page.
- **Freight-carrier label:** a possible later addition. Label an airline by its share of departures in classes G and P, per year: 90% or more is a cargo airline, 10–90% is mixed, under 10% is a passenger airline. The mixed group is mostly foreign flag carriers whose freighters share the passenger code (China Airlines 66% in 2024, Cathay 56%, Korean 46%), plus Sun Country (25%), which flies Amazon freighters. Passengers per departure is a poor signal, because small commuter carriers also average only 2–6. Freight weight is patchy too: Nippon Cargo reports almost none.
