# Airport distances page: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A page at `/airports/<CODE>/distances`: a histogram of one airport's flight segments in the latest full year by
distance, against passengers, flight segments or freight, on an x-axis shared by every airport.

**Architecture:** `pair_distance` gains a great-circle `gc_distance`, computed at rebuild from airport coordinates.
`routes_by_year` returns it and takes an optional year. The page handler gives the template the shared axis maximum, the bin
width and the check's margins as data attributes. A pure JS module bins the rows, drops suspect distances and finds the median,
and the page script draws the result with Observable Plot.

**Tech Stack:** Python 3 / SQLite / Datasette plugins and canned queries, Jinja, plain ES modules, Observable Plot, pytest,
`node --test`.

**Spec:** `docs/superpowers/specs/2026-11-14-airport-distances-design.md`. Read it first.

## Global Constraints

- Read `CLAUDE.md`. Never stop the server on port 8808. To look at the page, run `uv run datasette --port 8818 .` and stop it afterwards.
- Don't scan `t100.db` casually: use indexed queries with `LIMIT`. Tests use their own fixture databases.
- The copy says **flight segments**, never just "flights", for what T-100 records.
- Suspect: `abs(distance − gc_distance) > ratio × gc_distance` **and** `abs(distance − gc_distance) > miles`, with both comparisons strict.
  Defaults are `ratio: 0.1` and `miles: 50`. A missing `gc_distance` is never suspect; it counts as unchecked.
- Bins are 250 miles wide. The axis runs from 0 to the longest *checked* (non-suspect, non-null `gc_distance`) distance flown in
  `max_year`, rounded up to a whole bin. For 2025 that is 10,192 miles, so the axis ends at 10,250.
- Earth radius 3,958.8 statute miles, haversine, rounded to an integer.
- Displayed numbers go through `static/common/numbers.js` (`exactCount`, `formatCount`, `formatTons`, `millionsAxis`), with no
  `toFixed` or d3 `~s`. Colours come from `static/common/palette.js`.
- Templates load scripts with `{{ script_url('charts/distances.js') }}`, never a literal `/static/` path.
- Don't touch `templates/changelog.html`. Don't push to `main`.
- `schema.sql` must match `build_database.py`; `tests/test_schema_check.py` enforces it.

## Review Focus

1. **No flight segments in the latest year** (an airport closed before 2025, e.g. `DET`): show a line saying so and no chart, not an empty axis. Test: `profile` of no rows → `{ empty: true }` (Task 4).
2. **Every row without a distance or unchecked** (a small field missing from openflights): the bars still draw; the small print counts the unchecked pairs; rows with no distance are left out and counted. Test in Task 4.
3. **An unchecked distance beyond the axis maximum:** it goes in the last bin, not off the chart, and is flagged so the small print can mention it. Test in Task 4.
4. **Lower-case code or a direction in the URL** (`/airports/atl/distances?dir=in`): the page renders for `ATL` with `data-dir="in"`, and the nav shows Distances as current. Test in Task 5.
5. **Freight at an airport with none:** freight isn't offered as a measure (`hasFreight` from `static/charts/src/flights.js`). Test in Task 4 (`measuresOffered`).

---

### Task 1: `pair_distance.gc_distance`

**Files:**
- Modify: `build_database.py` (`_ADDED_COLUMNS` at ~219, `pair_distance` DDL at ~152, `rebuild_pair_distance` at ~565)
- Modify: `schema.sql` (the `pair_distance` table)
- Test: `tests/test_pair_distance.py` (new)

**Interfaces:**
- Produces: `pair_distance(a, b, distance, gc_distance)`, where `gc_distance INTEGER` may be `NULL`.
  `build_database.great_circle_miles(lat1, lon1, lat2, lon2) -> float`.
  `build_database.airport_coordinates(conn) -> dict[str, tuple[float, float]]`.

- [ ] **Step 1: Write the failing tests** in `tests/test_pair_distance.py`. Build fixtures the way `tests/test_top_routes.py` does
  (`add_segments`, then `rebuild_route_year_totals` and `rebuild_pair_distance`). Fill `openflights_airports` and
  `airport_overrides` with `put` from `tests/test_rollup_queries.py`; check the column names of `airport_overrides` in `schema.sql`.
  - `test_great_circle_miles_lax_sfo`: `round(great_circle_miles(33.9425, -118.4081, 37.6190, -122.3750)) == 337`.
  - `test_gc_distance_is_filled_from_coordinates`: LAX and SFO in openflights, a LAX–SFO segment at distance 337 → row `("LAX", "SFO", 337, 337)`.
  - `test_gc_distance_is_null_without_coordinates`: SFO missing from openflights → `gc_distance IS NULL`.
  - `test_overrides_win_over_openflights`: put an `airport_overrides` row for SFO far away (lat 0, lon 0) → `gc_distance` > 5,000.
  - `test_duplicate_iata_takes_lowest_id`: two openflights rows for SFO, and the lower `id` has the real coordinates → 337.
  - `test_old_pair_distance_without_the_column_is_rebuilt`: create `pair_distance(a, b, distance)` by hand, run `rebuild_pair_distance` → `PRAGMA table_info` includes `gc_distance`.
  - `test_rebuild_fails_without_coordinates`: empty `openflights_airports` and `airport_overrides` with segments present, and
    `rebuild_pair_distance(conn, require_coordinates=True)` → `pytest.raises(RuntimeError)`. Without the flag it succeeds with
    `gc_distance` `NULL`.

- [ ] **Step 2: Run them and see them fail.** `uv run pytest tests/test_pair_distance.py -v`. Expect an ImportError or failed assertions.

- [ ] **Step 3: Implement.**
  - Add `("pair_distance", "gc_distance")` to `_ADDED_COLUMNS`. Add `[gc_distance] INTEGER` to the DDL and its comment.
  - `airport_coordinates(conn)` mirrors the `airports` canned query (`datasette.yml` ~20). Take `airport_overrides` first, then
    `openflights_airports` by `iata_code`, skipping `''`, `'\N'` and null lat/long. On a duplicate code, the lowest `id` wins.
  - `rebuild_pair_distance(conn, require_coordinates=False)` inserts as now. With `require_coordinates=True`, if there are pairs
    and `airport_coordinates` is empty, it raises `RuntimeError("pair_distance needs openflights_airports / airport_overrides loaded")`.
    It fills `gc_distance` with `executemany` UPDATEs in the same transaction, rounding `great_circle_miles` to an integer.
    `rebuild_derived_tables` passes `require_coordinates=True`. That catches a real rebuild with empty lookups, and the unit
    tests that call `rebuild_pair_distance` directly need no coordinates.
  - In `schema.sql`, change the `pair_distance` table to `[a] TEXT, [b] TEXT, [distance] INTEGER, [gc_distance] INTEGER,`.

- [ ] **Step 4: Run the tests and see them pass.** `uv run pytest tests/test_pair_distance.py tests/test_top_routes.py tests/test_top_markets.py tests/test_schema_check.py tests/test_busiest_routes_query.py -v`: all pass.
  Then run `uv run pytest tests/test_rollups.py tests/test_search_index.py tests/test_airport_names.py`. These call
  `rebuild_derived_tables`. Where one fails on the `RuntimeError`, add `add_coordinates(db_path, codes)` to `tests/helpers.py`
  (one openflights row per code, with made-up distinct coordinates) and call it in that test's fixture.

- [ ] **Step 5: Commit.** `git add build_database.py schema.sql tests/` with the message `pair_distance: great-circle distance from airport coordinates`.

### Task 2: `routes_by_year` returns `gc_distance` and takes an optional year

**Files:**
- Modify: `datasette.yml` (`routes_by_year`, ~537–565)
- Modify: `README.md` (the `routes_by_year` entry, and `pair_distance` in the `t100.db` paragraph)
- Test: `tests/test_routes_by_year.py`

**Interfaces:**
- Consumes: `pair_distance.gc_distance` (Task 1).
- Produces: `routes_by_year` rows gain `gc_distance`. A new parameter `:year`: empty means every year (all current callers),
  a year means that year only.

- [ ] **Step 1: Write the failing tests.**
  - `test_rows_carry_gc_distance`: `put` a `pair_distance` row `(ATL, LAX, 1946, 1950)` and an ATL→LAX segment → `rows(ds)[("LAX", 2018)]["gc_distance"] == 1950`.
  - `test_year_limits_to_one_year`: segments in 2017 and 2018, with `&year=2018` → only `2018` rows; without `year` → both.
  - `test_min_deps_zero_keeps_rows_with_passengers_but_no_departures`: a segment with `deps=0, pax=5`, `min_deps=0` → the row is present.
  Extend the `rows()` helper with a `year=None` argument.

- [ ] **Step 2: Run them and see them fail.** `uv run pytest tests/test_routes_by_year.py -v`.

- [ ] **Step 3: Implement.** Add `d.gc_distance` after `d.distance`. Add
  `AND (NULLIF(:year, '') IS NULL OR year = CAST(:year AS integer))` to both arms of the inner `UNION ALL`, as in the query above it.
  Update the description, and the README entry for `routes_by_year` and `pair_distance` ("and its great-circle distance from
  the airports' coordinates, `gc_distance`, empty where either has none").

- [ ] **Step 4: Run the tests and see them pass.** `uv run pytest tests/test_routes_by_year.py tests/test_data_links.py -v`. Then
  run `npm test`, because globe tests build query URLs.

- [ ] **Step 5: Commit** with the message `routes_by_year: gc_distance and an optional year`.

### Task 3: The check's margins and the shared axis, server side

**Files:**
- Modify: `datasette.yml` (`plugins: t100_globe`: add `distance_check: {ratio: 0.1, miles: 50}`)
- Create: `plugins/t100_distances.py`. It is small and on its own, like the other small plugins; the page route stays in `t100_globe.py`.
- Test: `tests/test_distances.py` (new)

**Interfaces:**
- Produces:
  - `BIN_MILES = 250`
  - `is_suspect(distance: int | None, gc: int | None, ratio: float, miles: float) -> bool`
  - `check_margins(datasette) -> dict`, giving `{"ratio": float, "miles": float}` from the plugin config, defaulting to 0.1 and 50
  - `async axis_max(datasette, year: int) -> int`: rounded up to a whole `BIN_MILES`, cached per process by `(year, ratio, miles)`,
    and 0 when nothing is flown

- [ ] **Step 1: Write the failing tests** in `tests/test_distances.py`.
  - `test_is_suspect_edges`, one case per line:
    - `(320, 4138)` → True
    - `(39, 44)` → False (within 50 miles)
    - `(1100, 1000)` → False (100 miles, but exactly 10%, so not over the ratio)
    - `(1101, 1000)` → True
    - `(560, 500)` → True (12%, 60 miles)
    - `(550, 500)` → False (10%, not over)
    - `(100, None)` → False
    - `(None, 100)` → False
  - `test_axis_max_ignores_suspect_and_unchecked`: in `route_year_totals` for 2025, put AAA–BBB (checked, 10,192/10,180),
    CCC–DDD (suspect, 12,000/4,000) and EEE–FFF (unchecked, 11,000/NULL). `axis_max(ds, 2025) == 10250`.
  - `test_axis_max_only_counts_that_year`: a checked 12,000-mile pair flown only in 2024 doesn't count.
  - `test_check_margins_default`: config without `distance_check` → `{"ratio": 0.1, "miles": 50}`.

- [ ] **Step 2: Run them and see them fail.** `uv run pytest tests/test_distances.py -v`.

- [ ] **Step 3: Implement.** `axis_max` runs one SQL query: distinct `(MIN(origin, dest), MAX(origin, dest))` pairs from
  `route_year_totals WHERE year = :year AND origin != dest`, joined to `pair_distance`, keeping `gc_distance IS NOT NULL AND NOT
  (<suspect>)`. The suspect expression is written once as a Python string beside `is_suspect`, with `:ratio` and `:miles`
  parameters. The query takes `MAX(distance)`, and Python rounds it up to a whole bin
  (`math.ceil(m / BIN_MILES) * BIN_MILES`).

- [ ] **Step 4: Run the tests and see them pass.** `uv run pytest tests/test_distances.py -v`.

- [ ] **Step 5: Commit** with the message `Distances: the check's margins and the shared axis`.

### Task 4: Binning, the check and the median in the browser

**Files:**
- Create: `static/charts/src/distances.js`
- Test: `static/charts/test/distances.test.js`

**Interfaces:**
- Consumes: `routes_by_year` rows `{ dest, year, distance, gc_distance, deps, passengers, freight }`.
- Produces:
  - `isSuspect(distance, gc, { ratio, miles }) -> boolean`, the same rule as Task 3's.
  - `profile(rows, { measure, bin, max, ratio, miles })`, where `measure` is `'passengers' | 'deps' | 'freight'`, returns either
    `{ empty: true }` or `{ empty: false, bins: [{ from, to, value, share }], total, median, dropped: { pairs, value }, unchecked: { pairs }, noDistance: { pairs, value }, beyondAxis: { pairs } }`.
    `bins` has `max / bin` entries, from `{from: 0, to: 250}` up, including zero-value bins. `share` is `value / total`. `total`
    counts only the kept rows. A suspect row goes to `dropped`. A row with null distance goes to `noDistance`. An unchecked row is
    kept and counted in `unchecked`. A kept row with `distance >= max` goes in the last bin and is counted in `beyondAxis`.
    `median` is the weighted median distance over the kept rows (the smallest distance at which the cumulative weight reaches
    half the total). `empty` is true when there are no rows, or when `total` is 0.
  - `measuresOffered(rows) -> string[]`: `['passengers', 'deps']`, plus `'freight'` when `hasFreight(rows)`.
  - `summaryText(code, year, measure, median) -> string`, using `exactCount` for the miles:
    - passengers: `Half of ${code}'s passengers in ${year} flew segments of ${n} miles or less.`
    - deps: `Half of ${code}'s flight segments in ${year} were ${n} miles or less.`
    - freight: `Half of ${code}'s freight in ${year} went on segments of ${n} miles or less.`

- [ ] **Step 1: Write the failing tests** (`node:test`, `node:assert/strict`, in the style of `static/charts/test/airport.test.js`):
  - `isSuspect` on the same eight cases as Task 3.
  - `profile` with no rows → `{ empty: true }`.
  - Rows at 100 (10 pax), 300 (30) and 300 (unchecked, 20), with `max: 1000` → 4 bins of values `[10, 50, 0, 0]`, total 60,
    `unchecked.pairs` 1, median 300.
  - A suspect row → not in the bins, `dropped` `{ pairs: 1, value: <its pax> }`.
  - A null distance → `noDistance` counted, not in the bins.
  - An unchecked row at 12,000 with `max: 10250` → in the last bin (`from` 10,000), `beyondAxis.pairs` 1.
  - `measure: 'deps'` sums `deps`.
  - `measuresOffered` without freight → `['passengers', 'deps']`.
  - `summaryText('ATL', 2025, 'passengers', 640)` → `"Half of ATL's passengers in 2025 flew segments of 640 miles or less."`

- [ ] **Step 2: Run them and see them fail.** `node --test static/charts/test/distances.test.js`.

- [ ] **Step 3: Implement** `static/charts/src/distances.js`, importing `exactCount` from `/static/common/numbers.js` and
  `hasFreight` from `./flights.js`. Use the same import style as the other `src/` modules.

- [ ] **Step 4: Run the tests and see them pass.** `npm test`.

- [ ] **Step 5: Commit** with the message `Distances: binning, the check and the median`.

### Task 5: The page

**Files:**
- Modify: `plugins/t100_globe.py`:
  - the route list (~70): add `(rf"^/airports/(?P<origin>{CODE})/distances$", airport_distances_page)`
  - the nav (~144–148): add `["distances"]`, order Over time, Destinations, **Distances**, Changes, Map
  - `airport_view` (~702): an `extra=None` argument
- Create: `templates/airport_distances.html`, `static/charts/distances.js`
- Modify: `scripts/smoke_check.sh`, `README.md` (the airport pages)
- Test: `tests/test_airport_pages.py`, plus `tests/test_nav.py` where it lists airport views

**Interfaces:**
- Consumes: `axis_max`, `check_margins`, `BIN_MILES` (Task 3); `profile`, `measuresOffered`, `summaryText` (Task 4);
  `routes_by_year` with `year` and `min_deps=0` (Task 2).
- Produces: `airport_view(template, crumb, extra=None)`, where `extra` is an `async (datasette, origin) -> dict` merged into the
  template context. `airport_distances_page = airport_view("airport_distances.html", "distances", distances_context)`.
  `distances_context` returns `{"year": max_year, "axis_max": ..., "bin_miles": 250, "ratio": ..., "miles": ...}`.

- [ ] **Step 1: Write the failing tests.**
  - In `tests/test_airport_pages.py`, change `VIEWS` to put `("Distances", "/airports/SFO/distances")` after Destinations, and
    update every test that relies on its order or length.
  - `test_the_distances_page`: `years(db_path)`, then `get(ds, "/airports/SFO/distances")` → 200, containing
    `id="distance-chart"`, `"SFO: distances"`, `data-axis-max=`, `data-bin="250"`, `data-ratio="0.1"`, `data-miles="50"`,
    `data-year="2025"`, `charts/distances.js`, and `"flight segments"`.
  - `test_distances_lowercase_and_dir`: `get(ds, "/airports/sfo/distances?dir=in")` → `data-origin="SFO"` and `data-dir="in"`.
  - The nav test: on `/airports/SFO/distances`, Distances is the current view.

- [ ] **Step 2: Run them and see them fail.** `uv run pytest tests/test_airport_pages.py tests/test_nav.py -v`.

- [ ] **Step 3: Implement.**
  - **The template** extends `t100_base.html`, the same way `templates/airport.html` does: title `{{ origin }} distances`, h1
    `{{ origin }}: distances`, the `label` intro, `_foreign_note.html`, and `_dir_choice.html`.
  - It has a heading `Distances of flight segments {{ {"out": "from", "in": "to"}.get(dir, "from and to") }} {{ origin }} in {{ year }}`,
    a `<p id="distance-summary">`, a measure `<select id="ds-measure">`, `<div id="distance-chart" aria-live="polite">Loading chart…</div>`,
    and `<p class="note" id="distance-note">`. Its body attributes are `data-origin`, `data-dir`, `data-year`, `data-axis-max`,
    `data-bin`, `data-ratio` and `data-miles`.
  - **The script** (`static/charts/distances.js`, modelled on `static/charts/airport.js`) fetches
    `routes_by_year {origin, dir, year, min_deps: 0}` and calls `setDataLink` with the same arguments. It offers `measuresOffered`
    and remembers the measure in the URL (`?measure=`) as `airport.js` does with `remember` and `replaceSearch`.
  - It draws `Plot.rectY(profile.bins, { x1: 'from', x2: 'to', y: 'value' })` with x domain `[0, axisMax]`, an x label of "miles"
    with ticks from `exactCount`, a y axis from `millionsAxis`/`formatCount` (`formatTons` for freight), and the first series
    colour from `palette.js`. It attaches `attachPopover` per bar: the range "1,000–1,250 miles", the value, and the share. It
    redraws on `t100:theme`.
  - On `profile.empty` it shows `No flight segments at ${origin} in ${year}.` with no chart.
  - **The small print** says, in one paragraph: "Distances are BTS's, checked against the airports' coordinates;" then
    `dropped.pairs` pairs (and their value) left out, `unchecked.pairs` that couldn't be checked, `noDistance.pairs` with no
    distance, any `beyondAxis` (included in the last bar), and "Every airport's chart has the same scale, up to the longest
    segment flown in {year}." Clauses for zero counts are left out.
  - Add `check 200 /airports/SFO/distances "distance-chart"` to `scripts/smoke_check.sh`, after `/airports/SFO/destinations`.
    Update the README's airport pages list.

- [ ] **Step 4: Run the tests and see them pass.** `uv run pytest` (all of it) and `npm test`.

- [ ] **Step 5: Check it in a real browser.** Run `uv run datasette --port 8818 .`. This needs `rebuild_pair_distance` run on the
  local `t100.db` first: `uv run python -c "import sqlite3, build_database as b; c = sqlite3.connect('t100.db'); print(b.rebuild_pair_distance(c))"`.
  That rewrites one derived table and scans the segment tables once.
  - On `/airports/ATL/distances` most bars are under 1,000 miles.
  - On `/airports/JFK/distances` there are humps at about 2,000–2,500, 3,000–4,000 and 6,500 miles.
  - Both axes end at 10,250. The measure menu, direction menu and popover work, and so does the dark theme.
  - Then stop the server on 8818.

- [ ] **Step 6: Commit** with the message `Airports: a distances page`. Note in the summary that the user may want a changelog entry; don't write one.

## After merging: production (the user's step)

Before the code deploys, `pair_distance` on the Fly volume needs `gc_distance`. Nothing stops the deploy otherwise: the schema
check only warns, and the smoke check's `/-/derived` only runs afterwards. Follow the usual route (snapshot, load, check,
restart) with a dump of the rebuilt local `pair_distance`. The executor writes these steps out for the user and doesn't run them.
