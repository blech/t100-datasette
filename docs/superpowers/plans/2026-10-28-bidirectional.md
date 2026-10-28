# Both directions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route, airport and airline pages count flights in both directions by default, and each offers a choice of one direction (or, on airline pages, each direction as its own row), with words that always match the numbers.

**Architecture:** Three new rollup tables (`airport_dir_year`, `airport_carrier_dir_year`, `carrier_pair_year`) record each direction explicitly, built beside the old ones so production never reads a half-changed table. The canned queries take a `dir` parameter (`''` both, `out`, `in`), or `each` on airline queries, and sum directions in SQL. One shared vocabulary decides the wording and cut-offs: `plugins/t100_direction.py` for server-rendered words and `static/common/direction.js` for the browser. Changing direction reloads the page, so the server renders the headings and the words can't disagree with the numbers.

**Tech Stack:** Python 3 / SQLite (`build_database.py`), Datasette canned queries (`datasette.yml`) and the `plugins/t100_globe.py` page plugin, Jinja templates, vanilla ES modules with `node --test`, and pytest.

**Spec:** `docs/superpowers/specs/2026-10-28-bidirectional-design.md`

## Global Constraints

- **The `dir` parameter:** route and airport pages use `dir`, where absent means both, `dir=out` means the address's first airport to its second (or departing), and `dir=in` means the reverse (or arriving). Airline pages use `dir=each` for one row per direction. Anything else is treated as absent.
- **Words for the flight count:** both → **Flights**, out → **Departures**, in → **Arrivals**. Never "movements".
- **Route heading:** both → `LAX ↔ LHR`; out → `LAX → LHR`; in → `LHR → LAX`, always written in the order of the address.
- **Airline pair label:** merged → `ATL ↔ LGA` (alphabetical); each → `ATL → LGA` and `LGA → ATL`.
- **Cut-offs:** a fixed cut-off defined in departures doubles in both-ways mode. 12 becomes 24 and 365 becomes 730. On airline pages, "each" mode uses the one-way value.
- **Unchanged:**
  - `airport_connecting_year`
  - the `/t100/destinations` and `/t100/top_us_airports` canned pages and their `query-t100-*.html` templates. The `top_us_airports` query stays as it is.
  - the aircraft, family, maker, group and airlines-over-time pages
- **Old tables during the work:** `airport_year_totals`, `airport_carrier_year`, `carrier_route_year` and their queries keep building and working until Task 9.
- **No new index** on `t100_domestic` / `t100_international`.
- **Working setup:**
  - Work in worktree `.claude/worktrees/bidirectional` on branch `bidirectional`.
  - Use its own `t100.db`, made with `cp -c` from the main checkout.
  - Serve on port 8813. Never 8808 (the owner's), 8811 or 8812 (other agents').
- **`schema.sql`:** regenerated from `build_database.py`, never hand-edited. `tests/test_schema_check.py` enforces it.
- **Commit style:** the repo's own, which is a sentence describing the visible change.

## Review Focus

- **Airports seen only as a destination.** A foreign airport, or an airport whose only service is arriving charters, has no row in today's origin-keyed rollups. It must appear with zero departures and real arrivals, and in both-ways counts. Tested in Task 2 (`test_arrival_only_airport_has_a_row`) and Task 4 (`test_airport_size_counts_arrivals_at_a_destination_only_airport`).
- **A pair flown in one direction only**, such as a one-way ferry or a seasonal charter that returns empty off-report:
  - both-ways shows its numbers
  - the empty direction shows "No flights from X to Y", not an error
  - airline "each" mode shows one row, not a zero row

  Tested in Task 3 (`test_one_direction_only_route`) and Task 7 (`test_each_mode_never_emits_an_empty_direction`).
- **A pair that changes domestic/international between directions.** The service label is the majority over whichever directions are counted. Tested in Task 4 (`test_service_is_majority_over_counted_directions`).
- **An unknown or mixed-case `dir` value** (`?dir=OUT`, `?dir=both`, `?dir=x`) is treated as both, with no 500 and no empty page. Tested in Task 1 (`test_parse_dir_rejects_unknown`, `parseDir` test) and Task 3 (`test_route_page_unknown_dir_is_both`).
- **Cut-off at the boundary.** A pair with exactly 12 departures out and 12 in (24 flights) appears in both-ways mode. A pair with 12 out and 11 in appears in `out` mode but not `in` mode, and in both-ways mode (23 flights) it does not appear. Tested in Task 4 (`test_cutoff_boundary`).

---

## Before Task 1: set up the worktree

- [ ] Remove the merged `safari-controls` worktree. It's clean and merged into `main`; check both with `git -C .claude/worktrees/family-any status --short` (empty output) and `git branch --merged main | grep safari-controls`.
  Then run `git worktree remove .claude/worktrees/family-any`.
- [ ] `git worktree add .claude/worktrees/bidirectional -b bidirectional main`
- [ ] `cp -c t100.db .claude/worktrees/bidirectional/t100.db`, a clonefile copy that takes no space until written. Confirm with `ls -l`: both are about 2.7GB.
- [ ] Copy `internal.db` the same way if the server needs it to start.
- [ ] `cd .claude/worktrees/bidirectional && uv run pytest -q && npm test`. Expected: all pass, as on `main`.

---

### Task 1: Direction vocabulary, server and browser

**Files:**
- Create: `plugins/t100_direction.py`, `static/common/direction.js`
- Modify: `static/nav/src/state.js` (`carryParams`)
- Test: `tests/test_direction.py`, `static/common/test/direction.test.js`, `static/nav/test/state.test.js`

**Interfaces:**
- Produces (Python, `plugins/t100_direction.py`, no Datasette hooks):
  - `parse_dir(value: str | None) -> str`, which returns `''`, `'out'` or `'in'`
  - `count_word(dir: str) -> str`, which returns `'Flights' | 'Departures' | 'Arrivals'`
  - `route_heading(a: str, b: str, dir: str) -> str`
  - `cutoff(dir: str, base: int = 12) -> int`
  - `DIRECTION_CHOICES_ROUTE(a, b) -> list[tuple[str, str]]`, which gives `[('', 'LAX ↔ LHR'), ('out', 'LAX → LHR'), ('in', 'LHR → LAX')]`
  - `DIRECTION_CHOICES_AIRPORT = [('', 'Both directions'), ('out', 'Departing'), ('in', 'Arriving')]`
- Produces (JS, `static/common/direction.js`):
  - `parseDir(search: string) -> '' | 'out' | 'in'`
  - `countWord(dir)`, `routeHeading(a, b, dir)` and `cutoff(dir, base = 12)`, with the same values as Python
  - `pairLabel(a, b, each: boolean) -> string`, which in merged mode sorts `a`/`b`
  - `setDir(dir)`, which rewrites `location.search` and reloads the page

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_direction.py
from plugins.t100_direction import parse_dir, count_word, route_heading, cutoff

def test_parse_dir_accepts_out_and_in():
    assert (parse_dir("out"), parse_dir("in"), parse_dir(None), parse_dir("")) == ("out", "in", "", "")

def test_parse_dir_rejects_unknown():
    assert parse_dir("OUT") == parse_dir("both") == parse_dir("x") == ""

def test_words_and_headings():
    assert [count_word(d) for d in ("", "out", "in")] == ["Flights", "Departures", "Arrivals"]
    assert [route_heading("LAX", "LHR", d) for d in ("", "out", "in")] == ["LAX ↔ LHR", "LAX → LHR", "LHR → LAX"]

def test_cutoff_doubles_for_both():
    assert (cutoff(""), cutoff("out"), cutoff("in"), cutoff("", 365)) == (24, 12, 12, 730)
```

```js
// static/common/test/direction.test.js: the same four cases for parseDir / countWord / routeHeading / cutoff, plus
assert.equal(pairLabel('LGA', 'ATL', false), 'ATL ↔ LGA');
assert.equal(pairLabel('LGA', 'ATL', true), 'LGA → ATL');
```

In `static/nav/test/state.test.js`:
- `carryParams('?dir=in', 'route')`, and the same for `'routes'`, `'airport'`, `'changes'` and `'globe'`, includes `dir: 'in'`.
- `carryParams('?dir=each', 'route')` has no `dir`.
- `carryParams('?dir=out', 'home')` has no `dir`.

- [ ] **Step 2: Run them to see them fail**

Run: `uv run pytest tests/test_direction.py -q; npm test`. Expected: ImportError and module-not-found failures.

- [ ] **Step 3: Implement both modules, then add `dir` to `carryParams`**

In `carryParams`, carry `dir` (`out`/`in` only) to the `route`, `routes`, `airport`, `changes` and `globe` targets. Never carry `each`.

- [ ] **Step 4: Run the tests**

Run: `uv run pytest -q && npm test`. Expected: all pass.

- [ ] **Step 5: Commit**: "A shared vocabulary for direction: Flights, Departures, Arrivals, the route arrows and the doubled cut-offs"

---

### Task 2: Directed rollup tables

**Files:**
- Modify: `build_database.py` (`_LOOKUP_TABLES`; new `rebuild_airport_dir_year`, `rebuild_airport_carrier_dir_year` and `rebuild_carrier_pair_year`, added to `rebuild_derived_tables`), `schema.sql` (regenerated)
- Test: `tests/test_direction_rollups.py` (reuse `flight`, `add_carriers` and `query` from `tests/test_rollups.py`)

**Interfaces:**
- Produces these tables (each `WITHOUT ROWID`, each with a one-line comment in `_LOOKUP_TABLES` like its neighbours):
  - `airport_dir_year(year, airport, city_name, wac, deps, arrs, seats_out, seats_in, passengers_out, passengers_in, freight_out, freight_in)`, with PK `(year, airport)`.
    - Out values come from rows with `origin = airport`; in values from rows with `dest = airport`.
    - `city_name` and `wac` take the MAX over both sides.
    - Every airport that appears on either side gets a row.
  - `airport_carrier_dir_year(year, airport, wac, group_id, group_name, domestic, service_class, deps, arrs, seats_out, seats_in, passengers_out, passengers_in, freight_out, freight_in)`, with PK `(year, airport, group_id, domestic, service_class)`. Group resolution is exactly `rebuild_airport_carrier_year`'s.
  - `carrier_pair_year(group_id, airline_id, year, origin, dest, deps, seats, passengers, freight, first_month, last_month, domestic_deps)`, with PK `(group_id, airline_id, year, origin, dest)`.
    - `origin` and `dest` are as flown, never reordered.
    - This is otherwise exactly `rebuild_carrier_route_year`, without the `MIN`/`MAX`.
- Each `rebuild_*` returns its row count, like its neighbours.

- [ ] **Step 1: Write the failing tests**
  - `test_airport_dir_year_splits_out_and_in`: ATL→LAX 10 deps / 1000 pax, and LAX→ATL 8 deps / 900 pax, in 2019. ATL's row has `deps=10, arrs=8, passengers_out=1000, passengers_in=900`; LAX's is the mirror.
  - `test_arrival_only_airport_has_a_row`: only ATL→LHR. LHR's row has `deps=0, arrs=10`, and its `city_name` comes from `dest_city_name`.
  - `test_airport_carrier_dir_year_matches_airport_dir_year`: summing the group rows equals the airport row, on every column.
  - `test_carrier_pair_year_keeps_direction`: LGA→ATL and ATL→LGA flown by one airline give two rows, `('LGA','ATL')` and `('ATL','LGA')`, with their own deps and first/last months.
  - `test_old_tables_still_built`: `carrier_route_year` still has one merged row for that pair.
- [ ] **Step 2: Run** `uv run pytest tests/test_direction_rollups.py -q`. Expected: fail, because there's no such table.
- [ ] **Step 3: Implement the three tables and rebuilds, then regenerate `schema.sql`.**
  - For out/in, use one `UNION ALL` of the origin side and the dest side, grouped by airport. That scans `t100` twice, which is acceptable for a rebuild.
  - For `schema.sql`, follow the generation the file's header and `setup_database.md` describe. There is no script, so dump `sqlite_master` from a fresh `create_schema` + `create_indexes` in-memory DB in the existing order and format.
- [ ] **Step 4: Run** `uv run pytest -q`. Expected: all pass, including `test_schema_check`.
- [ ] **Step 5: Rebuild the worktree's database and record sizes.**
  - Run `uv run python -c "import sqlite3, build_database as b; c = sqlite3.connect('t100.db'); print(b.rebuild_airport_dir_year(c), b.rebuild_airport_carrier_dir_year(c), b.rebuild_carrier_pair_year(c))"`.
  - Then run `SELECT name, SUM(pgsize)/1048576 FROM dbstat WHERE name IN ('airport_dir_year','airport_carrier_dir_year','carrier_pair_year') GROUP BY name`.
  - Write the three sizes into Task 9's notes in this plan. Expect `carrier_pair_year` well under 120MB.
- [ ] **Step 6: Commit**: "Rollups that keep both directions: each airport's departures and arrivals, and each airline's pairs as flown"

---

### Task 3: Route pages, both ways by default

**Files:**
- Modify:
  - `datasette.yml` (queries `route`, `route_year`)
  - `plugins/t100_globe.py` (`route_view`)
  - `templates/route.html`, `templates/route_table.html`
  - `static/charts/routepage.js`, `static/charts/src/series.js` (the `deps` label)
- Test: `tests/test_route_page.py`

**Interfaces:**
- Consumes: Task 1's `parse_dir`, `route_heading`, `count_word`, `DIRECTION_CHOICES_ROUTE`, `parseDir` and `setDir`.
- Produces: queries `route` and `route_year` with a new `:dir` param. Their rows are unchanged in shape.

- [ ] **Step 1: Write the failing tests**
  - `test_route_both_ways_by_default`: ATL→LAX 10 deps and LAX→ATL 7 deps in 2019. `/t100/route.json?origin=ATL&dest=LAX&dir=` sums to 17, `dir=out` to 10 and `dir=in` to 7.
  - `test_route_page_heading_follows_dir`: `/airports/ATL/LAX` has `<h1 id="title">ATL ↔ LAX`, `?dir=in` has `LAX → ATL`, and the `<title>` matches.
  - `test_route_page_unknown_dir_is_both`: `?dir=sideways` gives a 200 and `ATL ↔ LAX`.
  - `test_one_direction_only_route`: only ATL→LAX exists. `?dir=in` renders a 200 page whose script status reads "No flights from LAX to ATL…". Assert on the `data-dir="in"` body attribute; the JS test below covers the text.
  - `test_reverse_link_only_in_one_way_mode`: `#reverse-link` is present with `?dir=out` and absent by default.
- [ ] **Step 2: Run** `uv run pytest tests/test_route_page.py -q`. Expected: the new tests fail.
- [ ] **Step 3: Change the queries.** In `route`/`route_year`, replace `origin = :origin AND dest = :dest` with
  `((origin = :origin AND dest = :dest AND :dir IN ('', 'out')) OR (origin = :dest AND dest = :origin AND :dir IN ('', 'in')))`
  Both arms use the `origin, dest, year` index.
- [ ] **Step 4: Change the server-rendered page.**
  - `route_view` passes `dir`, `heading = route_heading(origin, dest, dir)` and `count_word` to the template.
  - The template:
    - renders `<h1>`, `<title>` and `data-dir` from them
    - adds `<label>Direction <select id="chart-dir">…</select></label>`, built from `DIRECTION_CHOICES_ROUTE`, as the first chart control
    - shows the "Each direction is a route of its own…" sentence, with `#reverse-link`, only when `dir` is `out` or `in`
    - replaces the "This is one direction only" note with `count_word`-aware copy linking `/about#direction`, for example "Flights counts both directions."
  - Use the same wording in `route_table.html`.
- [ ] **Step 5: Change the script.**
  - `routepage.js` reads `parseDir`, passes `dir` to `queryUrl('route' | 'route_year', …)` and `setDataLink`, and calls `setDir` on `#chart-dir` change.
  - The status messages name the direction: "No flights between ATL and LAX…" when both, otherwise "No flights from X to Y…" in the chosen order.
  - `NUMBER_COLUMNS[0]` and `series.js`'s `deps` label come from `countWord(dir)`. `series.js` takes the label as a parameter rather than importing location state.
- [ ] **Step 6: Run** `uv run pytest -q && npm test`. Expected: all pass.
- [ ] **Step 7: Check in the browser.**
  - Serve on 8813: `uv run datasette --port 8813 --reload .`, from the worktree, with the same flags as `start.sh`.
  - Open `/airports/LAX/LHR`, `?dir=out` and `?dir=in`. Check the heading, the control, the chart totals (out + in = both), the table view, and that the year links keep `dir`.
- [ ] **Step 8: Commit**: "Routes count both directions by default (LAX ↔ LHR), with a choice of either one"

---

### Task 4: Airport queries take a direction

**Files:**
- Modify: `datasette.yml` (`routes_by_year`, `routes_by_month`, `airport_size` and `airport_changes`)
- Test: `tests/test_routes_by_year.py`, `tests/test_routes_by_month.py`, `tests/test_airport_queries.py`

**Interfaces:**
- Consumes: Task 2's tables.
- Produces: each of the four queries takes `:dir`. Output columns keep their current names (`dest`, `city`, `market_id`, …), so the page scripts change only their parameters. Here `dest` means "the other airport", and each query's `description:` says so.

The queries become:

- **`routes_by_year`:** reads `route_year_totals`. The out arm is `origin = :origin` keyed by `dest`; the in arm is `dest = :origin` keyed by `origin AS dest`. Sum the arms, join `airport_names` for `city` and `airport_market` for `market_id`, and keep the majority-domestic `service` over the counted rows. The default `min_deps` becomes `CASE WHEN :dir = '' THEN 24 ELSE 12 END`.
- **`routes_by_month`:** stays on raw `t100` with the same two-arm shape and cut-off. Measure the `dir=in` time for ORD's latest year on the worktree DB. If it takes more than 1.5s, stop and report rather than adding a rollup.
- **`airport_size`:** reads `airport_carrier_dir_year`, with columns as now. Each measure is `CASE :dir WHEN 'out' THEN x_out WHEN 'in' THEN x_in ELSE x_out + x_in END`, with `deps`/`arrs` for flights.
- **`airport_changes`:** reads `carrier_pair_year` grouped by the other airport and `group_id`, using the same two arms. `first_ym`/`last_ym` come from `year * 100 + first_month`/`last_month`, MIN/MAX over the counted rows. `city` comes from `airport_names`.

- [ ] **Step 1: Write the failing tests** (one per bullet, in the files listed)
  - `test_routes_by_year_sums_both_directions`: out-only, in-only and both on a fixture with ATL→LAX 30 and LAX→ATL 20 give 30 / 20 / 50.
  - `test_cutoff_boundary`: ATL→XYZ 12 and XYZ→ATL 11 give `dir=out`: present; `dir=in`: absent; both (23): absent. Then add 1 more XYZ→ATL, and both (24) is present.
  - `test_service_is_majority_over_counted_directions`: ATL→YYZ has 20 international deps and YYZ→ATL 30 domestic. That's `out`: international; `in`: domestic; both: domestic.
  - `test_airport_size_counts_arrivals_at_a_destination_only_airport`: only ATL→LHR. `airport_size?origin=LHR` gives no rows with `dir=out`, and arrivals with `dir=in` and with both.
  - `test_airport_changes_reads_the_other_airport`: LAX→ATL in year a only. `airport_changes?origin=ATL&dir=in` lists `dest='LAX'` with `deps_a > 0`.
  - Existing tests that assume one-way defaults pass `dir=out` explicitly, rather than having their expected values changed.
- [ ] **Step 2: Run** `uv run pytest tests/test_routes_by_year.py tests/test_routes_by_month.py tests/test_airport_queries.py -q`. Expected: the new tests fail.
- [ ] **Step 3: Rewrite the four queries as above.**
- [ ] **Step 4: Run** `uv run pytest -q`. Expected: all pass.
- [ ] **Step 5: Commit**: "Airport queries count arrivals as well as departures, from the rollups, with a direction choice"

---

### Task 5: Airport pages

**Files:**
- Modify:
  - templates: `templates/airport.html`, `templates/routes.html`, `templates/airport_changes.html`, `templates/globe.html`, `templates/_foreign_note.html`
  - `plugins/t100_globe.py`:
    - `airport_view` and `globe_page` pass `dir` and `count_word`
    - `airport_years` reads `airport_dir_year` with `deps + arrs > 0`
  - scripts: `static/charts/airport.js`, `static/charts/routes.js`, `static/globe/main.js`, `static/globe/src/panel.js`, `static/charts/src/matrix.js` (`MATRIX_MEASURES.deps` label)
- Test: `tests/test_airport_pages.py`, `tests/test_routes_page.py`, `tests/test_globe_page.py`, `static/charts/test/matrix.test.js`, `static/globe/test/panel.test.js`

**Interfaces:**
- Consumes: Task 1's vocabulary and Task 4's `:dir` queries.
- Produces: each airport page has `data-dir` on `<body>` and a `#dir` `<select>` built from `DIRECTION_CHOICES_AIRPORT`, which calls `setDir` on change.

- [ ] **Step 1: Write the failing tests**
  - For each of `/airports/ATL`, `/destinations`, `/changes` and `/globe`:
    - the page has `select#dir` with three options
    - by default, its notes contain "to and from ATL" and not "departing *from*"
    - with `?dir=in`, they contain "arriving at ATL"
  - JS tests:
    - `MATRIX_MEASURES`-driven labels give "Flights" for `''` and "Arrivals" for `'in'`
    - the globe panel's `count(...)` label follows `countWord`
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Change the templates and plugin.** Replace each "Every count is of flights departing *from* …" note with direction-aware copy linking `/about#direction`.
  - both: "Every count includes flights to and from {{ origin }}."
  - out: "…flights departing {{ origin }}."
  - in: "…flights arriving at {{ origin }}."
- [ ] **Step 4: Change the scripts.**
  - Each script reads `parseDir(location.search)` and passes `dir` to every `queryUrl` and `setDataLink` call that Task 4 changed.
  - The destinations matrix and the globe read the "other airport" from `dest`, as now.
  - The globe's "routes with fewer than 12 departures a year are hidden" copy uses `cutoff(dir)` and `countWord(dir)`.
- [ ] **Step 5: Run** `uv run pytest -q && npm test`. Expected: all pass.
- [ ] **Step 6: Check in the browser on 8813:** `/airports/LAX`, `/destinations`, `/changes` and `/globe`.
  - Each direction loads.
  - The matrix for both is about twice the cells' values for out.
  - LHR (foreign) shows arrivals and departures.
  - The direction carries between these pages through the nav links.
- [ ] **Step 7: Commit**: "Airport pages count arrivals as well as departures, with a choice of direction"

---

### Task 6: Airport lists, home map, dedicated page and network globe

**Files:**
- Modify:
  - `datasette.yml`: `top_airports`, `busiest_airports`, `airport_by_year`, `dedicated_airports`, `airport_list` and `domestic_routes`, plus a new `globe_chooser`
  - `plugins/t100_globe.py`: `dedicated_rows`, `dedicated_airports_page`, `ROLLUPS["airports"]` (key `airport`) and `home_page`
  - templates: `templates/rollup.html`, `templates/airports.html`, `templates/airports_dedicated.html`, `templates/home.html`
  - scripts: `static/landing/main.js`, `static/landing/src/table.js` (`SORTS.deps`), `static/charts/rollup.js`, `static/home/main.js`, `static/home/src/map.js`, `static/globe/main.js` (`showChooser`), `static/globe/src/chooser.js` (`routesByOrigin`), `static/globe/src/adapter.js`
- Test: `tests/test_top_airports.py`, `tests/test_rollup_queries.py`, `tests/test_dedicated_airports.py`, `tests/test_home_queries.py`, `tests/test_domestic_routes.py`, `tests/test_globe_page.py`, plus `static/landing/test`, `static/globe/test/chooser.test.js` and `static/home/test/map.test.js`

**Interfaces:**
- Consumes: `airport_dir_year`, `airport_carrier_dir_year` and Task 1's vocabulary.
- Produces: these queries name the airport `airport` and its place `city`, not `origin`/`origin_city_name`. Every script that reads them changes to match.
  - `top_airports` and `airport_by_year` take `:dir`.
  - `busiest_airports`, `dedicated_airports` and `domestic_routes` are fixed to both directions.
  - `globe_chooser` returns `airport, city, passengers` over all years, both directions, US only (`wac BETWEEN 1 AND 93`), busiest first.
  - `domestic_routes` returns merged pairs, `a < b`, with ≥ 24 flights and majority domestic. `routesByOrigin` indexes each pair under both `a` and `b`.

- [ ] **Step 1: Write the failing tests**
  - `test_top_airports_ranks_on_both_by_default`: airport X has 10 out / 100 in and Y has 60 out / 0 in. By default X ranks first; with `dir=out`, Y does. `dests` counts partners with ≥ 24 flights when both, ≥ 12 one way.
  - `test_airport_by_year_threshold_is_730_flights_both_ways`: 365 out + 364 in excludes the airport; 365 + 365 includes it. With `dir=out`, 365 includes it.
  - `test_dedicated_counts_arriving_passengers`: an airline that only flies *into* X gets its share.
  - `test_domestic_routes_is_both_ways_pairs`: ATL→LAX 12 and LAX→ATL 12 give one row `('ATL','LAX')` with 24 deps. With 12 + 11, there's no row.
  - JS: `routesByOrigin([{a:'ATL', b:'LAX'}])` finds the pair under both codes.
  - Page copy:
    - `/airports/over-time` and `/airports` have `select#dir`
    - `/airports/dedicated` says passengers "boarding or leaving"
    - `rollup.html` uses "730 flights" for both and "365" one way
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Rewrite the queries.** Each one leaves the old tables untouched.
- [ ] **Step 4: Change the plugin, templates and scripts to the new column names and `dir`.**
  - `showChooser` uses `globe_chooser`.
  - The landing table's `deps` sort label comes from `countWord(dir)`, and its destination count from `cutoff(dir)`.
- [ ] **Step 5: Run** `uv run pytest -q && npm test`. Expected: all pass.
- [ ] **Step 6: Check in the browser on 8813:**
  - home map
  - `/airports` (each direction)
  - `/airports/over-time`
  - `/airports/dedicated`
  - `/airports/globe`, where hovering a dot draws the same routes as that airport's own globe by default
- [ ] **Step 7: Commit**: "Airport lists, the home map and the network globe count both directions"

---

### Task 7: Airline pages: pairs together or each direction

**Files:**
- Modify:
  - `datasette.yml` queries: `carrier_route_counts`, `carrier_routes_year`, `carrier_route_by_year` and `carrier_route_changes`
  - templates: `templates/airline.html`, `templates/airline_routes.html`, `templates/airline_changes.html`, `templates/airline_globe.html`
  - scripts: `static/charts/airline.js`, `static/charts/src/airline.js`, `static/charts/rollup.js`, `static/charts/src/rollup.js`, `static/charts/airlineglobe.js`, `static/common/highlight.js`
- Test: `tests/test_rollup_queries.py`, `tests/test_rollup_pages.py`, `static/charts/test/airline.test.js`, `static/charts/test/rollup.test.js`, `static/common/test/highlight.test.js`

**Interfaces:**
- Consumes: `carrier_pair_year` and `pairLabel`.
- Produces: the four queries read `carrier_pair_year`.
  - `carrier_routes_year` and `carrier_route_by_year` take `:each` (`''` or `'each'`).
  - When `''`, they group by `MIN(origin, dest), MAX(origin, dest)` as `origin, dest`. When `'each'`, they keep `origin, dest` as flown.
  - `carrier_route_changes` takes `:each` the same way.
  - `carrier_route_counts` and the airline globe are always merged.
  - `carrier_route_by_year`'s `HAVING` becomes `SUM(deps) >= CASE :each WHEN 'each' THEN 12 ELSE 24 END`.

- [ ] **Step 1: Write the failing tests**
  - `test_merged_pairs_match_old_table`: on a fixture, merged-mode `carrier_routes_year` rows equal what `carrier_route_year` held. That's the old meaning, kept.
  - `test_each_mode_splits_a_pair`: ATL→LGA 30 and LGA→ATL 25 give, merged, one row of 55; each, two rows of 30 and 25.
  - `test_each_mode_never_emits_an_empty_direction`: only ATL→LGA gives one row in each mode.
  - `test_airline_matrix_cutoff`: a pair with 12 + 11 is absent merged (23) and, in each mode, present for the 12 side only.
  - Pages:
    - `airline.html`'s `#al-min` options are `1, 24, 104, 730` labelled "once / 24 times / 104 times / 730 times". These are the old 12/52/365 doubled.
    - `/airlines/X/routes` and `/changes` have a `select#each` with "Pairs together" and "Each direction separately".
  - JS:
    - `static/charts/src/rollup.js` labels rows `ATL ↔ LGA` merged and `ATL → LGA` each
    - `highlight.js`'s never-flew message fires only in one-way route modes
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Rewrite the four queries on `carrier_pair_year`.**
- [ ] **Step 4: Change the templates and scripts.**
  - `#each` calls a reload with `dir=each` or no `dir`.
  - The routes table and changes summary read pair labels from `pairLabel`.
  - "both directions counted together" copy stays for merged mode. In each mode it becomes "each direction is its own row".
- [ ] **Step 5: Run** `uv run pytest -q && npm test`. Expected: all pass.
- [ ] **Step 6: Check in the browser on 8813:** `/airlines/delta`, `/routes` (both modes), `/changes` (both modes) and `/globe`. Clicking a pair link lands on the route page in both-ways mode, with numbers that match the airline's merged row.
- [ ] **Step 7: Commit**: "Airline pages read each pair as flown, and can split a pair into its two directions"

---

### Task 8: About page and leftover wording

**Files:**
- Modify: `templates/about.html` (`#direction` section and its list item), plus any template or script found by the sweep below
- Test: `tests/test_about_page.py`

- [ ] **Step 1: Write the failing test.** `/about#direction`'s heading is "Directions". The section mentions "both directions", "Flights", "Departures" and "Arrivals", and doesn't contain "Routes are one-way".
- [ ] **Step 2: Rewrite the section.**
  - Each T-100 row is one direction.
  - Pages count both directions by default and let you choose one.
  - Airline pages can split a pair.
  - Keep the anchor `direction` and the charters/positioning example.
- [ ] **Step 3: Sweep for one-way wording.** Run `grep -rniE "one-way|one direction|departing <em>from|departures from|Departures'" templates static plugins --include=*.html --include=*.js --include=*.py | grep -v test`.
  - Every hit outside the Non-goals pages either follows `dir` or is correct as written.
  - Fix any that aren't.
- [ ] **Step 4: Run** `uv run pytest -q && npm test`, then `scripts/smoke_check.sh` against 8813 if it accepts a base URL. Expected: all pass.
- [ ] **Step 5: Commit**: "About: what direction means now that pages count both"

---

### Task 9: Ship and remove the old tables (after deploy)

This task runs in two parts. The new tables must be on the Fly volume before the branch merges, and the old ones are removed only after the merged code is live.

- [ ] **Step 1: Before merging, ship the new tables.**
  - Write the three new tables into a small SQLite file, as `docs/monthly-updates.md` describes ("applied from a small separate SQLite file uploaded by sftp and copied in with `ATTACH`"). Record its size here: 112 MB (37 MB gzipped), built from the worktree database on 2026-10-28 with matching row counts. (Task 2 measured the tables on the full database: `airport_dir_year` 3.1MB, `airport_carrier_dir_year` 36.9MB, `carrier_pair_year` 86.9MB, so about 127MB in all, against 90MB for the three old tables they replace.)
  - **The owner uploads and applies it.** Don't run `flyctl` without their go-ahead.
  - Confirm `/-/derived` on production reports `ok`.
- [ ] **Step 2: The owner merges `bidirectional`, and CI deploys.** Check the live pages from Tasks 3–7 once.
- [ ] **Step 3: On a new branch, remove the old tables and their rebuilds.**
  - Remove `airport_year_totals`, `airport_carrier_year` and `carrier_route_year` and their `rebuild_*` functions from `build_database.py`.
  - Regenerate `schema.sql`.
  - Change any remaining query or plugin read of them (search: `grep -rn "airport_year_totals\|airport_carrier_year\|carrier_route_year" datasette.yml plugins static templates`), and update `tests/test_schema_check.py`'s missing-table example.
  - Expected: `uv run pytest -q && npm test` all pass.
- [ ] **Step 4: Document the update.** Add to `docs/monthly-updates.md` and `setup_database.md` which tables a monthly update now rebuilds.
- [ ] **Step 5: Commit**: "The old one-way airport rollups and merged airline pairs are gone"
- [ ] **Step 6: Drop the old tables on production.** After the owner deploys, they drop the three old tables there.
