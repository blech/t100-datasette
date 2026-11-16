# Airline Mergers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show airline mergers: a new `/airlines/mergers` page (stacked passengers, each survivor's absorbed airlines in shades of its colour), and on `/airlines/over-time` groups that open into their member airlines plus an "ordered by" menu (size, first year flown, last year flown).

**Architecture:** One new canned query, `carrier_member_by_year` (one row per year, group, member airline, service, kind), feeds both pages. The over-time page moves from `buildMatrix` onto `buildCityMatrix` (the engine behind the ▸ rows of cities and aircraft families), which gains `order` and `expandSingle` options. The Mergers page is a pure series builder (`static/charts/src/mergers.js`) plus a page script that reuses the front page's stacked-band chart, which is first extracted into `static/common/bands.js`.

**Tech Stack:** Datasette canned queries (`datasette.yml`), a Datasette plugin (`plugins/t100_globe.py`), Jinja templates, plain ES modules with Observable Plot, `node --test`, pytest.

**Spec:** None written; the design was agreed in conversation on 2026-11-16 and is summarised here and in Global Constraints. Executors need nothing else.

## Global Constraints

- Work on branch `airline-lifetimes` (it already has `worktree-matrix-row-scale` merged, so `scale=row` exists).
- **Never stop the user's server on port 8808.** To look at a page, run `uv run datasette --port 8818 .` (directory `.`, no `--host`) and stop it afterwards.
- **Do not touch `templates/changelog.html`** (hand-written by the user). If the change deserves an entry, say so in the final summary.
- Page scripts are loaded with `{{ script_url('charts/mergers.js') }}` and `{{ modulepreload(...) }}`, never a literal `/static/...` script path (see `templates/rollup.html`).
- Numbers go through `static/common/numbers.js` (`formatCount`, `millionsAxis`); no ad-hoc `toFixed`.
- No `#rrggbb` literal or Plot `scheme:` in `static/**/*.js` except the exceptions in `docs/superpowers/specs/2026-10-21-colour-design.md` (`static/common/palette.js`, the `LIVERY` and `FALLBACK` lists in `static/home/src/airlines.js`, `scheme: 'YlOrRd'` in heat-map files). Member shades are computed from the survivor's livery colour, never written as literals.
- Keep README.md in step (pages and canned queries). Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Agreed design: the Mergers page shows the five groups that have absorbed airlines (American, Delta, United, Southwest, Alaska), ordered by latest-year size, passengers only, all other airlines as grey "Every other airline" on top; a survivor is the member with the most passengers in the latest year with data. The over-time menu orders within the top N (chosen by size): `size` (default), `first` (earliest first year flown first), `last` (latest last year flown first); ties by size. A group's first year is its earliest member's, its last year its latest member's.

## Review Focus

- A group with one member in the data has no ▸ and links to its airline page (`/airlines/<group_id>`).
- An open group whose members have no flights under the current service/kind filter shows no empty member rows.
- Ordering by first year when everything ties on 1990 (or by last year when everything ties on 2025) falls back to size, not to arbitrary order.
- `?open=` naming a group that is not in the top N, or does not exist, is ignored without error; `?order=` with an unknown value falls back to `size`.
- On the Mergers page a group whose absorbed member overlaps the survivor in time (Alaska and Virgin America, 2016–2018) stacks correctly, and a theme change redraws the chart with shades still distinguishable.

---

### Task 1: The `carrier_member_by_year` query

**Files:**
- Modify: `datasette.yml` (add after `carrier_group_by_year`, line ~672)
- Modify: `README.md` (canned query list: add one line)
- Test: `tests/test_rollup_queries.py`

**Interfaces:**
- Produces: `/t100/carrier_member_by_year.json?_shape=objects` rows with keys `year, group_id, group_name, airline_id, airline_name, service, kind, deps, seats, passengers, freight`. `airline_name` is `carrier_group.airline_name`, falling back to `group_name` (as `airline_table` does). `service` is `domestic|international`, `kind` is `passenger|freight`, as in `carrier_group_by_year`.

- [ ] **Step 1: Write the failing test** `test_carrier_member_by_year_keeps_each_member_of_a_group` in `tests/test_rollup_queries.py`: with `put`, insert two `carrier_group_year` rows for group `delta` (airline ids `19790` and `19386`, year 2005, passengers 300 and 100) and two `carrier_group` rows (`airline_name` "Delta Air Lines Inc." and "Northwest Airlines Inc."). Assert the JSON has two rows and `{(r["airline_id"], r["airline_name"], r["group_id"], r["passengers"]) for r in rows}` equals `{("19790", "Delta Air Lines Inc.", "delta", 300), ("19386", "Northwest Airlines Inc.", "delta", 100)}`. Add a second assertion in a second test that a `carrier_group_year` row with no `carrier_group` row gets `airline_name == group_name`.
- [ ] **Step 2: Run** `uv run pytest tests/test_rollup_queries.py -k carrier_member -v`. Expected: FAIL (404 for the query).
- [ ] **Step 3: Add `carrier_member_by_year`** to `datasette.yml` with `title`, `description` (one row per year, group, member airline, service and kind) and SQL: `carrier_group_year d LEFT JOIN carrier_group g ON g.airline_id = d.airline_id`, grouped by year, group_id, group_name, airline_id, airline_name, service, kind, summing deps/seats/passengers/freight; `ORDER BY year, group_name, airline_id`. Use the same `service`/`kind` CASE expressions as `carrier_group_by_year`. Add the README line beside `carrier_group_by_year`'s.
- [ ] **Step 4: Run** the same command. Expected: PASS. Also run `uv run pytest tests/test_rollup_queries.py -v` (all pass).
- [ ] **Step 5: Commit** `git add datasette.yml README.md tests/test_rollup_queries.py && git commit -m "Add carrier_member_by_year: each group's member airlines by year"`.

### Task 2: `buildCityMatrix` gains `order` and `expandSingle`

**Files:**
- Modify: `static/charts/src/matrix.js` (`buildCityMatrix`, line ~137)
- Test: `static/charts/test/matrix.test.js`

**Interfaces:**
- Produces: `buildCityMatrix(rows, { ..., order = 'size', expandSingle = true })`. `order` is `'size' | 'first' | 'last'`. With `first`, the top-`n` groups (still selected by size) are listed by earliest year with value > 0 ascending; with `last`, by latest such year descending; ties by size, then name. The same key orders members within an opened group. A group with a single member gets `expandable: false` when `expandSingle` is false (default `true` keeps cities and families as they are). Unknown `order` values behave as `size`.

- [ ] **Step 1: Write failing tests** in `matrix.test.js` using the file's existing row helper style (`dest`, `market_id`, `group_label`, `year`, `service`, `passengers` etc.; check how existing `buildCityMatrix` tests build rows and reuse that helper):
  - `order: first` — groups G1 (first 1995, big), G2 (first 1990, small), G3 (first 1990, bigger) → row keys `[G3, G2, G1]`; the top-`n` cut is by size (with `n: 2` and sizes G1 > G3 > G2, rows are `[G3, G1]`).
  - `order: last` — a group ending 2010 sorts below one flying to 2025; two ending 2025 tie → size decides.
  - Opened group (`open: ['G1']`) lists members by the same key, and a member with only zero-value rows gets no row (Review Focus 2).
  - `expandSingle: false`: a group with one `dest` has `expandable === false`; one with two has `true`; default call gives `true` for both.
  - `order: 'nonsense'` equals the `size` result.
- [ ] **Step 2: Run** `node --test static/charts/test/matrix.test.js`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** both options in `buildCityMatrix`: after the size-ranked `.slice(0, n)`, reorder `ranked` with a comparator from a small helper `orderBy(order)` (years from each group's `byYear` entries with `value > 0`; members from `a.byYear`). Apply the helper to `g.list` inside the open-group loop. `expandable: g.airports.size > 1 || expandSingle` (count only airports with `rank > 0`... use `g.list.length`).
- [ ] **Step 4: Run** `node --test static/charts/test/matrix.test.js` and `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `Matrix rows can be ordered by first or last year, and single-member groups need not open`.

### Task 3: The over-time page opens groups into airlines

**Files:**
- Modify: `static/charts/rollup.js` (KINDS line 20, `grouped()` line 73, `groupedRows()` line ~148, `drawCities()` labels/hrefs line ~170, the `shorts` setup line ~418, rank-note text line ~257)
- Modify: `templates/rollup.html` (airlines intro sentence only)
- Test: `tests/test_rollup_pages.py`

**Interfaces:**
- Consumes: `carrier_member_by_year` rows (Task 1); `buildCityMatrix` with `expandSingle` (Task 2).
- Produces: the airlines page loads `carrier_member_by_year`, always draws through `drawCities`, and keeps `?open=<group_id>,…` in the address. In the grouped rows `dest` is the `airline_id`, `market_id` the `group_id`, `group_label` the `group_name`, `city` the `airline_name`; rows are filtered by `state.flights` as the aircraft page does.

- [ ] **Step 1: Write failing test** `test_airlines_page_loads_the_member_query` in `tests/test_rollup_pages.py`: `/airlines/over-time` HTML still has `data-kind="airlines"` and the sentence selects (unchanged list), and `/static/charts/rollup.js` text (read with the test client's static route, or `Path("static/charts/rollup.js").read_text()`) contains `carrier_member_by_year`. Also add to `static/charts/test/rollup.test.js` a test of a new pure helper `airlineGroupRows(rows, { flights })` exported from `static/charts/src/rollup.js`: maps member rows to `{...r, dest: airline_id, market_id: group_id, group_label: group_name, city: airline_name}`, dropping rows whose `kind` differs from `flights` unless `flights === 'all'`.
- [ ] **Step 2: Run** `uv run pytest tests/test_rollup_pages.py -v` and `node --test static/charts/test/rollup.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.** Add `airlineGroupRows` to `static/charts/src/rollup.js`. In `rollup.js`: `KINDS.airlines.query = 'carrier_member_by_year'`; `grouped()` also true for `kind === 'airlines'`; `groupedRows()` returns `airlineGroupRows(rows, state)` for airlines; `drawCities` calls `buildCityMatrix(..., { expandSingle: kind !== 'airlines' })`; airlines labels: a group row's text is `labelOf(group_name)` linking `/airlines/<group_id>`, a member row's text is the short name of its airline linking `/airlines/<airline_id>`, hover titles show the full legal name (follow how `aircraft` labels are built in the same function); disclosure arrows say "List <label>'s airlines". Build `shorts` from group and airline names. Update the rank note and the template intro to say ▸ lists the airlines that merged into a group. Keep merged-group wording ("counted together throughout").
- [ ] **Step 4: Run** `uv run pytest` and `npm test`. Expected: PASS. Then start `uv run datasette --port 8818 .`, open `/airlines/over-time?open=delta,united&scale=row`, confirm: single-airline rows have no ▸, Delta opens into Delta and Northwest (first-year 1990, Northwest ends 2009), hover and links work, the aircraft and airports over-time pages are unchanged. Stop the server.
- [ ] **Step 5: Commit** `Airlines over time: groups open into the airlines that merged into them`.

### Task 4: The "ordered by" menu

**Files:**
- Modify: `templates/rollup.html` (line ~32, the sentence), `static/charts/rollup.js` (state, `pushState` key list line 89, `fillControls`, `drawCities` call), `static/charts/src/airlines.js` (`sharedQuery`, only if it filters params: add `order`)
- Test: `tests/test_rollup_pages.py`, `static/charts/test/rollup.test.js`

**Interfaces:**
- Consumes: `buildCityMatrix({ order })` (Task 2).
- Produces: `<select id="matrix-order">` with values `size`, `first`, `last` (labels "size", "first year flown", "last year flown"), shown only for `kind == "airlines"`, placed after the ranked-by menu as ", ordered by <select>"; state `order` read from `?order=` (unknown → `size`) and written back only when not `size`.

- [ ] **Step 1: Write failing tests.** Python: for `/airlines/over-time` the sentence's selects are `["matrix-measure", "matrix-kind", "matrix-service", "matrix-n", "matrix-rank", "matrix-order"]`; for `/aircraft/over-time` they are the original five (update `test_settings_read_as_one_sentence` to be parametrised by path with the expected list). JS (`rollup.test.js` or a new pure helper test): if you add a helper `pickOrder(search)` in `static/charts/src/rollup.js`, test `?order=last → 'last'`, `?order=x → 'size'`, none → `'size'`.
- [ ] **Step 2: Run** both test commands. Expected: FAIL.
- [ ] **Step 3: Implement** the template select (airlines only), the `order` state and its URL round trip in `rollup.js`, pass `order: state.order` to `buildCityMatrix`, add one sentence to the scale/rank note explaining the order. Make sure changing the menu redraws and that links to other airline views carry `order` via `sharedQuery`.
- [ ] **Step 4: Run** `uv run pytest` and `npm test`. Expected: PASS. Render on port 8818: `?order=first&scale=row` shows a staircase, `?order=last` puts closed airlines (ATA, Midway, Trans States) together at the bottom; stop the server.
- [ ] **Step 5: Commit** `Airlines over time: order the rows by size, first year or last year flown`.

### Task 5: Share the front page's stacked-band chart

**Files:**
- Create: `static/common/bands.js`
- Modify: `static/home/main.js` (remove the moved functions, import them), `static/home/src/airlines.js` (export `brand`; add `Alaska` to `LIVERY`)
- Test: `static/common/test/bands.test.js`

**Interfaces:**
- Produces from `static/common/bands.js`: `plotFrame(box, height, { minYear, maxYear })`, `airlineBands(bands, colourOf)`, `fadeEdges(plot, colourOf)`, `bandKey(series, colourOf)` (the old `keyOf`), and `passengerChart(box, { series, bands, colourOf, minYear, maxYear, height })`, each moved unchanged from `static/home/main.js` apart from taking `minYear`, `maxYear` and `height` as arguments instead of reading module globals. Pure helper `stackTotals(bands)` → `Map(year → top of stack)` replacing the inline `totalByYear`. `home/src/airlines.js` exports `brand(name)` and `LIVERY` gains `Alaska` (a teal, `#0E8A7D`, clear of United's blue and Delta's red).

- [ ] **Step 1: Write failing test** `static/common/test/bands.test.js`: `stackTotals` over bands `[{year: 2000, series: 'A', y2: 3}, {year: 2000, series: 'Every other airline', y2: 10}]` returns `10` for 2000; `bandKey('Every other airline', c)` is `{ kind: 'other' }`, `bandKey('Delta', () => 'x')` is `{ kind: 'square', colour: 'x' }`; and `airlineColours(['Alaska'])[0]` differs from the other four liveries.
- [ ] **Step 2: Run** `node --test static/common/test/bands.test.js`. Expected: FAIL (module missing).
- [ ] **Step 3: Move the code** from `home/main.js` (`keyOf`, `plotFrame`, `airlineBands`, `fadeEdges`, `passengerChart`) into `bands.js`, update `home/main.js` to import and call them with its `minYear`, `maxYear`, `chartHeight()`; export `brand`; add the Alaska livery.
- [ ] **Step 4: Run** `npm test` (PASS). Then render `/` on port 8818 and confirm the front-page airlines chart looks and behaves exactly as before (bands, legend, hover popover, highlight, light and dark theme). Stop the server.
- [ ] **Step 5: Commit** `Share the stacked passenger chart between the front page and a coming page`.

### Task 6: The mergers series builder

**Files:**
- Create: `static/charts/src/mergers.js`
- Test: `static/charts/test/mergers.test.js`

**Interfaces:**
- Consumes: `carrier_member_by_year` rows; `stackShares`, `OTHER_AIRLINES`, `brand`, `airlineColours` from `static/home/src/airlines.js`.
- Produces: `shade(hex, t)` → `#rrggbb` string mixing `hex` toward white by `t` in 0..1 (no colour literals in the source); `mergerBands(rows)` → `{ series: string[], bands: [{ year, series, passengers, y1, y2 }], groups: [{ id, name, survivor: string, members: string[] }], colours: Map<series, hex>, years: [min, max] }`. Rules: passengers summed per year and `airline_id` over service and kind; only groups with two or more distinct airlines having passengers > 0 appear; a series is `brand(airline_name)`, made unique with ` (airline_id)` if two collide; survivor is the member with most passengers in the latest year, ties by total passengers; groups stack biggest survivor (latest year) first, within a group the survivor at the bottom then absorbed members by total passengers descending; `OTHER_AIRLINES` is each year's all-airline total minus the listed series, stacked last; colours: survivor = `airlineColours([survivorBrand])[0]`, absorbed `i` (1-based) = `shade(base, Math.min(0.8, 0.3 + 0.2 * (i - 1)))`.

- [ ] **Step 1: Write failing tests** with a small fixture (Delta group: 19790 Delta Air Lines Inc., 19386 Northwest Airlines Inc., both 2005, only Delta 2025; American group likewise; one singleton airline; two years): the five assertions are (a) `groups.map(g => g.id)` lists only multi-member groups, ordered by survivor's 2025 passengers; (b) survivor is the member flying in 2025; (c) `series` order is Delta, Northwest, American, …, `OTHER_AIRLINES` last; (d) for each year the top of the last band equals that year's all-airline total (the rest is total minus listed); (e) `colours.get('Delta')` is the Delta livery and `colours.get('Northwest Airlines')` is lighter (`shade(...)`), and `shade('#000000', 0.5)` is `'#808080'`. Add (f): a group whose members overlap in time (two members both flying 2017) stacks without gaps (`y1` of each band equals the previous `y2`), and (g): two members whose brands collide get distinct series names.
- [ ] **Step 2: Run** `node --test static/charts/test/mergers.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** `shade` and `mergerBands` in `static/charts/src/mergers.js` per the rules above, building bands with `stackShares(points, (d) => order.indexOf(d.series), (d) => d.passengers)`.
- [ ] **Step 4: Run** `node --test static/charts/test/mergers.test.js` and `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `Mergers: build the stacked bands, with absorbed airlines in shades of the survivor`.

### Task 7: The Mergers page, its navigation, and checks

**Files:**
- Create: `templates/mergers.html`, `static/charts/mergers.js`
- Modify: `plugins/t100_globe.py` (new route before the `/airlines/<slug>` routes at line ~77, a `mergers_page` view, `views_for` airlines case line ~161), `README.md` (pages list), `scripts/smoke_check.sh` (add `check 200 /airlines/mergers "passenger-chart"` after the `/airlines/over-time` line)
- Test: `tests/test_rollup_pages.py` (page), `tests/test_navigation.py` (views line)

**Interfaces:**
- Consumes: `mergerBands` (Task 6), `passengerChart`, `bandKey`, `fadeEdges` (Task 5), `periodRows`/`attachPopover` from `static/common/popover.js`, `attachHighlight` from `static/common/highlight.js`.
- Produces: `GET /airlines/mergers` renders `mergers.html` (extends `t100_base.html`) with `<div class="graphic chart-box" id="passenger-chart">`, `data-min-year`/`data-max-year` on `<body>` as the front page has, the crumb trail `airlines` → `mergers`, and a views line `Airlines | Over time | Mergers` (`current` index 2 for `/airlines/mergers`; the other two airlines-page paths list it too).

- [ ] **Step 1: Write failing tests.** `tests/test_rollup_pages.py`: `/airlines/mergers` returns 200, contains `id="passenger-chart"`, a `script_url`-built `charts/mergers.js` reference, and `<li aria-current="page">mergers</li>`. `tests/test_navigation.py`: update the airlines views expectation to `[("Airlines","/airlines"), ("Over time","/airlines/over-time"), ("Mergers","/airlines/mergers")]` with `current` following the path, and `section_of("/airlines/mergers") == "airlines"`.
- [ ] **Step 2: Run** `uv run pytest tests/test_rollup_pages.py tests/test_navigation.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement.** Route `(r"^/airlines/mergers$", mergers_page)` placed before the slug routes (a slug `mergers` must not reach `airline_page`); `mergers_page` renders `mergers.html` with `min_year, max_year` (from `year_range(datasette)`) and `crumbs=trail(datasette, ("airlines", "/airlines"), ("mergers", None))`. Template: title "Airlines that merged", an intro paragraph (what the colours mean: each coloured family is a surviving airline, the lighter shades the airlines it absorbed, grey everyone else; BTS reports some mergers jointly from a later date than the deal, so a band can end before the merger year), the chart box, the views line and the data-link footer as other chart pages do. `static/charts/mergers.js`: fetch `carrier_member_by_year` with `fetchRows(queryUrl(...))`, call `mergerBands`, draw with `passengerChart` and `bandKey`, popover rows per year via `periodRows` over `[...series, OTHER_AIRLINES, 'All airlines']`, grey for `OTHER_AIRLINES` from `palette(isDark()).other`, redraw on `t100:theme`, `failed()` message on error (copy the front page's pattern).
- [ ] **Step 4: Run** `uv run pytest` and `npm test` (all pass). Render `/airlines/mergers` on port 8818 in light and dark: five hue families, Northwest's band beside Delta's falling away in 2008–2009 as Delta steps up, US Airways/America West/TWA within American's hue, popover lists each airline. Check the "Over time" and "Airlines" views links carry through. Also run `npm run bundle`, load the page once from the bundle (`static/dist/` is gitignored), then delete `static/dist/`. Stop the server.
- [ ] **Step 5: README and commit.** Add the Mergers page and `carrier_member_by_year` to README.md's page and query lists. `git add templates/mergers.html static/charts/mergers.js plugins/t100_globe.py tests scripts/smoke_check.sh README.md docs/superpowers/plans && git commit -m "Add the Mergers page: airlines that merged, in shades of the survivor"`.
