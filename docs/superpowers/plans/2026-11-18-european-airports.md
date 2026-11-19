# European airports (t_avia): prototype

Built straight through from `docs/superpowers/specs/2026-11-18-european-airports-design.md` at the user's request ("build out a
prototype all the way through … make any decisions that would otherwise be paused for … but record them"), on branch
`explore/eu-uk-prototype` (a worktree at `.claude/worktrees/eu-uk-prototype`, off `explore/eu-uk-data`). There was no
task-by-task plan; this file records what was built, the decisions made without the user, and what's left.

## What was built

- **`build_t_avia.py`** builds `t_avia.db` (about 180 MB, a minute and a half) beside `t100.db`:
  `uv run --with xlrd python build_t_avia.py --db t_avia.db --sources source_downloads --t100 t100.db`. Tables: `airport_info`,
  `route_year` (300,000 rows), `route_month` (2.2 million, Eurostat only), `caa_names` (how each CAA name got its code),
  `pair_distance` (great-circle miles) and `build_notes` (the CAA names with no code, biggest first, and other counts).
- **`data/caa_airports.csv`** (CAA names the figures can't settle, with optional years) and **`data/avia_airport_overrides.csv`**
  (old ICAO codes merged into current ones, and corrected names or IATA codes).
- **Queries** under `databases: t_avia:` in `datasette.yml`, with the T-100 airport pages' names, parameters and columns
  (`airports`, `routes_by_year`, `routes_by_month`, `airport_size`, `airport_changes`, `airport_gone`) and `europe_airports`.
- **`plugins/t_avia.py`**: `/airports/europe` (every reporting airport in a year, busiest first) and
  `/airports/europe/<code>`, `/destinations`, `/changes`, `/distances`, `/globe`, from the T-100 airport templates. Without
  `t_avia.db` loaded they answer 404.
- **Shared code**: `static/common/source.js` (which database, how a destination counts, where an airport links), read by
  `queryUrl`, `dataHref`, the over-time/changes, matrix and globe scripts; template conditionals on `europe`; the T-100
  plugin's views line and nav section for `/airports/europe/` paths, and a link from a T-100 airport abroad to its European pages.
- **Tests**: `tests/test_europe.py` (the loader's rules, the pages and queries over a tiny `t_avia.db`, the 404s) and
  `static/common/test/source.test.js`, plus a passengers case in `static/charts/test/airport.test.js`.

## Decisions made without the user (flag in the handoff)

1. **A UK airport's route list and passengers are the CAA's in every year, not only where Eurostat has nothing.** The design
   said Eurostat where it has the airport's year. But Eurostat leaves out many UK routes: Heathrow's 1993 Eurostat routes carry
   37m passengers of about 48m, and even in 2019 it lacks 94 of the CAA's Heathrow routes (3.2m passengers, Ibiza and Faro
   among them). Where both publish a route their passengers are the same figures (the CAA's), so the CAA's list is used
   throughout, with Eurostat's flights, seats and freight beside it where Eurostat has the route (`source` is
   `caa+eurostat`), passengers alone where it doesn't (`caa`), and Eurostat's own row where the CAA has none (`eurostat`: a
   name without a code, or a domestic route in 1997–2000). Heathrow's destinations of 10,000+ passengers now run 160–207 a
   year with no jump at 1993 or 2020.
2. **European pages count a destination by its passengers, not its flights**, everywhere a T-100 page counts flights: the
   places chart, the changes page, the map and matrix cut-off. The default is the user's 10,000 a year both ways (5,000 one
   way), and the "at least" menu offers 10,000, 50,000, 100,000 and 500,000. A route with 24 freight-only flights (12 one way)
   counts too, so freight routes aren't lost. On the changes page `deps_a` and `deps_b` carry passengers (the query
   descriptions say so), so the shared table code is unchanged.
3. **Flights are passenger flights and freight-only flights together** (`CAF_PAS` + `CAF_FRM`). In `airport_size` the
   passenger kind is passenger flights, seats and passengers; the freight kind is freight-only flights and *all* the freight,
   since Eurostat doesn't split freight by kind of flight.
4. **Freight is shown in short tons, like the T-100 pages**: the queries convert Eurostat's tonnes to pounds (× 2204.62), so
   every shared label ("short tons") is right. `t_avia.db` keeps tonnes.
5. **CAA names get codes year by year.** A name's code in a year is that year's majority of exact-figure matches, among the
   codes with real support (2 votes and a tenth of the top code's), else the nearest year's, so a code change (Athens LGAT →
   LGAV in 2001) is followed and one chance match (Bangalore matching Cork's figures once) isn't. Names never matched fall
   back to OpenFlights when a city has one airport, or one whose name has the bracketed hint (NEW YORK (NEWARK)). The 44
   biggest still unmatched are in `data/caa_airports.csv`, which takes optional years: the CAA's ISTANBUL is Atatürk to 2018
   and the new airport from 2019.
6. **Old Eurostat codes are merged into current ones** (`alias_of` in `data/avia_airport_overrides.csv`: FAJS → FAOR
   Johannesburg, ASSY → YSSY Sydney, HKNA → HKJK Nairobi and nine more). **Eurostat's placeholders** (`EG90`, `LF99`,
   `ZZZZ`: other or unknown airports) count in an airport's totals but are never a destination.
7. **Berlin Brandenburg is EDDB/BER over all its years**, Schönefeld's history included (Eurostat keeps one code for both).
   Kept merged as an inheritor airport (the user's call, 2026-11-19): BER's notes say its figures until October 2020 are
   Schönefeld's, and `/airports/europe/SXF...` redirects to BER (`INHERITED` in `plugins/t_avia.py`).
8. **The CAA's 1997–2000 tables are read from their spreadsheets with xlrd** (`uv run --with xlrd`; not added to the project's
   dependencies, and without it those years are skipped with a message). They are international only: 1997–2000 have no
   CAA domestic route table, so a UK airport's domestic routes then are Eurostat's (about ten for Heathrow in 1998–2000, none
   in 1997, which shows as a gap).
9. **`t_avia`'s airports table is `airport_info`**: named `airports`, Datasette served the table (100 rows a page) instead of the
   canned query of the same name, and the map found no coordinates.
10. **A way in**: `/airports/europe`, the reporting airports of a year (2024 by default, the last year most countries have),
    busiest first, with flights and freight beside passengers and destinations; any of the four ranks it (`?sort=`, a form
    button in each heading, so it works without JavaScript). A UK airport's CAA-only years have no flights or freight, so it
    ranks last by those. There's no nav section for Europe; the T-100 page of an airport abroad links to its European pages.
11. **Distances use the T-100 pages' axis** (`t100_distances.axis_max`), so Heathrow's chart compares with JFK's, and
    great-circle distances; the BTS distance check has nothing to do. The distances page opens on 2024.
12. **Links**: a matrix cell or row, a changes row and the map's panel open the route's page, as on T-100's pages (route pages
    were added on 2026-11-19, the user's call; until then these opened the destination's own pages). A route heading's codes,
    the map's destination and the matrix's tooltips follow the user's rule for an airport's own pages (European, T-100 for a US
    airport, none otherwise); the airport picker only goes to European airports.
13. **Left off European pages**: the airline split and airline columns (Eurostat names no airlines), the matrix's grouping by
    BTS city, the rank line.
14. **The European pages say what the data is** in a note in place of T-100's "outside the US" one (`_europe_note.html`): the
    sources, passengers carried, the CAA-only years with what's missing then, the 10,000 floor, and a link to the airport's T-100
    pages where it has some. The footer credits Eurostat and the CAA, and the tab title says "European airports".
15. **The pages live at `/airports/europe/...`** (moved from `/europe/airports/...` on 2026-11-19, the user's call, before any
    deploy): inside the Airports section, beside `/airports/cities` and `/airports/countries`, since most non-US sources are
    airport-only. `/europe` redirects to the index. A later, separate change may move T-100's airport pages to `/airports/us/...`
    (`us`, not `usa`: USA is Concord, NC's IATA code, and two letters can't clash with a 3-letter IATA or 4-letter ICAO code).
16. **Route pages** (`/airports/europe/<a>/<b>[/<year>]`, 2026-11-19): T-100's route template and script, from the origin's own
    report of the route (a pair between two reporting airports is reported twice, and the figures may differ a little; the page
    links to the other report). A route from an airport that doesn't report redirects to the other end's, the direction flipped.
    No airline or aircraft split and no table view (one series a year; `/t_avia/route` has the numbers). A year's page is
    Eurostat's months; the CAA's years have none, so their bars don't link and the year links skip them. One direction is
    Eurostat's figures alone. The monthly query is `route_by_month`, not T-100's `route_year`: the `route_year` table would
    shadow it (decision 9's trap again).

## Known gaps

- **Eurostat's early years are incomplete outside the UK too**: Frankfurt shows about 20m passengers in 1993, when it handled
  about 30m. The CAA fixes this for UK airports only.
- **346 CAA names have no code** (`build_notes.caa_unnamed_top` lists the biggest): their routes are left out of the CAA years.
- **234 airports have no coordinates** (mostly old or odd Eurostat codes: LECP, EDSO, EDDD, ENOS…), so the map and distances
  leave them out; the matrix shows them.
- **The 1997 domestic gap** (decision 8).
- The months (the map's month play, first and last flown) are Eurostat's only, so CAA years have none.
- Not deployed, and not checked with the JavaScript bundle (`npm run bundle`; the worktree has no `node_modules`).
- The changelog is the user's to write.

## Review focus

1. **Heathrow's pages** (`/airports/europe/LHR` and its views): 1990–2025 throughout, no step at 1993 or 2020 in the
   places chart, the note naming 1990–1992 and 2020–2025 as CAA-only.
2. **A non-UK airport** (`/airports/europe/FRA`): Eurostat only, months on the map, the note without the CAA sentences.
3. **The T-100 site without `t_avia.db`**: unchanged, `/airports/europe/...` 404 (`tests/test_europe.py`).
4. **The CAA naming** (`caa_names` in `t_avia.db`, `how` column): spot-check learnt codes with more than one candidate.
