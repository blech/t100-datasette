# Data links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every page (but the front and about pages) links, in one place, to the canned query whose numbers it draws, with its current settings; five queries take an optional airline `group` to narrow by.

**Architecture:**
- `datasette.yml` gains the optional `group` parameters, and a `title` and `description` for each linked query.
- `static/common/datalink.js` builds and sets the link. The footer and the two map templates hold a hidden `#data-link`, which each page script fills and keeps in step.
- The about page explains it, and the roadmap records the rule.

**Tech Stack:** Datasette 1.0a41 canned queries (YAML), Jinja templates, plain ES modules, pytest, `node --test`, headless Playwright.

**Spec:** `docs/superpowers/specs/2026-10-22-data-links-design.md`

## Global Constraints

- **Link text:** "This page's data" on scrolling pages and "This map's data" on maps.
- **Footer order:** "Theme [ ] · Data: the US Department of Transportation's T-100 segment tables · This page's data · About the data".
- **Link target:** `/t100/{query}?{every parameter, empty when unused, in the order given}&_hide_sql=1`.
- **No link** on the front page or the about page: the link stays hidden there.
- **Optional `group`:** written `(:group = '' OR <group column> = :group)`. With an empty `group`, results are unchanged.
- **Inventory:** the spec's table is binding for which query and parameters each page uses.
- **A route or family page with `highlight=airline:{group}`** puts that group in the link's `group`.
- Stage files by name (`templates/` holds the user's untracked `query-t100-*.html`). Commits end with the session's two attribution lines.

## Review Focus

1. **Settings that change after load** (a year menu, a map's year slider, a changes page's two years): the link must follow, not keep the first value. *(Task 4 browser check covers `/airlines` year, airport Changes years and the airport map's year.)*
2. **A data page that is too big or too slow:**
   - `routes_by_year` for ATL returns about 10,000 rows into an HTML table, and `carrier_route_by_year` for American returns 29,534. Datasette pages canned query results at `default_page_size` (100), so these should open quickly.
   - Check that the linked page is a 200 within `sql_time_limit_ms`. *(Task 4 browser check times each link.)*
3. **A highlight id that isn't a group** (`highlight=airline:nope`): the link carries `group=nope` and the data page shows no rows, not an error. *(Task 1 test: an unknown group gives 0 rows with status 200.)*
4. **The about page and the front page:** no link, and no stray separator ("· ·") in their footers. *(Task 3 test.)*
5. **Maps:** the link sits in the controls row without breaking it at phone width. *(Task 4 browser check at 390px: the controls row has no horizontal overflow.)*

---

### Task 1: Queries — optional group, titles and descriptions

**Files:**
- Modify: `datasette.yml`
- Test: `tests/test_data_links.py` (create)

**Interfaces:**
- Produces: `route`, `route_year`, `family_detail`, `airport_size` and `airport_changes` each accept `:group`. The group columns are:
  - `g.group_id` in `route` and `route_year`;
  - `group_id` in `family_detail`;
  - `COALESCE(g.group_id, 'unknown')` in the airport queries.
- Produces: every query named in the spec's inventory (17 names) has `title:` and `description:`.

- [ ] **Step 1: Write the failing tests** in `tests/test_data_links.py`.
  - Seed United (entity U1 → 19977 → `united`) and Delta (D1 → 19790 → `delta`) on SFO–JFK in 2019, using `tests.test_airport_queries`' style: `add_carriers`, `put` for `carrier_group`, and `flight`.
  - Seed `family_detail_year` rows with `put`.

```python
INVENTORY = ["top_airports", "top_us_airports", "airport_size", "routes_by_year", "airport_changes", "route", "route_year", "type_table",
             "maker_by_year", "engines_by_year", "family_detail", "airline_table", "carrier_group_by_year", "carrier_group_detail",
             "carrier_route_by_year", "carrier_route_changes", "carrier_routes_year"]

@pytest.mark.parametrize("path, key", [
    ("/t100/route.json?origin=SFO&dest=JFK", "carrier"),
    ("/t100/route_year.json?origin=SFO&dest=JFK&year=2019", "carrier"),
    ("/t100/airport_size.json?origin=SFO", "group_id"),
    ("/t100/airport_changes.json?origin=SFO&a=2019&b=2019", "group_id"),
    ("/t100/family_detail.json?family=Boeing+737", "group_id"),
])
def test_an_empty_group_means_every_airline_and_a_group_narrows(ds, db_path, path, key):
    # rows(path + "&group=") has both airlines; rows(path + "&group=united") only United's; rows(path + "&group=nope") == [] (status 200)

def test_each_linked_query_has_a_title_and_description():
    config = yaml.safe_load(open("datasette.yml"))["databases"]["t100"]["queries"]
    for name in INVENTORY: assert config[name].get("title") and config[name].get("description"), name

def test_a_data_page_is_titled_by_its_query_not_its_sql(ds):
    html = get(ds, "/t100/route?origin=SFO&dest=JFK&group=&_hide_sql=1").text
    assert "<title>t100: WITH" not in html and "Every carrier and aircraft" in html   # the start of route's title
```

- [ ] **Step 2: Run them to watch them fail**

Run: `uv run pytest tests/test_data_links.py -q`
Expected: FAIL. `group=united` returns both airlines (Datasette ignores an unknown parameter), and titles are missing.

- [ ] **Step 3: Add the `group` clauses, titles and descriptions to `datasette.yml`**
  - **Titles** name the rows, e.g.:
    - `route`: "Every carrier and aircraft on a route, by year";
    - `airport_size`: "Departures from an airport, by year, airline group, service and kind".
  - **Descriptions** are one sentence. They say "departures from the origin" where the query is directional. Queries that take `group` add "Leave group empty for every airline."
  - **`route`** groups by carrier name, with `MIN(g.group_id)`. Add the clause to its `WHERE`; segments with no group are dropped only when `group` is set.

- [ ] **Step 4: Run the tests to see them pass, and the whole suite**

Run: `uv run pytest -q 2>&1 | tail -1`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add datasette.yml tests/test_data_links.py
git commit -m "Queries: route, route_year, family_detail and an airport's two take an optional airline group; each linked query has a title and description"
```

### Task 2: The link builder

**Files:**
- Create: `static/common/datalink.js`
- Test: `static/common/test/datalink.test.js`

**Interfaces:**
- Produces: `dataHref(query: string, params: Array<[string, string|number|null]> | object) → string`. Nulls and undefined become empty strings. Order is as given, then `_hide_sql=1`.
- Produces: `setDataLink(query, params) → void`. It sets `#data-link`'s `href` and unhides `#data-link.closest('.data-link')`. On a page without `#data-link`, it does nothing.

- [ ] **Step 1: Write the failing tests**

```js
test('dataHref keeps every parameter, empty or not, in order', () => {
  assert.equal(dataHref('route', { origin: 'SFO', dest: 'JFK', group: '' }), '/t100/route?origin=SFO&dest=JFK&group=&_hide_sql=1');
  assert.equal(dataHref('route_year', { origin: 'SFO', dest: 'JFK', year: 2019, group: null }), '/t100/route_year?origin=SFO&dest=JFK&year=2019&group=&_hide_sql=1');
});
test('dataHref with no parameters', () => assert.equal(dataHref('maker_by_year', {}), '/t100/maker_by_year?_hide_sql=1'));
test('dataHref encodes values', () => assert.equal(dataHref('family_detail', { family: 'Boeing 737 & co' }), '/t100/family_detail?family=Boeing+737+%26+co&_hide_sql=1'));
```

- [ ] **Step 2: Run them to watch them fail**

Run: `node --test static/common/test/datalink.test.js`
Expected: FAIL. The module isn't found.

- [ ] **Step 3: Implement** both functions in `static/common/datalink.js`, using `URLSearchParams`.

- [ ] **Step 4: Run them to see them pass**

Run: `npm test 2>&1 | grep -E '^ℹ (pass|fail)'`
Expected: 0 failures.

- [ ] **Step 5: Commit**

```bash
git add static/common/datalink.js static/common/test/datalink.test.js
git commit -m "A page's data link: the canned query with every parameter, built and set in one place"
```

### Task 3: Templates and the about page

**Files:**
- Modify:
  - `templates/_footer.html`;
  - `templates/globe.html` and `templates/airline_globe.html` (after `#theme`);
  - `templates/route.html` and `templates/route_table.html` (remove "Raw data table" and `#raw-link`);
  - `templates/about.html` (a paragraph under `#source`).
- Test: `tests/test_data_links.py`

**Interfaces:**
- Produces:
  - footer markup `<span class="data-link" hidden><a id="data-link" href="">This page's data</a> · </span>`, between the credit's " · " and "About the data";
  - map markup `<a id="data-link" class="data-link" href="" hidden>This map's data</a>`.

- [ ] **Step 1: Write the failing tests** (append to `tests/test_data_links.py`)

```python
SCROLLING = ["/airports", "/airports/SFO", "/airports/SFO/destinations", "/airports/SFO/changes", "/airports/SFO/JFK", "/airports/SFO/JFK/2019/table",
             "/aircraft", "/aircraft/makers", "/aircraft/engines", "/aircraft/boeing-737", "/airlines", "/airlines/over-time"]
def test_every_scrolling_page_has_the_data_link_in_its_footer(ds)   # regex: footer contains id="data-link" ... This page's data, before About the data
def test_the_maps_have_the_data_link_in_their_controls(ds)          # /airports/globe and /airports/SFO/globe: "This map's data" after id="theme"
def test_the_route_notes_no_longer_carry_a_raw_data_link(ds)        # "Raw data table" and id="raw-link" not in /airports/SFO/JFK nor its /table
def test_the_about_page_explains_the_data_links(ds)                 # the #source section mentions "This page's data" and "group"
def test_the_front_and_about_pages_have_no_stray_separator(ds)      # footer text, tags stripped and whitespace collapsed, has no "· ·"
```

(Airline pages need a seeded group to render, as in `tests/test_views_pages.py`'s `delta()`. Add `/airlines/delta`, `/routes` and `/changes` with that seed.)

- [ ] **Step 2: Run them to watch them fail**

Run: `uv run pytest tests/test_data_links.py -q`
Expected: the new tests FAIL.

- [ ] **Step 3: Implement the markup** above, and update `routepage.js` so it no longer sets `#raw-link`. The about paragraph covers three things:
  - every page links to its data;
  - the fields at the top can be changed, including `group` (an airline group's id, as in its page's address);
  - the `t100` table can be browsed and filtered by column, with BTS's own codes.

- [ ] **Step 4: Run the suite to see it pass**

Run: `uv run pytest -q 2>&1 | tail -1 && npm test 2>&1 | grep -E '^ℹ (pass|fail)'`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add templates/_footer.html templates/globe.html templates/airline_globe.html templates/route.html templates/route_table.html templates/about.html static/charts/routepage.js tests/test_data_links.py
git commit -m "A place for every page's data link: the footer, or a map's controls; the route pages' raw data link moves there; the about page explains it"
```

### Task 4: Page scripts, browser check and roadmap

**Files:**
- Modify:
  - `static/landing/main.js` and `static/globe/main.js`;
  - `static/charts/` scripts: `airport.js`, `routes.js`, `routepage.js`, `aircrafttable.js`, `makers.js`, `engines.js`, `family.js`, `airlinetable.js`, `rollup.js`, `airline.js` and `airlineglobe.js`;
  - `docs/site-coherence.md`.
- Test: `<scratchpad>/data_links_check.py`

**Interfaces:**
- Consumes: `setDataLink` (Task 2); `parseHighlight` from `/static/common/highlight.js` for the route and family pages' `group`; the queries (Task 1); the markup (Task 3).

- [ ] **Step 1: Write the browser check** `data_links_check.py` against `http://localhost:8811`, printing `FAILURES: n`.
  - **Every page in the spec's inventory** is checked with a seeded-real example: SFO, SFO–JFK, 2019, `boeing-737`, `delta`.
    - `#data-link` is visible.
    - Its path is `/t100/{the inventory's query}`, and its parameters match the inventory.
    - Fetching its href gives 200 within 5 seconds, and the page's `<title>` doesn't start with "t100: WITH" or "t100: SELECT".
  - **Changing a setting updates the link:**
    - `#airline-year` on `/airlines`;
    - `#ap-a` on `/airports/SFO/changes`;
    - the year on `/airports/SFO/globe` (via `?year=2010` on load, then the slider).
  - **A highlight narrows:** `/airports/SFO/JFK?split=carrier&highlight=airline:united` links with `group=united`. That page's JSON (`.json?…&_shape=objects`) has only United rows. With `highlight=airline:nope`, the link's page is 200 with 0 rows.
  - **No link** on `/` or `/about`.
  - **Phone width:** at 390px, `/airports/SFO/globe`'s controls row doesn't overflow sideways.
  - **Errors:** there are no page errors.

- [ ] **Step 2: Run it to watch it fail**

Run: `uv run --no-project --with playwright python <scratchpad>/data_links_check.py` (restart the scratch server first, for Task 1's queries)
Expected: FAILURES above 0, because no script sets the link yet.

- [ ] **Step 3: Call `setDataLink`** in each script where it fetches, and again wherever it writes its state:
  - after `replaceState`;
  - after changing a year, or the two compared years;
  - on the map, in `refresh()`, or `load()` for the airline map.

  Use the spec inventory's parameters.

- [ ] **Step 4: Run the check and the suites to see them pass**

Run: the check, then `uv run pytest -q 2>&1 | tail -1 && npm test 2>&1 | grep -E '^ℹ (pass|fail)'`
Expected: `FAILURES: 0`, with all tests passing.

- [ ] **Step 5: Update `docs/site-coherence.md`**
  - Under bucket 4's questions, answer "Narrowing down, or back to the top?" with the rule: **Pages cross, with highlights; data links narrow.** Add the spec's path.
  - Add "Carrying the year" as still to come: from the airlines and aircraft tables, and from an airport's Changes rows.

- [ ] **Step 6: Commit**

```bash
git add static/landing/main.js static/globe/main.js static/charts/airport.js static/charts/routes.js static/charts/routepage.js static/charts/aircrafttable.js static/charts/makers.js static/charts/engines.js static/charts/family.js static/charts/airlinetable.js static/charts/rollup.js static/charts/airline.js static/charts/airlineglobe.js docs/site-coherence.md
git commit -m "Every page links to the data behind it, with its settings; a highlighted airline narrows the route's and the family's data to that airline"
```
