# Airport views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give an airport the same four views as an airline: Over time (new charts) at `/airports/{code}`, Destinations (the existing matrix, moved) at `/airports/{code}/destinations`, Changes (a new table) at `/airports/{code}/changes`, and Map.

**Architecture:**
- Two new canned queries read the raw `t100` view for one origin.
- Pure functions in `static/charts/src/airport.js` shape the rows; one page script, `static/charts/airport.js`, serves both new pages, as `airline.js` serves an airline's two.
- The plugin gains two routes, a 301 for old matrix links, and a `views_for` case.
- `static/nav/src/state.js` learns that `/airports/X` and `/airports/X/destinations` take different carried settings.

**Tech Stack:** Datasette plugin (Python, Jinja), canned SQL in `datasette.yml`, plain ES modules with Observable Plot, pytest, `node --test`, headless Playwright for browser checks.

**Spec:** `docs/superpowers/specs/2026-10-22-airport-views-design.md`

## Global Constraints

- Every number counts flights departing from the airport (`origin = :origin`).
- Views line on all four pages: **Over time · Destinations · Changes · Map**, hrefs `/airports/{CODE}`, `/airports/{CODE}/destinations`, `/airports/{CODE}/changes`, `/airports/{CODE}/globe`, codes upper-cased.
- Titles:
  - "SFO: over time";
  - "SFO: destinations over time";
  - "SFO: what changed".
- Breadcrumbs:
  - "airports" › "SFO" on the charts;
  - "airports" › "SFO" (→ `/airports/SFO`) › "destinations" on the matrix;
  - "airports" › "SFO" › "changes" on the changes table.
- Matrix-only settings that 301 from `/airports/{code}` to `/destinations`: `n`, `group`, `rank`, `scale`, `open`. The query string is kept.
- Settings in the address, with defaults left out:
  - charts: `measure` (passengers), `flights` (passenger), `split` (service), `min` (12);
  - changes: `min` (12), `from` (latest − 6, not before the airport's first year), `to` (latest), `show` (destinations), `status` (dropped).
- Kind from the service class: `G` and `P` are freight. A destination's service is domestic when most of its departures that year were domestic, as `routes_by_year` decides it.
- Airline groups come from the carrier entity → `carriers.airline_id` (MIN per `unique_carrier_entity`) → `carrier_group`, else `'unknown'` / "Unknown carrier". This is the join `rebuild_carrier_group_year` uses.
- The airline split shows the top 8 groups plus "Other", biggest at the bottom and "Other" on top.
- Freight is shown in short tons (pounds ÷ 2000). Numbers use `formatCount` / `exactCount` from `static/common/numbers.js`.
- Stage files by name: `templates/` holds the user's untracked `query-t100-*.html` files. Commits end with the two attribution lines from the session.

## Review Focus

1. **"Unknown carrier" in the top 8:** it must not link to `/airlines/unknown`, which is a 404. It shows as plain text. *(Task 5 browser check: Task 2's test pins `sizeSeries` returning `links` without `unknown`.)*
2. **An airport code with no flights** (`/airports/ZZZ`): all three pages give 200. The charts say "No flights from ZZZ in the data." and the changes page says the same, with no script error from empty year menus. *(Task 4 pytest, Task 5 browser check.)*
3. **A matrix-only setting alongside a shared one** (`/airports/SFO?measure=deps&n=50`): a 301 keeping both, landing on the matrix with departures and 50 rows. *(Task 4 pytest.)*
4. **A measure the airport has none of** (passengers at a freight-only airport, or freight flights at a passenger-only one): "No passengers for this selection.", as the airline page says, not an empty chart. *(Task 2 test: `sizeSeries` returns no points; Task 5 draws the message.)*
5. **Comparing a year with itself** (`from` = `to`): every destination at or above the minimum is "kept", and the summary still reads sensibly. *(Task 2 test.)*

---

### Task 1: The two queries

**Files:**
- Modify: `datasette.yml` (add both after `routes_by_year`)
- Test: `tests/test_airport_queries.py` (create)

**Interfaces:**
- Produces: the canned query `airport_size(:origin)`. It returns one row per `year, group_id, group_name, service ('domestic'|'international'), kind ('passenger'|'freight')` with `deps, seats, passengers, freight`, ordered by year.
- Produces: the canned query `airport_changes(:origin, :a, :b)`. It returns one row per `dest, group_id, group_name` with:
  - `city` (MAX of `dest_city_name`);
  - `deps_a`, `deps_b`, `pax_a`;
  - `first_ym` and `last_ym` (`year*100+month`, over every year);
  - `HAVING deps_a > 0 OR deps_b > 0`, ordered by `deps_a DESC, deps_b DESC`.

- [ ] **Step 1: Write the failing tests** in `tests/test_airport_queries.py`.
  - Seed with `add_segments` (from `tests.helpers`), `add_carriers` and `flight` (from `tests.test_rollups`), and `put` (from `tests.test_rollup_queries`) for `carrier_group` rows.
  - Rows carry `carrier_entity` and `**{"class": ...}`.
  - Fetch with `get_json(ds, "/t100/airport_size.json?origin=SFO&_shape=objects")`.

```python
def test_airport_size_counts_departures_from_the_airport_by_group_service_and_kind(ds, db_path):
    # United (entity U1 -> 19977 -> group united) flies SFO-LAX passenger (F) and SFO-NRT freight (G) in 2019;
    # an unmapped entity X9 flies SFO-SEA; LAX-SFO (an arrival) must not count
    ...
    rows = {(r["year"], r["group_id"], r["service"], r["kind"]): r for r in body["rows"]}
    assert rows[(2019, "united", "domestic", "passenger")]["deps"] == 10
    assert rows[(2019, "united", "international", "freight")]["freight"] == 5000
    assert rows[(2019, "unknown", "domestic", "passenger")]["group_name"] == "Unknown carrier"
    assert sum(r["deps"] for r in body["rows"]) == 10 + 3 + 4      # the arrival is not counted

def test_airport_changes_gives_each_destination_and_group_both_years_and_its_span(ds, db_path):
    # SFO-LAX by United: 2019 Mar (8) and 2023 Jul (5); SFO-BOS by United 2023 only; SFO-SEA by United 2015 only (neither year)
    rows = {(r["dest"], r["group_id"]): r for r in get_json(ds, "/t100/airport_changes.json?origin=SFO&a=2019&b=2023&_shape=objects")["rows"]}
    assert rows[("LAX", "united")]["deps_a"] == 8 and rows[("LAX", "united")]["deps_b"] == 5
    assert rows[("LAX", "united")]["first_ym"] == 201903 and rows[("LAX", "united")]["last_ym"] == 202307
    assert rows[("BOS", "united")]["deps_a"] == 0 and rows[("LAX", "united")]["city"] == "Los Angeles, CA"
    assert ("SEA", "united") not in rows

def test_airport_changes_agrees_with_the_matrix(ds, db_path):
    # the same seed: summed over groups, each destination's deps_a equals routes_by_year's deps for that year
    ...
```

- [ ] **Step 2: Run them to watch them fail**

Run: `uv run pytest tests/test_airport_queries.py -v`
Expected: FAIL. Both get a 404 for the unknown canned query, so `get_json`'s status assert fails.

- [ ] **Step 3: Add `airport_size` and `airport_changes` to `datasette.yml`**
  - Both read `FROM t100 t`, with the group join written exactly as `rebuild_carrier_group_year` writes it (Global Constraints), and `WHERE t.origin = :origin`.
  - `kind` uses `CASE WHEN t.class IN ('G','P') THEN 'freight' ELSE 'passenger' END`.
  - `service` uses `t.domestic`.
  - `airport_changes` uses `SUM(CASE WHEN t.year = CAST(:a AS integer) THEN t.departures_performed ELSE 0 END)` for `deps_a`, and likewise for `deps_b` and `pax_a`.
  - Put a one-line comment above each, in the file's style.

- [ ] **Step 4: Run the tests to see them pass, and time both queries on the real database**

Run: `uv run pytest tests/test_airport_queries.py -v`, then:

```bash
time curl -s 'http://127.0.0.1:8811/t100/airport_size.json?origin=ATL&_shape=objects' | python3 -c 'import json,sys; b=json.load(sys.stdin); print(len(b["rows"]), b["truncated"])'
time curl -s 'http://127.0.0.1:8811/t100/airport_changes.json?origin=ATL&a=2019&b=2025&_shape=objects' | python3 -c 'import json,sys; b=json.load(sys.stdin); print(len(b["rows"]), b["truncated"])'
```

(Restart the scratch server first, as in the session notes, so it reads the new `datasette.yml`.)
Expected: the tests PASS. Each query returns `False` for truncated and takes under about 2 seconds.

- [ ] **Step 5: Commit**

```bash
git add datasette.yml tests/test_airport_queries.py
git commit -m "Queries: an airport's departures by year, airline group, service and kind; and each destination and group in two years, for what changed"
```

### Task 2: Pure functions

**Files:**
- Create: `static/charts/src/airport.js`
- Test: `static/charts/test/airport.test.js`

**Interfaces:**
- Consumes: `airport_size` and `airport_changes` rows (Task 1); `routes_by_year` rows (`dest, year, deps, service`); `buildSeries` from `static/charts/src/series.js`.
- Produces:
  - `sizeSeries(rows, { measure, flights, split }) → { points: [{ year: number, series: string, value: number }], series: string[], links: Map<string name, string group_id> }`
    - `split` is `'service' | 'kind' | 'airline'`.
    - The series for `service` are `['domestic','international']`, and for `kind` `['passenger','freight']`. Either way, only those with points are listed.
    - For `airline`, the series are ranked as `buildSeries` ranks them (`top: 8`), with "Other" last. Map each row to `{ year, carrier: group_name, deps, total_seats, total_passengers, total_freight }` and pass `periodKey: 'year'`.
    - Freight is in short tons.
    - `links` holds every shown group except `unknown`.
  - `placeCounts(rows, { min }) → [{ year: number, service: 'domestic'|'international', count: number }]`: destinations with `deps >= min`, by year and service.
  - `classifyChanges(rows, { min, show }) → [...]`
    - With `show: 'destinations'`, it gives `{ code, city, deps_a, deps_b, airlines: string[], status, ym }`:
      - `airlines` lists the group names in the year that counts, busiest first;
      - `ym` is `first_ym` for added and `last_ym` otherwise.
    - With `show: 'airlines'`, it gives `{ id, name, deps_a, deps_b, places, status, year }`:
      - `places` counts destinations with the group's own deps ≥ `min` in the year that counts;
      - `year` is `Math.floor(ym / 100)`.
    - `status` is `'kept'|'dropped'|'added'` as the spec defines it. Rows reaching the minimum in neither year are left out.
    - Sorting: by `deps_a` descending, except added, which sorts by `deps_b` descending.
  - `summariseChanges(items) → { kept, dropped, added }`.
  - `airlineList(names, shown = 3) → string`: `"A, B, C + 2 more"`.

- [ ] **Step 1: Write the failing tests** in `static/charts/test/airport.test.js`, one `test(...)` per behaviour:

```js
test('sizeSeries sums by service, by kind and by airline, and filters by flights', ...)
  // two years; united passenger domestic 10, united freight international 4, delta passenger domestic 6
  // split service, flights all, measure deps: 2019 domestic 16, international 4
  // split kind, flights passenger: series ['passenger'] only
test('sizeSeries keeps the top 8 airlines, folds the rest into Other on top, and links all but unknown', ...)
  // ten groups, one of them 'unknown' in the top 8: series.length === 9, series.at(-1) === 'Other',
  // links.has('Unknown carrier') === false, links.get('United (incl. Continental)') === 'united'
test('sizeSeries gives no points for a measure the airport has none of', ...)  // freight-only rows, measure passengers -> points []
test('sizeSeries gives freight in short tons', ...)  // freight 4000 lb -> value 2
test('placeCounts counts destinations at or above the minimum, by service', ...)  // deps 12 counts at min 12, 11 does not
test('classifyChanges sorts destinations into kept, dropped and added at the minimum', ...)  // exactly min counts
test('classifyChanges lists the airlines of the year that counts, busiest first', ...)
test('classifyChanges counts airlines and their destinations', ...)
test('a year compared with itself keeps everything', ...)  // deps_a === deps_b: all 'kept', summary { kept: n, dropped: 0, added: 0 }
test('airlineList shows three then counts the rest', ...)  // 5 names -> 'A, B, C + 2 more'; 2 names -> 'A, B'
```

- [ ] **Step 2: Run them to watch them fail**

Run: `node --test static/charts/test/airport.test.js`
Expected: FAIL. The module isn't found.

- [ ] **Step 3: Implement the functions** in `static/charts/src/airport.js`, with the signatures above.

- [ ] **Step 4: Run them to see them pass**

Run: `node --test static/charts/test/airport.test.js && npm test 2>&1 | grep -E '^ℹ (pass|fail)'`
Expected: all PASS, with 0 failures overall.

- [ ] **Step 5: Commit**

```bash
git add static/charts/src/airport.js static/charts/test/airport.test.js
git commit -m "An airport's chart series, destination counts and what changed, as pure functions"
```

### Task 3: Carried settings

**Files:**
- Modify: `static/nav/src/state.js` (`targetOf`, `carryParams`)
- Test: `static/nav/test/state.test.js`

**Interfaces:**
- Produces: `targetOf` returns:
  - `'airport'` for `/airports/X`;
  - `'routes'` for `/airports/X/destinations`;
  - `'changes'` for `/airports/X/changes`.
- Produces: `carryParams(search, 'airport')` gives `theme`, and `measure` when it's one of the matrix measures and not `passengers`. `carryParams(search, 'changes')` gives `theme` only. `'routes'` is unchanged.

- [ ] **Step 1: Update and add tests** in `static/nav/test/state.test.js`:
  - `targetOf('/airports/ATL') === 'airport'`, `targetOf('/airports/ATL/destinations') === 'routes'` and `targetOf('/airports/ATL/changes') === 'changes'`. Note that `/airports/ATL/destinations` and `/airports/ATL/changes` must not be read as routes.
  - `decorate('/airports/MCO', '?measure=deps&service=domestic&n=50&scale=year')` → `{ href: '/airports/MCO?measure=deps', keys: ['measure'] }`.
  - `decorate('/airports/MCO/destinations', '?measure=deps&service=domestic')` → `'/airports/MCO/destinations?measure=deps&service=domestic'`.
  - `decorate('/airports/MCO/changes', '?measure=deps&theme=dark').href === '/airports/MCO/changes?theme=dark'`.
  - Point the existing tests that use `/airports/MCO` for matrix settings (lines 31–60, 67) at `/airports/MCO/destinations`. The theme and hash tests (lines 79–89) stay on `/airports/MCO`.

- [ ] **Step 2: Run them to watch them fail**

Run: `node --test static/nav/test/state.test.js`
Expected: FAIL on the new targets.

- [ ] **Step 3: Implement** the new targets and the `'airport'` / `'changes'` branches in `carryParams`.

- [ ] **Step 4: Run them to see them pass**

Run: `npm test 2>&1 | grep -E '^ℹ (pass|fail)'`
Expected: 0 failures.

- [ ] **Step 5: Commit**

```bash
git add static/nav/src/state.js static/nav/test/state.test.js
git commit -m "Carried settings: an airport's charts take the measure only, its destinations matrix takes the matrix's settings, its changes the theme"
```

### Task 4: Routes, redirects, views line and templates

**Files:**
- Modify: `plugins/t100_globe.py` (`register_routes`, `views_for`, `routes_page`, new `airport_page` / `airport_changes_page`, `globe_page` unchanged)
- Create: `templates/airport.html`, `templates/airport_changes.html`
- Modify: `templates/routes.html` (title)
- Modify: `static/charts/routes.js:90` (`airportHref` → `/airports/{code}/destinations`)
- Modify: `scripts/smoke_check.sh`
- Test: `tests/test_airport_pages.py` (create). Update `tests/test_navigation.py`, `tests/test_routes_page.py`, `tests/test_foreign_note.py`, `tests/test_nav.py`, `tests/test_page_frame.py` and `tests/test_redirects.py`.

**Interfaces:**
- Consumes: nothing from Tasks 1–3 at render time. The templates name the elements Task 5's script reads.
- Produces: the elements.
  - `templates/airport.html` body: `data-origin`, `data-first-year`, `data-last-year` (empty when the airport has no flights), `data-foreign`. The controls are `#ap-measure`, `#ap-flights`, `#ap-split`, `#size-chart`, `#ap-min` and `#places-chart`. It loads `/static/charts/airport.js`.
  - `templates/airport_changes.html`: the same body data, plus `#ap-min`, `#ap-a`, `#ap-b`, `#change-summary`, `#ap-show`, `#ap-status` and `<div class="scroll"><table id="change-table"><thead></thead><tbody></tbody></table></div>`. The script writes the thead. Below it goes the note, worded from the spec.
  - Both include `_nav.html`, `_foreign_note.html` and `_footer.html`, and `<p class="intro" id="subtitle">`, as `routes.html` does.
- Produces: `airport_years(datasette, code) -> (first, last)` from `airport_year_totals` (`deps > 0`), giving `(None, None)` when there are no rows.

- [ ] **Step 1: Write the failing tests** in `tests/test_airport_pages.py`. Seed `airport_year_totals` with `put`.

```python
VIEWS = ["Over time", "Destinations", "Changes", "Map"]
def test_the_charts_are_the_airports_default_page(ds, db_path)        # 200, id="size-chart", id="places-chart", "SFO: over time", airport.js; no id="matrix"
def test_the_matrix_has_moved_to_destinations(ds)                     # /airports/SFO/destinations: 200, id="matrix", "SFO: destinations over time", routes.js
def test_the_changes_page(ds, db_path)                                # 200, id="change-table", id="ap-show", "SFO: what changed"
def test_each_page_has_the_four_views_with_its_own_current(ds)        # regex on the views line for each of the four paths
def test_crumbs(ds)                                                   # as Global Constraints, via tests.test_nav.crumbs
def test_first_and_last_years_come_from_the_airports_totals(ds, db_path)  # data-first-year="1995" data-last-year="2025"
def test_an_airport_with_no_flights_still_renders_each_page(ds)       # /airports/ZZZ, /destinations, /changes: 200, data-first-year=""
@pytest.mark.parametrize("q", ["n=50", "group=city", "rank=latest", "scale=year", "open=NYC", "measure=deps&n=50"])
def test_matrix_settings_go_to_the_matrix(ds, q)                      # 301, location == f"/airports/SFO/destinations?{q}"
@pytest.mark.parametrize("q", ["", "measure=seats", "service=domestic", "theme=dark"])
def test_shared_settings_stay_on_the_charts(ds, q)                    # 200
def test_bad_codes_are_404_on_the_new_paths(ds)                       # /airports/toolong/changes, /airports/toolong/destinations
def test_a_foreign_airport_has_its_note_on_each_page(ds, db_path)     # reuse tests.test_foreign_note.load
```

Also update the existing tests:
- `test_navigation.py`: the airport views, `PAGES` (lines 68–69, adding `/destinations` and `/changes`), and `views_for("/airports/sfo/destinations")`.
- `test_routes_page.py`: the matrix assertions (city grouping, label tip, ranking, colouring, sentence) move to `/airports/ATL/destinations`. `test_globe_page_links_to_routes_over_time` keeps `href="/airports/ATL"`.
- `test_foreign_note.py`: unchanged paths still pass, since the note is on the charts too.
- `test_nav.py`: `SCROLLING` gains `/airports/ATL/destinations` and `/airports/ATL/changes`.
- `test_page_frame.py`: `TEMPLATES` gains `airport` and `airport_changes`.
- `test_redirects.py`: `OLD` gains `("/airports/ATL?n=10", "/airports/ATL/destinations?n=10")`.

- [ ] **Step 2: Run them to watch them fail**

Run: `uv run pytest tests/test_airport_pages.py tests/test_navigation.py tests/test_routes_page.py -q`
Expected: FAIL. The new paths 404 and the old views line is "Routes over time · Map".

- [ ] **Step 3: Implement** the following:
  - **Routes:** add `/airports/{CODE}/destinations` → `routes_page` and `/airports/{CODE}/changes` → `airport_changes_page`, placed before the route pattern. `/airports/{CODE}` → `airport_page`, which 301s on `MATRIX_SETTINGS = ("n", "group", "rank", "scale", "open")`, following `airline_table_page`.
  - **`views_for`:** one case, `["airports", code, *rest] if AIRPORT_CODE.match(code) and rest in ([], ["destinations"], ["changes"], ["globe"])`, replacing the two old ones.
  - **Pages:** each page's context carries `origin`, `first_year`, `last_year`, `foreign` and `crumbs`.
  - **`routes.html`:** its `<h1>` becomes `{{ origin }}: destinations over time`, and its `<title>` changes to match.
  - **`routes.js`:** `airportHref` points at `/destinations`.
  - **`scripts/smoke_check.sh`:** add `check 200 /airports/SFO "size-chart"`, `check 200 /airports/SFO/destinations "matrix"` (replacing the old `/airports/SFO "matrix"` line) and `check 200 /airports/SFO/changes "change-table"`, plus a 301 check for `/airports/SFO?n=50` in the style the `/airlines?scale=busiest` line uses.

- [ ] **Step 4: Run the whole suite to see it pass**

Run: `uv run pytest -q 2>&1 | tail -2 && npm test 2>&1 | grep -E '^ℹ (pass|fail)'`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add plugins/t100_globe.py templates/airport.html templates/airport_changes.html templates/routes.html static/charts/routes.js scripts/smoke_check.sh tests/test_airport_pages.py tests/test_navigation.py tests/test_routes_page.py tests/test_nav.py tests/test_page_frame.py tests/test_redirects.py
git commit -m "An airport's views: over time at /airports/{code}, the destinations matrix moved to /destinations, what changed at /changes; old matrix links go on to it"
```

### Task 5: The page script, browser check and roadmap

**Files:**
- Create: `static/charts/airport.js`
- Modify: `static/charts/style.css` (only if the change table needs a rule that `#change-table` doesn't already have)
- Modify: `docs/site-coherence.md`
- Test: `<scratchpad>/airport_views_check.py` (headless Playwright)

**Interfaces:**
- Consumes:
  - Task 1's queries, via `queryUrl` / `fetchRows` from `/static/globe/src/api.js`;
  - Task 2's functions;
  - Task 4's elements;
  - `replaceSearch` from `/static/nav/src/state.js`, which keeps `theme` and carried keys when writing the page's own;
  - `plot`, popover and highlight in the manner of `airline.js`;
  - `seriesColours` from `/static/common/palette.js` for the airline split, and `palette(isDark()).service` / `.kind` for the others.
- Produces: no exports.

- [ ] **Step 1: Write the browser check** `airport_views_check.py`, in the style of `airline_routes_check.py`, against `http://127.0.0.1:8811`, printing `FAILURES: n`:
  - **The charts:** `/airports/SFO` draws an svg in `#size-chart` and in `#places-chart`.
    - Choosing `airline` in `#ap-split` puts a United label and "Other" in the legend. United's legend entry is a link to `/airlines/united`, and the address gains `split=airline`.
    - An "Unknown carrier" entry, if shown, isn't a link.
  - **Freight:** `/airports/SFO?flights=freight&measure=passengers` shows "No passengers for this selection." in `#size-chart`.
  - **Old links:** `/airports/SFO?n=50` lands on `/airports/SFO/destinations?n=50` with 50 matrix rows. Clicking a row's code goes to `/airports/{code}/destinations`, and the breadcrumb "SFO" goes to `/airports/SFO`.
  - **The changes page:** `/airports/SFO/changes` shows a summary starting "In 2019 SFO had flights to" and rows in `#change-table`.
    - Choosing airlines then added redraws with no new request to `airport_changes`.
    - The address gains `show=airlines&status=added`.
    - Setting `#ap-a` equal to `#ap-b` reports 0 dropped and 0 added.
  - **A carried measure:** from `/airports?sort=freight`, the SFO row's link opens `/airports/SFO?measure=freight` with freight selected. The views line's Destinations link carries `measure=freight`.
  - **No flights:** `/airports/ZZZ` and `/airports/ZZZ/changes` say "No flights from ZZZ in the data." with no page errors.
  - **Errors:** there are no page errors anywhere.

- [ ] **Step 2: Run it to watch it fail**

Run: `uv run --no-project --with playwright python <scratchpad>/airport_views_check.py`
Expected: FAILURES above 0. There are no svgs, because `airport.js` doesn't exist yet.

- [ ] **Step 3: Implement `static/charts/airport.js`**
  - It reads the body data and the address.
  - It fills the menus: the measures from `MATRIX_MEASURES`, and the years from `data-first-year` to `data-last-year`.
  - With no first year, it writes "No flights from {origin} in the data." in the page's chart or summary box and stops.
  - It fetches once per page:
    - `airport_size` and `routes_by_year` with `min_deps=1` for the charts;
    - `airport_changes` for the changes table, refetched only when the years change.
  - **Drawing:**
    - The charts follow `airline.js`'s `drawSize` and `drawPairs`.
    - The airline split's legend entries are wrapped in links from `links`.
    - The changes table writes its own thead for the shown kind: Destination, departures in each year, Airlines, Last/First flown; or Airline, departures in each year, Destinations, Last/First flown here.
    - It shows the summary and "None." for an empty table.
  - **Address:** it writes the state with `replaceSearch`, using the keys and defaults in Global Constraints.

- [ ] **Step 4: Run the check and the suites to see them pass**

Run: `uv run --no-project --with playwright python <scratchpad>/airport_views_check.py && uv run pytest -q 2>&1 | tail -1 && npm test 2>&1 | grep -E '^ℹ (pass|fail)'`
Expected: `FAILURES: 0`, and all tests pass.

- [ ] **Step 5: Update `docs/site-coherence.md`**
  - Under part 3, mark an airport's views as built, with the spec's path, in the format the other two entries use.
  - Leave "a family map" as the one still to come.
  - Update the "What exists now" table's One airport row.

- [ ] **Step 6: Commit**

```bash
git add static/charts/airport.js docs/site-coherence.md   # plus static/charts/style.css if changed
git commit -m "An airport's charts and what changed: how big by service, kind or airline; how many destinations; destinations and airlines gained and lost"
```
