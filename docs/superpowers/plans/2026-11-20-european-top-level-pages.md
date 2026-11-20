# European top-level pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `/airports/europe` the T-100 Airports section's top-level views: over time, busiest routes, distances, the
busiest-routes map, and countries (a list and a page per country), each counting a route reported by both its airports once.

**Architecture:** `build_t_avia.py` adds `pair_year` (one report per airport pair and year) and, from it, the routes
matrix's `top_route_year` and `route_band_year`, built by T-100's own `rebuild_top_route_year`. Canned queries under
`databases: t_avia:` take T-100's names and columns, so the T-100 templates and scripts serve the European pages as they
already do for an airport's pages: `plugins/t_avia.py` renders them with a `europe` context, `<body data-database="t_avia">`
switches the scripts' queries, and `static/common/source.js` decides links.

**Tech Stack:** Python 3.14 / SQLite / Datasette (plugins, Jinja templates, canned queries in `datasette.yml`), plain ES modules
with `node --test`, pytest.

**Spec:** No separate design doc (the user's call, 2026-11-20). The approved design is the "Decisions" section below, from the
conversation; the European airports' earlier decisions are in `docs/superpowers/plans/2026-11-18-european-airports.md` (read its
decisions 1–19 first: they explain `route_year`, `source`, `on_board`, placeholders, PAR, `INHERITED`).

## Decisions (approved 2026-11-20)

1. **Pages and addresses:** `/airports/europe/over-time`, `/airports/europe/routes`, `/airports/europe/distances`,
   `/airports/europe/globe`, `/airports/europe/countries`, `/airports/europe/countries/<slug>`. Not ported: cities, most
   dedicated, route tables; risers and fallers deferred (coverage changes need their own design).
2. **One report per pair-year.** A pair of two reporting airports is in `route_year` twice (each end's report, both directions
   together in each). `pair_year` keeps one: a report with flights or freight (Eurostat's, `source` `eurostat` or
   `caa+eurostat`) over a CAA-only one (`caa`), then one with freight over one without (amended after review, 2026-11-20: Istanbul's
   reports had no freight before 2023), then the one with more passengers, then the alphabetically first reporting airport. Not averaged: averages would match neither airport's route page. Pairs with a placeholder at either end are left
   out; PAR is not a placeholder.
3. **Codes:** `pair_year.a`/`b` are display codes (`airport_info.code`: IATA, or ICAO where none), `a < b`, as T-100's
   `top_route_year` has them, so links work unchanged. `airport` is the display code of the end whose report was kept.
4. **Flights** in `pair_year.deps` are `COALESCE(pax_flights,0) + COALESCE(freight_flights,0)`, NULL when both are NULL (CAA
   years). **Freight** stays in tonnes in the table; the queries convert to pounds (× 2204.62), as every t_avia query does.
5. **Service** is `domestic` / `international` from `route_year.domestic` (same country), the T-100 vocabulary.
6. **Over time** lists reporting, non-placeholder airports with at least 100,000 passengers (both ways) in some year; it
   counts each airport's own report (no double counting there). `city` is `airport_info.city`, `market_id` NULL, so the
   matrix's city grouping and the region menu are hidden on European pages.
7. **Countries are Eurostat's reporting countries** (`airport_info.country_code`, the file an airport's figures come from: Basel
   is Switzerland's, Jersey the UK's), named from a new `data/eurostat_countries.csv` (`code,name,slug`, the 35 codes now in
   `t_avia.db`: AT … UK, with EL → Greece, UK → United Kingdom). The list ranks countries in a year by passengers, flights,
   airports or freight; a country's page is the European index filtered to it, with the same columns and sort.
8. **Coverage note** on over time, routes, distances and the map: one sentence that the airports and countries covered grow over
   the years, so a total's rise is partly coverage, and that a route between two reporting airports is counted once.
9. **Data fix found while planning:** the CAA's domestic name "BEDFORD (THURLEIGH)" was guessed as KBED (Massachusetts), making
   a US airport a UK reporter. A CAA domestic route whose code isn't a UK one (`EG..`) is now counted as unnamed instead.

## Global Constraints

- Port 8808 is the user's server: never stop it. Test servers on other ports (8818 is the session's, `--host 0.0.0.0`).
- Don't edit `templates/changelog.html`. Keep `README.md` in step (pages, tables, queries). Numbers through
  `static/common/numbers.js`.
- A t_avia canned query must not share a table's name (Datasette serves the table instead: decisions 9 and 16 of the 2026-11-18
  plan). `top_routes_by_year`, `busiest_routes_year`, `pair_distances_by_year`, `airport_by_year`, `europe_countries` are free;
  the tables are `pair_year`, `top_route_year`, `route_band_year`.
- In SQLite an ORDER BY expression resolves a name to the source column, not the SELECT alias: rank in an outer query (CTE).
- Rebuild: `uv run --with xlrd python build_t_avia.py --db t_avia.db --sources ../../../source_downloads --t100 t100.db`
  (about 2½ minutes; `t_avia.db` is a symlink to the main checkout's). Restart 8818 after it.
- Without `t_avia.db` loaded every `/airports/europe...` path answers 404 and the T-100 site is unchanged.

## Review Focus

1. **A pair reported by both ends, with different figures** (EGLL–LFPG, 2019): the routes matrix, the map and the distances
   page show it once, with one end's whole report, never the sum. Pinned in Task 1.
2. **A CAA-only year** (Heathrow 1990–1992, 2020–2025): routes have passengers but no flights; ranking by flights must not
   put them first or crash on NULL. Pinned in Task 2 (`deps` NULL sorts last).
3. **A country with one reporting airport** (Luxembourg, Malta) and **a country slug that doesn't exist**: one row; 404.
   Pinned in Task 5.
4. **The 2025 year** (CAA only, UK airports alone): the map and routes default to 2024 (`DEFAULT_YEAR`), not the last year.
   Pinned in Task 4.
5. **Links out of the new pages**: a matrix row, a map airport and a route go to `/airports/europe/...` for a European
   airport, the T-100 page for a US one, nowhere otherwise (`airportHref`'s rule). Pinned in Task 3.

---

### Task 1: `pair_year`, `top_route_year` and `route_band_year` in `t_avia.db`

**Files:**
- Modify: `build_database.py` (around `rebuild_top_route_year`, line ~622, and the schema text, line ~158)
- Modify: `build_t_avia.py` (SCHEMA; a new `write_pairs(db)` called in `build()` after `write_airports`; `add_caa`)
- Test: `tests/test_europe.py`

**Interfaces:**
- Produces: tables `pair_year (a TEXT, b TEXT, year INTEGER, airport TEXT, source TEXT, domestic INTEGER, deps INTEGER,
  seats INTEGER, passengers INTEGER, freight REAL, PRIMARY KEY (a, b, year)) WITHOUT ROWID`; `top_route_year` and
  `route_band_year` with T-100's exact columns. `build_t_avia.write_pairs(db) -> int` (rows written).
- `build_database.TOP_ROUTE_SCHEMA: str` (the two CREATE TABLEs, moved out of the schema text and used by `create_schema`
  too, so `schema.sql` is unchanged; `tests/test_schema_check.py` proves it) and
  `rebuild_top_route_year(conn, pairs_sql=None) -> int`: with `pairs_sql` it skips `create_schema(conn)` and ranks the rows
  that SQL gives (`a, b, year, service, deps, seats, passengers, freight`, one per pair-year) instead of aggregating
  `route_year_totals`; `None` is today's behaviour exactly. t_avia passes
  `SELECT a, b, year, CASE WHEN domestic = 1 THEN 'domestic' ELSE 'international' END, deps, seats, passengers, freight FROM pair_year`.

- [ ] **Step 1: Write the failing tests**

```python
def pairs_db(rows):  # rows: (airport, other, year, source, domestic, passengers, pax_flights, freight)
    db = sqlite3.connect(":memory:")
    db.executescript(b.SCHEMA)
    db.executemany("INSERT INTO airport_info (icao, code, reporting, placeholder) VALUES (?,?,?,?)",
                   [("EGLL", "LHR", 1, 0), ("LFPG", "CDG", 1, 0), ("KJFK", "JFK", 0, 0), ("EG90", "EG90", 0, 1)])
    db.executemany("INSERT INTO route_year (airport, other, year, source, domestic, passengers, pax_flights, freight) VALUES (?,?,?,?,?,?,?,?)", rows)
    return db

def test_a_pair_reported_twice_is_kept_once_with_one_ends_report():
    db = pairs_db([("EGLL", "LFPG", 2019, "caa+eurostat", 0, 900_000, 9_000, 10.0),
                   ("LFPG", "EGLL", 2019, "eurostat", 0, 950_000, 9_100, 12.0),
                   ("EGLL", "KJFK", 2019, "caa+eurostat", 0, 3_000_000, 14_000, 100.0),
                   ("EGLL", "EG90", 2019, "eurostat", 1, 50_000, 500, 0.0)])
    b.write_pairs(db)
    rows = db.execute("SELECT a, b, airport, passengers, deps FROM pair_year ORDER BY a").fetchall()
    assert rows == [("CDG", "LHR", "CDG", 950_000, 9_100), ("JFK", "LHR", "LHR", 3_000_000, 14_000)]  # the placeholder is out

def test_eurostats_report_beats_a_caa_only_one_even_with_fewer_passengers():
    db = pairs_db([("EGLL", "LFPG", 2021, "caa", 0, 500_000, None, None),
                   ("LFPG", "EGLL", 2021, "eurostat", 0, 480_000, 4_000, 3.0)])
    b.write_pairs(db)
    assert db.execute("SELECT airport, passengers, deps FROM pair_year").fetchall() == [("CDG", 480_000, 4_000)]

def test_the_routes_matrix_tables_count_each_pair_once():
    db = pairs_db([("EGLL", "LFPG", 2019, "caa+eurostat", 0, 900_000, 9_000, 10.0),
                   ("LFPG", "EGLL", 2019, "eurostat", 0, 950_000, 9_100, 12.0)])
    b.write_pairs(db)
    assert db.execute("SELECT SUM(passengers) FROM route_band_year WHERE year = 2019").fetchone() == (950_000,)
    assert db.execute("SELECT a, b, year_rank FROM top_route_year").fetchall() == [("CDG", "LHR", 1)]

def test_a_caa_domestic_name_coded_abroad_is_unnamed():
    # Decision 9: BEDFORD (THURLEIGH) guessed as KBED must not make KBED a UK reporter
    db = pairs_db([])
    codes = {"LUTON": "EGGW", "BEDFORD (THURLEIGH)": "KBED", "NEW YORK (JFK)": "KJFK"}
    added, joined, unnamed = b.add_caa(db, {2003: [("dom", "LUTON", "BEDFORD (THURLEIGH)", 2),
                                                   ("int", "LUTON", "NEW YORK (JFK)", 5_000)]},
                                       lambda name, year: codes[name], {})
    assert db.execute("SELECT airport, other FROM route_year ORDER BY airport").fetchall() == [("EGGW", "KJFK")]
    assert unnamed["BEDFORD (THURLEIGH)"] == 2
```

`pair_distance` must have the CDG–LHR row (216 miles) in the third test so `band` is 0; insert it in `pairs_db`.

- [ ] **Step 2:** Run `uv run pytest tests/test_europe.py -k "pair or matrix or caa_domestic" -q`. Expected: FAIL
  (`write_pairs` not defined).

- [ ] **Step 3: Implement.** `write_pairs(db)`: one `INSERT INTO pair_year SELECT ...` ranking each unordered pair-year's reports
  with `ROW_NUMBER() OVER (PARTITION BY MIN(ca, cb), MAX(ca, cb), year ORDER BY (source = 'caa') ASC, passengers DESC NULLS
  LAST, ca)` over `route_year` joined to `airport_info` at both ends (`placeholder = 0` at both), keeping rank 1; then
  `build_database.rebuild_top_route_year(db, pairs_sql=...)` (Interfaces). The service comes from `domestic`, not T-100's
  `domestic_deps * 2 > deps`, because CAA years have no flights. `add_caa`: for `kind == "dom"` skip (count as unnamed) when
  either code doesn't start with `EG` (Jersey, Guernsey and the Isle of Man are `EG..` too).

- [ ] **Step 4:** Run the same pytest command, then `uv run pytest -q tests/test_top_routes.py tests/test_schema_check.py`
  (T-100's rankings and `schema.sql` unchanged). Expected: all PASS.

- [ ] **Step 5:** Rebuild `t_avia.db` (Global Constraints) and check:
  `sqlite3 t_avia.db "SELECT COUNT(*) FROM pair_year; SELECT COUNT(*) FROM top_route_year; SELECT a,b,airport,passengers FROM pair_year WHERE year=2019 ORDER BY passengers DESC LIMIT 5"`.
  Expected: about 220,000 pair-years (300,571 report-years less the 79,645 doubles); busiest 2019 pairs are plausible
  (e.g. domestic Spain/Norway/Turkey, LHR–JFK), each once.

- [ ] **Step 6: Commit** (`build_database.py build_t_avia.py tests/test_europe.py`): "t_avia: one report per airport pair
  (pair_year) and the routes matrix's tables".

### Task 2: The European canned queries

**Files:**
- Modify: `datasette.yml` (`databases: t_avia: queries:`)
- Test: `tests/test_europe.py` (the `both` fixture's `tiny_t_avia` gains `pair_year`, `top_route_year`, `route_band_year`
  rows: call `b.write_pairs(db)` at its end)

**Interfaces:**
- Produces, with T-100's parameters and columns (copy each T-100 query's `description` and adapt):
  - `airport_by_year(dir, region)`: `airport, city, market_id, year, service, deps, seats, passengers, freight`; `region` is
    accepted and ignored; floor 100,000 passengers both ways in some year (decision 6); `dir` out/in uses the `_out`/`_in`
    columns (NULL in CAA years).
  - `top_routes_by_year(year)`: T-100's SQL unchanged in shape, reading t_avia's `top_route_year` / `route_band_year`,
    freight × 2204.62.
  - `busiest_routes_year(year, n, service)`: from `pair_year` + `pair_distance` (on codes), `origin`/`dest` = `a`/`b`,
    ordered by passengers.
  - `pair_distances_by_year(year)`: `a, b, distance, gc_distance, deps, passengers, freight` with `gc_distance = distance`
    (only great-circle distances exist).
  - `europe_countries(year, sort)`: `country_code, airports, passengers, flights, freight` summed over the
    country's reporting, non-placeholder airports' own reports (each airport's totals; a domestic route counts at both its
    airports, as an airport total should); `sort` one of `passengers` (default), `flights`, `airports`, `freight`, in `europe_airports`'s CTE-then-ORDER BY shape.
  - `europe_airports` gains `:country` (empty = all): `AND (:country = '' OR a.country_code = :country)`.

- [ ] **Step 1: Write failing tests** — each query over the tiny database via
  `get(both, "/t_avia/<query>.json?...&_shape=objects")`:
  `test_top_routes_by_year_counts_a_pair_once` (CDG–LHR present once with the kept report's passengers),
  `test_busiest_routes_year_gives_t100s_columns` (keys exactly `origin, dest, service, deps, seats, passengers, freight,
  distance`), `test_pair_distances_by_year_has_gc_distance`, `test_airport_by_year_counts_each_airports_own_report`
  (`region=abroad` accepted), `test_a_caa_year_sorts_last_by_flights` (`europe_countries?sort=flights` with a CAA-only
  country row last), `test_europe_airports_filters_by_country` (`country=FR` → CDG only).

- [ ] **Step 2:** `uv run pytest tests/test_europe.py -q` → the new tests FAIL (unknown query / missing param).

- [ ] **Step 3:** Write the queries in `datasette.yml`.

- [ ] **Step 4:** `uv run pytest tests/test_europe.py -q` → PASS. Against the real data on 8818 (restart it), each query
  answers under a second: `curl -s -o /dev/null -w '%{time_total}\n' "http://127.0.0.1:8818/t_avia/top_routes_by_year.json?year=&_shape=objects"`.

- [ ] **Step 5: Commit** (`datasette.yml tests/test_europe.py`): "t_avia: the routes, map, distances, over-time and
  country queries".

### Task 3: Links and controls in the shared scripts

**Files:**
- Modify: `static/common/source.js`, `static/common/test/source.test.js`
- Modify: `static/charts/rollup.js` (lines ~124–127, ~165, ~192, the region and city-group controls), 
  `static/charts/airportsglobe.js` (~190, ~197, ~235), `static/charts/distances.js` (only if it links; it reads queries by
  name already)

**Interfaces:**
- Produces in `source.js`: `routeHref(a, b, year = '', europe = isEurope()) -> string` —
  `` `${europe ? EUROPE_BASE : '/airports'}/${a}/${b}${year ? `/${year}` : ''}` `` (a European route page redirects to the
  reporting end itself, so no `info` is needed).
- Consumes: `airportHref(code, suffix, info, europe)` (exists) for airport links; the `airports` query's `page` column gives
  `info` on European pages (the scripts already fetch `airports`).

- [ ] **Step 1: Failing tests** in `source.test.js`: `routeHref('LHR','JFK','',false) === '/airports/LHR/JFK'`,
  `routeHref('AMS','DXB',2019,true) === '/airports/europe/AMS/DXB/2019'`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Add `routeHref`; in the three scripts replace literal `/airports/${...}` route and airport paths with
  `routeHref` / `airportHref(code, suffix, info)` (an airport with no page gets no link: render text, as the airport pages'
  matrix already does). On `isEurope()`: `rollup.js` hides `#matrix-region` and the city/airport group switch and counts by
  passengers (`countBy()`); `airportsglobe.js` opens an airport with `routes_by_year` (t_avia has it, same parameters).
- [ ] **Step 4:** `npm test` → PASS (482 + 2).
- [ ] **Step 5: Commit**: "Shared scripts: route and airport links that know European pages".

### Task 4: The over-time, routes, distances and map pages

**Files:**
- Modify: `plugins/t_avia.py` (routes and handlers), `plugins/t100_globe.py` (`views_for`)
- Modify: `templates/rollup.html`, `templates/airport_distances.html`, `templates/airports_globe.html` (conditionals on
  `europe`: `data-database="t_avia"` via `_source_attrs.html`, the coverage note, hide T-100-only controls)
- Create: `templates/_europe_coverage_note.html` (decision 8's sentence, shared)
- Test: `tests/test_europe.py`

**Interfaces:**
- Consumes: `ROLLUP_PAGES`, `rollup.html`'s context keys (`kind`, `page`, `latest_year`, `crumbs`, `dir`, `dir_choices`,
  `count_word`, `region`), `distances_context`'s keys (`year, first_year, last_year, axis_max, bin_miles` + `check_margins`),
  `airports_globe.html`'s (`crumbs`, `max_year`). Pass `max_year`/`latest_year`/default year = `DEFAULT_YEAR` (2024) where the
  page opens on a year; years run to the data's last.
- Produces: routes `^/airports/europe/(over-time|routes|distances|globe)$`; `views_for("/airports/europe...")` for the index
  and these four: `Busiest airports` (/airports/europe), `Over time`, `Routes`, `Distances`, `Map`, `Countries`.

- [ ] **Step 1: Failing tests:** each page 200 with `data-database="t_avia"` and `id="europe-coverage-note"`; without
  `t_avia.db` each 404; `views_for("/airports/europe/routes")` hrefs and current flag; `/airports/europe/globe` opens on 2024
  (`data-year="2024"` or the template's equivalent).
- [ ] **Step 2:** `uv run pytest tests/test_europe.py -q` → FAIL.
- [ ] **Step 3:** Implement the handlers (one helper rendering a template with `europe = {database, base, pax_floor}` + the
  page's context) and the template conditionals.
- [ ] **Step 4:** pytest PASS; then restart 8818 and check in Chrome: `/airports/europe/over-time` (Heathrow, Istanbul,
  Frankfurt near the top in 2019; rows link to `/airports/europe/<code>/destinations`), `/routes` (2019: no pair twice; a row
  opens the European route page), `/distances` (2019 histogram), `/globe` (2024 busiest pairs; clicking an airport opens its
  routes; a route link goes to `/airports/europe/<a>/<b>/2024`). No console errors.
- [ ] **Step 5: Commit**: "European over-time, routes, distances and map pages".

### Task 5: Countries

**Files:**
- Create: `data/eurostat_countries.csv` (`code,name,slug`; the 35 `country_code`s in `airport_info` for reporting airports)
- Modify: `plugins/t_avia.py` (routes `^/airports/europe/countries$`, `^/airports/europe/countries/(?P<slug>[a-z-]+)$`),
  `templates/europe_airports.html` (a `country` mode: heading "Airports in {name}", form keeps `country`), new
  `templates/europe_countries.html` (the index's table shape: Country, Airports, Passengers, Flights, Freight, sortable by the
  same `sort_th` macro)
- Test: `tests/test_europe.py`

**Interfaces:**
- Consumes: `europe_countries`, `europe_airports(country)` (Task 2); `INDEX_SORTS`, `prose_count` (exist in `t_avia.py`).
- Produces: `COUNTRIES: dict[slug, {"code", "name"}]` read once from the CSV.

- [ ] **Step 1: Failing tests:** `/airports/europe/countries?year=2019` lists France with a link to
  `/airports/europe/countries/france`; `/airports/europe/countries/france?year=2019` lists CDG and not LHR;
  `/airports/europe/countries/narnia` → 404; a one-airport country (insert one in the tiny db) shows one row; the countries
  table's sort buttons replace, not append, `sort` (last value wins, as the index).
- [ ] **Step 2:** pytest → FAIL.
- [ ] **Step 3:** Implement; add Countries to the views line (Task 4's list).
- [ ] **Step 4:** pytest PASS; in Chrome, `/airports/europe/countries` for 2024 and 2000 (fewer countries), the UK's page
  (Jersey and Guernsey in it; no KBED after the Task 1 rebuild).
- [ ] **Step 5: Commit**: "European countries: a list and a page for each".

### Task 6: Deploy checks and documents

**Files:**
- Modify: `scripts/smoke_check.sh` (one check per new page: `/airports/europe/over-time` "matrix", `/airports/europe/routes`
  "matrix", `/airports/europe/distances` "distance-chart", `/airports/europe/globe` "id=\"arcs\"",
  `/airports/europe/countries` "France", `/airports/europe/countries/france` "CDG", and
  `/t_avia/top_routes_by_year.json?year=2019&_shape=objects` '"LHR"')
- Modify: `README.md` (pages, the new tables and queries, `data/eurostat_countries.csv`),
  `docs/superpowers/plans/2026-11-18-european-airports.md` (a decision 20 pointing here), `templates/about.html` (the European
  section: a route between two reporting airports is counted once in totals)

- [ ] **Step 1:** Make the edits.
- [ ] **Step 2:** `uv run pytest -q` and `npm test` → all pass (counts reported).
- [ ] **Step 3:** `npm run bundle`, `PORT=8819 ./serve_public.sh` (background), `scripts/smoke_check.sh http://127.0.0.1:8819`
  → every check ok but the bundled-script one only if the bundle is missing (it should pass now); load the four new pages in
  Chrome on 8819 with no console errors; stop 8819 and remove `static/dist`.
- [ ] **Step 4: Commit**: "European top-level pages: smoke checks and documents". Tell the user `t_avia.db` must be
  re-uploaded to the volume (new tables) before this reaches `main`, using the README's replace-and-restart steps.
