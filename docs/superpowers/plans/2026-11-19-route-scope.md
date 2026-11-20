# Route scope: a three-way split for both sites (idea, not designed)

A possible direction raised on 2026-11-19 while reviewing the European airports prototype. Nothing here is built or agreed; it
records what was checked so a design can start from it.

## The idea

Both datasets could split a route by how far its *jurisdiction* reaches, not just domestic or international:

| | T-100 (US) | t_avia (Europe) |
|---|---|---|
| nearest | same state (intrastate) | same country (domestic) |
| middle | other US state or territory | another EU member (intra-EU) |
| far | international | outside the EU (extra-EU) |

The shared charts (places over time, changes, the map's colours) could then use one three-way split on both sites.

## What exists today

- **t_avia**: `route_year.domestic` only (from the Eurostat file a row came from, or the CAA's 12.2 table). Every non-placeholder
  airport in `airport_info` has a `country_code` except about 155 old or odd Eurostat codes, mostly minor.
- **T-100**: every airport has a World Area Code by year in `airport_dir_year.wac`; US states and territories have one each
  (California 91, New York 22, Hawaii 2, Puerto Rico 3). `route_year_totals` has `origin`, `dest` and `domestic_deps`, so a route's
  two ends can be compared without the segment tables.

## What checking found (2026-11-19)

- LAX 2019: 34 routes within California (4.3m passengers), 168 to other states (26.3m).
- All of 2019: 6,717 intrastate route-pairs (71m passengers) against 20,805 interstate (750m).
- Cost of the join (`route_year_totals` to `airport_dir_year` at both ends): one airport's routes, unnoticeable; every domestic
  route in the database (about 740,000 route-years), 0.8–1.3 s depending on cache.
- 33 airports have more than one WAC across the years: probably recoding, not moves; not yet looked at.

## What a design would need to settle

1. **EU membership by year** for t_avia: a small `data/` file of member countries with joining and leaving years (2004, 2007,
   2013 enlargements; the UK leaving in 2020). Open question for the user: count a route by membership *in its year* (as Eurostat's
   own intra-EU aggregates do; suggested) or by today's membership. Also whether EFTA (Norway, Switzerland, Iceland) counts with
   the EU, as for most aviation purposes it does.
2. **Where the split is computed.**
   - Airport pages: at query time is fine (the join is cheap for one airport).
   - Site-wide summaries (like `route_band_year`'s domestic/international service): roll it up in
     `build_database.rebuild_derived_tables` as a third service value, rather than joining live on a summary page.
   - t_avia: a column added by `build_t_avia.py` (the database is rebuilt whole, so there's no rollup step to add).
3. **The 33 airports whose WAC changes**: use each year's WAC (as stored) or one per airport.
4. **Names and colours**: the shared charts' labels per site ("in California" / "in the UK"), and a third colour consistent with
   `docs/site-coherence.md`.
