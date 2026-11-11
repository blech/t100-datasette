# Site Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the per-page "find" boxes, let the airport map's picker take any airport, and add a header search icon that jumps to any airport, airline or aircraft (by code, name or city).

**Architecture:** A new derived table `search_index` (one row per jumpable thing, with a lowercase `terms` string and a `rank`) is built in `rebuild_derived_tables`. A canned query `search` matches up to three word-prefix tokens against `terms`, scores code/prefix matches first, and returns at most 6 rows per kind. A small ES-module panel (`static/search/`), opened from a magnifier link right of "About", queries it as you type.

**Tech Stack:** Python/SQLite/Datasette canned queries, Jinja templates, plain ES modules (`node --test`), pytest.

**Spec:** none written; this plan implements the design agreed in conversation on 2026-11-11 (summarised in Global Constraints).

## Global Constraints

- `schema.sql` is generated from `build_database.py`; change the Python, regenerate the SQL, never hand-edit it.
- New tables must exist on the Fly volume before a code deploy (note this in the final summary; do not push to `main`).
- Do not touch `templates/changelog.html`; say in the summary that this deserves an entry.
- Port 8808 is the user's server: never stop it. Check changes on another port (`uv run datasette --port 8818 .`) and stop that instance when done.
- Templates load scripts with `{{ script_url('search/main.js') }}` and `modulepreload(...)`, never a literal `/static/...` path.
- Numbers shown to users go through `static/common/numbers.js`; years are not numbers there, so plain `1990–2025` text in hints is fine.
- Keep README.md in step: the new table, the canned query, and the removed find boxes.
- Colours/formatting conventions: check `docs/site-coherence.md` before styling the panel; use the existing CSS variables (`--fg`, `--muted`, `--panel`, `--line`, `--accent`).
- Search behaviour (agreed): matches airports by IATA code, ICAO code, city, name, country; airlines by name, parent group and carrier code; aircraft by BTS name (`Airbus A340-600`), short name (`B737-8`) and family. There are no IATA/ICAO type designators (`B738`) in the data and none are added. Codes rank above names. Results grouped Airports / Airlines / Aircraft, keyboard navigable, Return opens the first/selected result.
- Icon is an inline SVG, not an emoji or icon font.

## Review Focus

- Query containing LIKE wildcards or quotes (`%`, `_`, `'`, `"`): must match literally or nothing, never everything or a 500.
- Empty or whitespace-only query: panel shows no results and no request is made.
- Single-letter query (`a`): returns quickly and capped (6 per kind), not thousands of rows.
- Airport with no BTS name or no OpenFlights row (only a code): still findable by code.
- A merged airline group and its member airlines: both appear and open different pages; an aircraft named the same as its family appears once, as the family.
- Slow responses arriving out of order: the panel shows the latest query's results, not a stale one.
- `/` opens the panel only when focus is not already in an input, select or textarea.
- Public (`serve_public.sh`) mode: the `search` canned query is still allowed.

---

### Task 1: Remove the per-page find boxes; put airport find on `/airports`

**Files:**
- Modify: `templates/airline.html`, `airline_aircraft.html`, `airline_changes.html`, `airline_globe.html`, `airline_routes.html`, `aircraft.html`, `aircraft_makers.html`, `family.html`, `airport.html`, `airport_changes.html`, `routes.html`, `route.html`, `route_table.html`, `rollup.html` (delete each `{% set find = ... %}{% include "_find.html" %}` line)
- Modify: `templates/airports.html` (add the airport find box under the intro)
- Modify: `templates/_find.html` header comment (now used only by `/airports`)
- Test: `tests/test_find_boxes.py`

**Interfaces:**
- Produces: `/airports` renders exactly one `<input id="find" data-find="airport">`; no other page does.

- [ ] **Step 1: Rewrite the tests.** In `tests/test_find_boxes.py` replace `FIND` with `{"airport": ["/airports"]}` and move every path previously in `FIND` (airline, aircraft and the airport ones) into `NO_FIND`, plus `/airlines/delta/globe` and `/aircraft/over-time`. Keep `test_the_tables_filter_their_rows_and_say_so` and the two list-query tests. Update the comment at the top of the file to say only `/airports` carries a find box and the rest rely on the header search. Add `test_airports_index_find_box_offers_foreign_airports`: seed `put_airport_years` with an `LHR` row, then assert `get_json(ds, "/t100/airport_list.json?_shape=objects")` includes `LHR` (already true; this pins it).
- [ ] **Step 2: Run** `uv run pytest tests/test_find_boxes.py tests/test_airports_matrix.py -q`. Expected: FAIL (boxes still present; `/airports` lacks one).
- [ ] **Step 3: Delete the include lines** from the 14 templates listed above. In `airports.html` add `{% set find = "airport" %}{% include "_find.html" %}` after the intro paragraph. `tests/test_airports_matrix.py:46` asserts `data-find="airport"` on some page: read it and fix the path if it no longer holds.
- [ ] **Step 4: Run** `uv run pytest -q`. Expected: PASS. Also `grep -rn "include \"_find.html\"" templates` shows only `airports.html`.
- [ ] **Step 5: Commit** `git add templates tests && git commit -m "Remove per-page find boxes; airport find lives on /airports"`.

### Task 2: Airport map picker lists every airport

**Files:**
- Modify: `static/globe/main.js:210-225` (`fillPicker`)
- Test: `static/globe/test/` (find the existing picker/options test, else add `picker.test.js`)

**Interfaces:**
- Produces: `pickerOptions(airports: Iterable<{code, place, name}>): {value, label}[]` exported from `static/globe/src/` (new small module `picker.js`), used by `fillPicker`.

- [ ] **Step 1: Write the failing test** `pickerOptions includes airports outside the US`: input `[{code:'SFO',place:'San Francisco, CA',name:'San Francisco International',isUs:true},{code:'KEF',place:'Reykjavik, Iceland',name:'Keflavik International',isUs:false}]`; assert both codes come back, with label `"Reykjavik, Iceland – Keflavik International"` for KEF.
- [ ] **Step 2: Run** `node --test static/globe/test/` Expected: FAIL (module missing).
- [ ] **Step 3: Implement `pickerOptions`** in `static/globe/src/picker.js` (no `isUs` filter) and call it from `fillPicker`. Confirm `airports` in `main.js` actually holds foreign airports (adapter reads `is_us`, so it should); if a foreign airport lacks coordinates and is missing, note it in the summary rather than fixing the data.
- [ ] **Step 4: Run** `npm test`. Then start `uv run datasette --port 8818 .`, open `/airports/globe`, type `KEF` and pick it from the list (no Return needed): it must open `/airports/KEF/globe`. Stop the instance.
- [ ] **Step 5: Commit** `"Airport map picker offers non-US airports"`.

### Task 3: `search_index` table

**Files:**
- Modify: `build_database.py` (DDL in `_LOOKUP_TABLES`, `rebuild_search_index`, add to `rebuild_derived_tables`, regenerate `schema.sql` the way the project does)
- Test: `tests/test_search_index.py`

**Interfaces:**
- Produces table: `search_index(kind TEXT, href TEXT, label TEXT, hint TEXT, terms TEXT, code TEXT, rank INTEGER, PRIMARY KEY (kind, href)) WITHOUT ROWID`. `kind` is `airport|airline|aircraft`; `code` is the exact-match code (IATA for airports, carrier code for airlines, the `short_name` such as `B737-8` for aircraft; empty if none); `terms` is lowercase, space-separated, each word searchable by prefix; `rank` is all-years departures (airports: departures + arrivals).
- Produces: `rebuild_search_index(conn) -> int` (row count), registered in `rebuild_derived_tables` as `"search_index"` *after* `carrier_group_year`, `type_year`, `airport_dir_year`.
- Hrefs: airport `/airports/{code}`; airline `/airlines/{id}` (same ids as `airline_list`: group id, or member `airline_id` for merged groups); aircraft family `/aircraft/{slugify(family)}`, aircraft `/aircraft/{slugify(family)}/{slugify(name)}` (same naming as the `airport_list`, `airline_list`, `aircraft_list` canned queries in `datasette.yml`; reuse their SQL logic, and a Python `slugify` identical to `static/charts/src/rollup.js:97`).
- Labels/hints reproduce today's find boxes: airport label = code, hint = `"{place} – {name} · {first}–{last}"`; airline label = name, hint = parent group or years; aircraft family hint `"Family · {first}–{last}"`, aircraft hint `"{family} · {first}–{last}"`.

- [ ] **Step 1: Write failing tests** in `tests/test_search_index.py`, using `tests/helpers.py` fixtures (`put_airport_years`, `add_airports`, `put` from `tests/test_rollup_queries.py`, `aircraft_fixtures`, `delta`):
  - `test_a_foreign_airport_is_indexed_by_code_city_and_country`: LHR row in `airport_dir_year`, `airport_names` "London, United Kingdom"; assert a row `("airport", "/airports/LHR")` whose `terms` contains `lhr`, `london`, `kingdom` and `code == "LHR"`.
  - `test_an_airport_with_only_a_code_is_still_indexed`: no name rows; row exists with `terms` containing the code.
  - `test_icao_code_and_openflights_name_are_searchable`: openflights row for SFO with icao `KSFO`; terms contain `ksfo`.
  - `test_airlines_and_their_merged_members_both_appear`: after `delta(db_path)`, rows for the group id and a member id, with different hrefs.
  - `test_aircraft_family_and_types_are_indexed_once_each`: after `aircraft_fixtures`, `/aircraft/boeing-737` and `/aircraft/boeing-737/boeing-737-800` exist; a type named exactly as its family yields one row.
  - `test_aircraft_short_name_is_searchable`: terms for the 737-800 contain `b737-8`.
  - `test_rebuild_is_repeatable`: calling twice gives the same count.
- [ ] **Step 2: Run** `uv run pytest tests/test_search_index.py -q`. Expected: FAIL (no function).
- [ ] **Step 3: Implement** the DDL and `rebuild_search_index(conn) -> int` (delete then insert in one transaction; register `slugify` with `conn.create_function`; aircraft `terms` = name, short_name, family, maker). Add it to `rebuild_derived_tables`. Regenerate `schema.sql` using whatever command the repo already uses (check `git log -- schema.sql` / `build_database.py` for the generator; do not hand-edit).
- [ ] **Step 4: Run** `uv run pytest -q` (including `tests/test_schema_check.py`). Expected: PASS.
- [ ] **Step 5: Build the real table once** against a copy, not the 2.9GB db directly in tests: run `uv run python -c "import sqlite3,build_database as b; c=sqlite3.connect('t100.db'); print(b.rebuild_search_index(c))"` and spot-check with `sqlite3 -readonly t100.db "select kind,count(*) from search_index group by 1"`. Expected: thousands of airports, roughly the airline and aircraft counts of the `*_list` queries.
- [ ] **Step 6: Commit** `"Add search_index table"`.

### Task 4: The `search` canned query

**Files:**
- Modify: `datasette.yml` (canned query `search`, next to `airport_list`), `plugins/t100_guard.py` only if it keeps an allowlist of queries (check it)
- Test: `tests/test_search_query.py`

**Interfaces:**
- Consumes: `search_index` from Task 3.
- Produces: `GET /t100/search.json?_shape=objects&t1=…&t2=…&t3=…` returning rows `{kind, href, label, hint}`, max 6 per kind, ordered kind (airport, airline, aircraft) then best match first. Tokens are lowercase, empty string = ignored; every non-empty token must prefix-match some word of `terms`. Score: exact `code` match = 0, `label` word-prefix match on the first token = 1, other matches = 2; ties by `rank` descending. LIKE wildcards in tokens are escaped (`ESCAPE '\'`), done in SQL with `replace()` so JS stays simple.

- [ ] **Step 1: Write failing tests** (seed via the Task 3 fixtures and `rebuild_search_index`):
  - `kef` → the KEF airport is first in airports.
  - `reykjavik` → KEF found by city; `iceland` → found by country.
  - `airbus a340-600` (t1=`airbus`, t2=`a340-600`) → the A340-600 aircraft.
  - `b737-8` (the short name) → the 737-800 first.
  - `%` and `_` and `'` as t1 → returns zero rows (not all rows) and status 200.
  - all tokens empty → zero rows.
  - `a` with 30 matching airports seeded → at most 6 airports.
  - exact code outranks a busier airport whose name merely starts with the same letters.
- [ ] **Step 2: Run** `uv run pytest tests/test_search_query.py -q`. Expected: FAIL (404).
- [ ] **Step 3: Implement** the query: match against `' ' || terms` using `LIKE '% ' || escaped_token || '%' ESCAPE '\'`, score as above, `ROW_NUMBER() OVER (PARTITION BY kind ORDER BY score, rank DESC) <= 6`. Give it a `title` and `description` like its neighbours.
- [ ] **Step 4: Run** `uv run pytest -q`. Also confirm the query works in public mode (`tests/test_public_mode.py` pattern): add one assertion there if it lists allowed queries.
- [ ] **Step 5: Commit** `"Add search canned query"`.

### Task 5: The header search icon and panel

**Files:**
- Modify: `templates/_nav.html` (icon after About), `templates/t100_base.html` (load script + modulepreload), `static/nav/style.css` (icon) 
- Create: `static/search/src/search.js` (pure logic), `static/search/main.js` (panel), `static/search/style.css`, `static/search/test/search.test.js`
- Test: `static/search/test/search.test.js`, `tests/test_nav.py` (icon present in header), `tests/test_page_frame.py` if it pins the nav markup

**Interfaces:**
- Produces (`static/search/src/search.js`):
  - `tokens(text: string): [string, string, string]`: lowercase, trimmed, split on whitespace, first three tokens, padded with `''`.
  - `searchUrl(text: string): string | null`: `/t100/search.json?_shape=objects&t1=…&t2=…&t3=…` (via `queryUrl` from `static/globe/src/api.js` if it fits), `null` when all tokens are empty.
  - `groupResults(rows): {kind, title, items}[]`: titles `Airports`, `Airlines`, `Aircraft`, empty groups dropped, order preserved.
  - `moveSelection(index: number, count: number, key: 'ArrowDown'|'ArrowUp'): number`: wraps.
- Header markup: `<li><a href="#search" id="search-open" aria-label="Search" aria-haspopup="dialog">` with inline SVG magnifier, after the About `<li>`, and not marked `aria-current` ever. Panel is a `<dialog id="search-dialog">` built by `main.js`.

- [ ] **Step 1: Write failing node tests** for `tokens` (`"  Airbus A340-600 "` → `['airbus','a340-600','']`; `""` → three empty), `searchUrl` (null for blank; contains `t1=kef`; encodes `%` and `'`), `groupResults` (drops empties, keeps kind order), `moveSelection` (wraps both ways, count 0 → 0).
- [ ] **Step 2: Run** `node --test static/search/test/` Expected: FAIL.
- [ ] **Step 3: Implement `search.js`**, then `main.js`: open on icon click or `/` (ignored when `document.activeElement` is an input, select, textarea or contenteditable); input debounced ~120ms; request with an incrementing id and drop any response that isn't the latest (stale-response guard); render groups with each result's label and muted hint as links; arrows move the selection, Return follows the selected link (the first when none is selected), Esc closes and returns focus to the icon; "No matches" text when empty after a real query; on fetch failure show "Search unavailable". Links go through the same `carry` decoration as other links (open `static/nav/main.js` and follow how it decorates: results must keep the visitor's theme in the URL). The panel loads lazily: `main.js` only fetches when first opened.
- [ ] **Step 4: Template and CSS.** Add the icon `<li>` in `_nav.html`, the script tag and `modulepreload` in `t100_base.html` (see how `nav/main.js` is loaded at lines 15-16), and styles using the existing variables; icon matches the `.sections a` colours and is at least 24px tall for touch. On phones it stays on the sections line.
- [ ] **Step 5: Python tests.** In `tests/test_nav.py` assert the header on `/`, `/airports/SFO` and `/about` contains `id="search-open"` and that it sits after the About link. Run `uv run pytest -q` and `npm test`. Expected: PASS. If `tests/test_assets.py` lists bundle entries, add `search/main.js` to its expectation; run `npm run bundle` once to check it builds, then delete `static/dist/`.
- [ ] **Step 6: Try it in a browser** on port 8818 (not 8808): from `/airports/SFO` open search, type `kef` and open Keflavik; type `reykjavik`; type `airbus a340-600`; type `b738`; press `/` outside and inside a text field; Esc closes. Report what you saw, including anything that didn't work. Stop the instance.
- [ ] **Step 7: README.** Update `README.md`: the `search_index` table in the database list, the `search` canned query, and that find boxes now only appear on `/airports`, with search in the header. Commit `"Header search for airports, airlines and aircraft"`.

---

## Self-review notes

- Coverage: items 1, 2, 4 → Task 1; item 3 → Task 2; search icon, new table → Tasks 3-5. README/changelog constraints → Global Constraints and Task 5 step 7.
- Calls I made that the user should check: `/over-time`, `/makers` and the other non-subject pages lose the find box too; `/airports` gains one (it had none); non-US airports were already offered by the find box, so only the map picker needed fixing; aircraft are not searchable by `B738`-style designators because the data lacks them (only `B737-8` short names and full names work); the panel is a `<dialog>` opened from a link, not a separate `/search` page.
