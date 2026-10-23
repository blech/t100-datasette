# Family rules: leftovers grouped by maker

## Intent

The aircraft families (`data/aircraft_families.csv`, built into `aircraft_family`) are meant to be lines of aircraft that people recognise, like the 737 or the Bell helicopters. They do that for 51 families. For the other 182 of the 447 aircraft types they don't:

- 137 types match no rule and fall into one of six catch-alls named after the BTS aircraft group (`_GROUP_FALLBACK` in `build_database.py`): Other piston (64), Other turboprop (33), Other jet (23), Other quad-jet (10), Other helicopter (5), Other tri-jet (2).
- 45 types are caught by one broad rule, 172, "Light piston / utility", which matches any name containing Cessna, Piper, Beech 18, Islander, Beaver, Otter, Gipps, Float, Navajo or Cherokee, whatever the aircraft's kind. It pulls in four turboprops (Cessna 441, Skycourier, Piper Cheyenne, T-1040) and the Pilatus Britten-Norman Trislander (which BTS files as four-engine piston).

So the Piston, four-engine kind shows a Douglas DC-6A beside two Lockheeds under "Other piston", and the Trislander under "Light piston / utility". The grouping looks random because it is: it comes from a name pattern in one place and BTS's group in another.

Families matter more soon. The next projects (an aircraft page, a families matrix) put an aircraft's address under its family, as `/aircraft/<family>/<aircraft>`, so a leftover group becomes a place people browse. This design comes first because changing a family changes addresses.

## What to build

Leftovers are grouped by maker. A leftover is an aircraft type that no rule in the CSV matches.

1. **Delete rule 172.** The 45 types it caught become leftovers like the rest.
2. **Group leftovers by `aircraft_types.maker`.** A maker with two or more leftover aircraft types gets one family. Count after rule 172 is gone: that is 32 makers (Cessna 23 types, Piper 13, Beechcraft 11, Lockheed 10, McDonnell Douglas 8 and so on).
3. **Singleton makers, and types with no maker, join a per-kind catch-all.** 33 makers have one leftover aircraft type, and 6 types have no maker (the Float/Amphib and LaND entries). They go into a family named for the BTS kind of the type, one per kind they fall in.
4. **A maker's family covers all that maker's leftovers, whatever their kind.** Cessna's family holds piston singles, piston twins and turboprops. This is a deliberate call to match the count of about 90 families (51 real + 32 makers + the per-kind catch-alls). The kind filter on the aircraft table already works per type, so the kind menu still narrows these families correctly.
5. **Maker names are used as the `maker` column gives them,** with no merging: Beechcraft and Raytheon Beechcraft, or de Havilland and De Havilland Canada, are different makers here, as in the maker chart.
6. **Real families do not change.** Types matched by the 51 existing rules stay exactly where they are, including the helicopter families (Bell, Sikorsky and so on), which already work like this.
7. **A family has one class.** `family_year` keys a family on one class, so a maker's family of mixed kinds takes the most common class among its types (a tie goes to the alphabetically first). Nothing reads that column yet. `fallback` stays 1 for every leftover, including maker families.
8. **Names.** The builder settles the exact family names. My suggestions (marked as such): a maker's family is "Cessna (other models)"; the per-kind catch-all is "Other" plus the kind, lowercased, such as "Other piston, single-engine".

Approximate result: 51 real families + 32 maker families + up to 9 per-kind catch-alls, about 90 in all, against 58 now.

## Not in this change

- **Hand-written families for recognisable lines** that would be nice to have (the Lockheed Constellation, the Douglas DC-4/6/7 airliners, the Beech 99, the Pilatus PC-6, the Socata TBM, the AN-225 with the AN-124). They can be added one by one later as rules in the CSV, and then those types leave their maker's family. Not part of this change.
- **One family per aircraft**, and **maker plus kind families**, were considered and rejected: one per aircraft is 447 rows and makes the family level pointless, and maker plus kind gives about 144 families, mostly of one aircraft.
- **Fixing BTS's own mistakes in the kind column** (the Pilatus PC-24 is a jet filed as a turboprop, the Baron B-58 is a piston filed as a turboprop, the Trislander has three engines and is filed as four-engine piston). These are visible in the kind filter. Overriding them is a separate decision.

## Constraints

- **Database first.** This changes `aircraft_family` and the tables built from it (`family_year`, `family_detail_year`, `type_year` labels). Production must have the new tables loaded before the code that expects them is deployed, as in earlier changes (volume snapshot, gz insert dump, loader in one transaction, check totals, restart). The startup schema check and the smoke check already enforce the order.
- **No backup copy of `t100.db`**, here or on the server.
- **`schema.sql` must match `build_database.py`** (a test enforces it). The change adds no columns, so this is only a check.
- Tests that name "Other turboprop" or "Other helicopter" (`tests/test_rollups.py`, the JS tests' sample data) will need to follow the new names.
- The About page says "about 50 families" (`templates/about.html`); it will say about 90.
- Old links to a retired catch-all family page, such as `/aircraft/other-quad-jet`, will stop working. The site isn't promoted yet, and the user has said not to preserve links in that case.

## Left to the builder

- The exact names, if the suggestions above don't work with the slug rules.
- How to organise the code: whether the maker grouping lives in `rebuild_aircraft_family`, and how `_GROUP_FALLBACK` is replaced.
- Whether a maker family's `subfamily` stays empty (as leftovers are now, so no "split by version") or takes something from the type's name.
- Tests, and a before-and-after list of every type whose family changes, for the user to review before anything ships.

## Success

Every one of the 447 aircraft types is in a family a person could name: a recognisable line, a maker, or a plainly labelled "Other …". No family mixes aircraft from different makers except the per-kind catch-alls. The user reviews the full before-and-after list before the database goes anywhere near production.
