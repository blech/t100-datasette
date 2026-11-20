# European airports (t_avia)

Exploration on branch `explore/eu-uk-data`. A second database, `t_avia.db`, built from Eurostat's air transport route
tables with the CAA's UK tables filling the UK's missing years, shown through the T-100 site's own airport pages.

## Why

T-100 only sees a European airport's flights to and from the US: 9.4m of Heathrow's 60.5m passengers in 2001, 27 of its
200-odd destinations. The aim is to look at Heathrow over time the way the site shows JFK or SFO: its destinations
coming and going year by year, on the matrix, the map and the distances chart. The same holds for every other airport
Eurostat covers (Frankfurt, Paris CDG, Amsterdam and the rest). A UK page came first, but Eurostat covers the whole of
Europe in the same shape, so the UK is just the first test case.

## Goals

- Every airport Eurostat reports routes for (414 in the route tables) gets the T-100 airport pages that don't depend on
  airlines (builder's call, from the reviewer's reading of the site): the over-time page at the bare address
  (`/europe/airports/LHR`, as `/airports/LHR` is on T-100), the destinations matrix (`/destinations`), the changes page
  (`/changes`), the globe/map with its year and month play (`/globe`), and the distances chart (`/distances`). Charts
  split by airline group show one "all airlines" group.
- Heathrow and the other UK airports run 1990 to 2025: Eurostat where it has the airport's year, and the CAA's passenger
  figures for every other UK airport-year in the CAA tables (1990–1992 and 2020–2025 for Heathrow; more years for a UK
  airport Eurostat reports for less of the time, and all its years for one it never reports). A UK airport in the CAA
  tables gets a page even if Eurostat doesn't report it (builder's call).
- The pages look and behave like the T-100 ones, using the same templates and JavaScript, not a copy.

## Non-goals (for now)

- Airline and aircraft breakdowns. Eurostat publishes only "EU-licensed or not" per airport, nothing per route, so
  there is nothing to show. The route page (`/airports/<A>/<B>`) is out.
- The busiest-airports table, risers and fallers, routes matrix, city and city-pair pages, the airports map, and the
  overall distances page. These can follow once the airport pages work; some need a rule for routes reported from both
  ends (below).
- Pages for airports that aren't reporting airports. JFK appears on Heathrow's page as a destination, but a European
  JFK page would only show its European routes, the same partial view T-100's Heathrow note apologises for.
- Deploying to Fly. This is local first; deploying needs `t_avia.db` on the volume and `serve_public.sh` serving a second
  file. The work stays on `explore/eu-uk-data` until deploying is in scope, but the changes to the T-100 side are made
  so that merging would be harmless without `t_avia.db`: the `/europe/` pages answer 404, the link from a T-100 page
  only appears when `t_avia` is loaded, and the T-100 tests, `t100_guard.py` and the smoke check are unaffected
  (builder's call).
- Monthly CAA data.

## Anti-goals

- Mixing sources on one page. A T-100 page counts only T-100 and a European page only Eurostat and CAA, so a US route
  is never counted twice and never needs a rule about which source wins. Heathrow–JFK is on both sites' Heathrow pages,
  each from its own source.
- A fork of the presentation layer. If a page needs its own copy of the matrix or globe code to work, that's a sign
  the shared code needs a parameter, not a copy.

## Approaches

- **Chosen: a second database on the same site, sharing the UI.** `t_avia.db` beside `t100.db`, its canned queries
  under `databases: t_avia:` in `datasette.yml`, pages under their own address prefix, built from the same templates
  and static modules with the database as a parameter.
- A separate project and site: the most independent, but two copies of the presentation code would drift, and it's the
  most work before Heathrow can be seen at all.
- New tables in `t100.db`: the simplest to deploy, but the sources are only separated by table names, and the 2.9 GB
  file has to carry the European data through every rebuild.

For the UK's years outside Eurostat (the user's choice): the CAA's passenger figures are added for 1990–1992 and
2020–2025, with flights and seats left empty, rather than stopping at 2019 or showing two series.

## Sources

All raw files are in `source_downloads/` (gitignored), fetched by `scripts/fetch_eurostat.py` and `scripts/fetch_caa.py`
(2015 onwards; 1990–2014 are zips downloaded by hand).

**Eurostat `avia_par_xx`** (35 files, one per reporting country): rows keyed `freq,unit,tra_meas,airp_pr`, with columns
for each year (`2019`), quarter (`2019-Q1`) and month (`2019-01`); `:` means not published (below a threshold, or none),
and some values carry a flag after a space. `airp_pr` is `<country>_<ICAO>_<country>_<ICAO>`, reporting airport first.
Measures: `PAS_CRD` (passengers carried, by where they boarded and left the flight) and `PAS_BRD` (on board, which adds
people staying on through a stop), `CAF_PAS` (passenger flights), `ST_PAS` (seats), each also as `_ARR` and `_DEP`.
Years vary by country: UK 1993–2019, Germany 1993–2024, Poland 2004–2024. Heathrow–JFK's flights agree with T-100's
within about 1% in every year, and its passengers within about 3%.

**Eurostat `avia_gor_xx`** (35 files): the same for freight and mail by route, in tonnes.

**CAA table 12.1** (international routes) and **12.2** (domestic routes), one CSV a year: passengers only (scheduled and
charter), both directions together, airports by name (`HEATHROW`, `NEW YORK (JF KENNEDY)`), small routes lumped into an
`OTHER ROUTES` row per country. The columns are the same from the 1990 re-issue to 2025, apart from 1997–2000, which are
`.xls` only, and a byte-order mark on the later files. CAA's 12.1 passengers equal Eurostat's UK `PAS_CRD` exactly (both
are the CAA's figures).

## Decisions

- **Passengers are passengers carried (`PAS_CRD`).** It is what the CAA counts, so the UK series runs on from 2019 to
  2020 with no change of measure, and it starts in 1993 where `PAS_BRD` starts in 1994. It differs from T-100's
  on-board count by the through passengers (3% on Heathrow–JFK). The small print says so.
- **An airport's routes come from its own country's file**, where it is the reporting airport. A pair between two
  reporting airports (Heathrow–CDG) is in both the UK and French files; Heathrow's page uses the UK row and CDG's page
  the French one, so an airport page never needs the mirror.
- **CAA airport names become ICAO codes** through a table learnt from the years both sources cover: for each CAA route
  and year 1993–2019 whose passengers equal exactly one Eurostat UK pair's, the names vote for that pair's codes, and
  each name takes its majority. In 2001 that matches about half of CAA's routes, the rest being routes Eurostat doesn't
  publish, and names come out consistently (HEATHROW is EGLL on 105 routes). Names it can't settle, and ones only seen
  after 2019, go in a hand-kept `data/caa_airports.csv` (name, ICAO), which also overrides the learnt table.
  `OTHER ROUTES` rows are dropped.
- **CAA years carry passengers only.** Flights, seats and directions are empty for UK routes in 1990–1992 and
  2020–2025, and freight comes only from Eurostat. In those years a route is included if it has **10,000 passengers or
  more** (the user's choice), Eurostat's own publishing limit, so the destination count doesn't jump at 1992/1993 or
  2019/2020 just because the source changes; the minimum control reads "at least 10,000 passengers" in those years.
  The flights and seats measures and the in/out choice say there is no data rather than showing zero.
- **Destination links** (the user's choice): a reporting airport (CDG) links to its European page
  (`/europe/airports/CDG`), a US airport (JFK) to its T-100 page (`/airports/JFK`), and any other (Dubai) has no link.
  Each page still counts only its own source; the link is just navigation. The shared code's link-building takes the
  same database parameter as `queryUrl`, not only the data fetches.
- **Codes on the pages are IATA where one exists**, from `openflights_airports.icao_code`, so Heathrow is
  `/europe/airports/LHR` as on the T-100 site. The ICAO code is the fallback, and the key in the database. About 210 of
  the 1,073 partner codes aren't in OpenFlights; some are Eurostat placeholders (`ED99`, presumably "other German
  airports"), the rest old or small airfields. A `data/avia_airport_overrides.csv` gives names and coordinates where
  needed, and placeholders are dropped or shown as unnamed.
- **Domestic or international** comes from the two airports' country prefixes.
- **The address prefix is `/europe/`**: `/europe/airports/LHR`, `/europe/airports/LHR/globe`,
  `/europe/airports/LHR/distances`. The UK isn't in the EU, and the data includes Norway, Switzerland, Türkiye and the
  Balkans.
- **Freight is in tonnes**, as Eurostat gives it. T-100's is in pounds; where the shared code shows freight it needs a
  unit, not a silent conversion. `avia_gor` gives freight loaded and unloaded over all flights (`FRM_LD_NLD`) and the
  number of freight-only flights (`CAF_FRM`), but not freight split by kind of flight, so the European pages' freight
  is one "all flights" kind and their flights measure is passenger flights plus freight-only flights, with the menu
  offering only the choices that have data (builder's call).
- **Distances are in miles** and great-circle, so Heathrow's distances chart compares directly with JFK's. The check of
  BTS distance against great-circle distance doesn't apply and is off for these pages (builder's call).
- **Eurostat only publishes routes of about 10,000 passengers a year or more.** In 2019 its UK file has 1,217 airport
  pairs, the smallest with 10,200 passengers, so the 24-flight cut-off hardly matters in Eurostat years. The CAA lists
  every route (2,829 international routes in 2019, down to one passenger).

## Data

`t_avia.db`, built by its own script (`build_t_avia.py`), separate from `build_database.py`:

- `route_year`: reporting airport, partner airport (ICAO), year, source (`eurostat` or `caa`), passengers, flights, seats,
  freight, with departures and arrivals separately where Eurostat has them. One row per reporting airport, partner and
  year.
- `route_month`: the same by month, Eurostat only, for the globe's month play.
- `airports`: every airport that appears (ICAO, IATA, name, city, country, latitude, longitude, reporting or not), from
  OpenFlights and the overrides file. It is copied into `t_avia.db` so the database stands alone.
- `caa_names`: the learnt and hand-kept CAA name to ICAO table, with how each was settled.
- `pair_distance` for the pairs in `route_year`, great-circle only (Eurostat gives no distance).

Canned queries under `databases: t_avia:` with the **same names, parameters and column shapes** as the T-100 ones the
airport pages call (`airports`, `routes_by_year`, `routes_by_month`, `airport_size`, `airport_changes`, `airport_gone`,
and whatever else those pages fetch), so the JavaScript only needs to know which database to ask. Where a T-100 column
has no counterpart (an airline group in `airport_size`), the query returns a single "all airlines" group.

Size: about 19,000 airport pairs and 190,000 yearly passenger figures, so the database is tens of MB, not GB.

## Shared UI

- The database name is a parameter. Today `/t100/` is written into `static/globe/src/api.js` (`queryUrl`) and
  `static/common/datalink.js`, and `get_database("t100")` into about 15 places in `plugins/t100_globe.py`. The pages
  under `/europe/` set the database (a `data-database` attribute on `<body>`, read by `queryUrl`) and the plugin's
  airport views take it as an argument.
- The European airport pages are the same templates as the T-100 ones, with the parts that don't apply left out (the
  airline breakdowns, the rank line, the route links) and their own note in place of `_foreign_note.html` saying what
  the data covers: Eurostat or CAA, passengers carried, the years with passengers only.
- Links: the T-100 note on a reporting airport's page (`/airports/LHR`) links to `/europe/airports/LHR`, and the
  European page links back. There's no new nav section in the first version.
- The look follows `docs/site-coherence.md`; numbers go through `static/common/numbers.js`.

## Left to the builder

- How `build_t_avia.py` reads the files (streaming the gzipped TSVs, which are 1–12 MB each), and its tests.
- Converting the CAA's 1997–2000 `.xls` files, or leaving those four years out for a first pass.
- The exact shape of the shared code's database parameter, provided the T-100 pages keep working and their tests pass.
- Which of the airport page's charts work unchanged with the European queries, and which need a "no data in this year"
  state.
- What the European pages say about flags on Eurostat values and the routes below its thresholds.

## Later

- The busiest-airports table and risers and fallers for European airports.
- The routes matrix and airports map, which need a rule for pairs reported from both ends (probably each country's
  departures only, as Eurostat does for its own totals).
- Deploying: `t_avia.db` on the Fly volume, `serve_public.sh` and the smoke check.
- Monthly CAA data for the UK's 2020–2025 globe months.
