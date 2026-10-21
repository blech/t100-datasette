# Views Part 1 (One Kind of View per Page) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- Merge `feature/airplane-table-tidy`, so the aircraft table is `/aircraft`, with a redirect from `/aircraft/table`.
- Split a route's table onto `/airports/{a}/{b}[/{year}]/table`.
- Split an airline's "What changed" onto `/airlines/{airline}/changes`.
- Each subject's views line moves between its pages.

**Architecture:**
- Server routes and handlers in `plugins/t100_globe.py`.
- `views_for` gains the new views.
- Each template splits in two.
- The page scripts run only the parts whose elements are on the page, so one script serves both of a subject's pages.

**Tech Stack:** Datasette plugin (Python, Jinja), plain ES modules, pytest, `node --test`, headless Playwright.

**Spec:** `docs/superpowers/specs/2026-10-22-views-pages-design.md`

## Global Constraints

- **Rule:** one kind of view per page. Labels: "Over time", "Table", "Changes", "Map", "Families". The views line carries the query string between views.
- **Merge policy, as for the aircraft release:** keep `main`'s structure (base stylesheet, views line, footer, no `<p class="related">` links, palette, shared popover and highlight, shared number formatter) and the branch's wording and features.
- **Branch:** `views-pages`, off `main`. Never push. Stage files by name; `templates/` holds untracked files that aren't ours.
- **Commits** end with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_0191mnN3iPgFXTdJ7jQemcY1
  ```

## Review Focus

1. **Query strings through the views line:** `?measure=&split=&span=` must reach the route's Table and back, and `?from=&to=&min=` the airline's Changes. The views line's links are server-rendered without the query, and `static/nav/main.js` only carries theme and service. (Task 2, Step 4 adds a small script; tested in Task 4.)
2. **A route year whose table is empty** (no flights that year) shows the "No flights" status, not an empty table. (Task 2 test.)
3. **An airline with merged members:** the Changes table's extra Airline column still appears (`{% if members %}`). (Task 3 test with a merged group.)
4. **`/airlines/delta#changes` with a query** (`?from=2019&to=2025#changes`) forwards to `/airlines/delta/changes?from=2019&to=2025`. (Task 4.)
5. **The aircraft merge:** the conflicted pages render with the views line and footer and without related lines. `makers.js` uses the palette. (Task 1.)

---

### Task 1: Merge `feature/airplane-table-tidy`

**Files:** the seven conflicted files:
- `static/charts/aircrafttable.js`
- `static/charts/makers.js`
- `templates/aircraft_makers.html`
- `templates/aircraft_table.html`
- `templates/engines.html`
- `templates/family.html`
- `templates/rollup.html`

Plus `plugins/t100_globe.py`, `tests/test_navigation.py` and `tests/test_rollup_pages.py`, as the merge requires.

- [ ] **Step 1: Branch and merge**

```bash
git checkout -b views-pages main
git fetch github
git merge --no-ff --no-commit github/feature/airplane-table-tidy
git diff --name-only --diff-filter=U
```

Expected: the seven files above.

- [ ] **Step 2: Resolve, by the merge policy**

- **Templates:**
  - keep `base.css`, drop every `<p class="related">` line, keep `{% include "_footer.html" %}`;
  - take the branch's titles, headings, intros, notes and the new `at-limit` control;
  - `aircraft_table.html` takes the branch's "Aircraft" title, h1 and intro.
- **`makers.js`:** take `main`'s version (palette, popover, highlight, `formatCount`, millions axis, theme redraw), plus the branch's import change: `kindOptions` in place of `KIND_OPTIONS`, and wherever it's used.
- **`aircrafttable.js`:** take the branch's features ("all years", the limit). Use `main`'s `formatCount`/`countLabel` in place of any `toLocaleString`, and keep `main`'s imports.

Then:

```bash
grep -rn "<<<<<<<\|>>>>>>>" static templates plugins tests
```

Expected: no output.

- [ ] **Step 3: Aircraft views and the redirect, test first**

In `tests/test_navigation.py`, replace the aircraft test and table entries with:

```python
    AIRCRAFT = [("Families", "/aircraft"), ("Makers", "/aircraft/makers"), ("Long-haul engines", "/aircraft/engines")]
    for i, (_, path) in enumerate(AIRCRAFT):
        assert views(path) == [(label, href, j == i) for j, (label, href) in enumerate(AIRCRAFT)], path
```

In `PAGES`:
- `/aircraft`, `/aircraft/engines` and `/aircraft/makers` map to `["Families", "Makers", "Long-haul engines"]`;
- remove `/aircraft/table`.

In `tests/test_rollup_pages.py`, add:

```python
def test_the_old_aircraft_table_address_redirects(ds):
    r = get(ds, "/aircraft/table?year=2019", follow_redirects=False)
    assert r.status_code == 301 and r.headers["location"] == "/aircraft?year=2019"
```

Check `tests/helpers.get`'s signature; if it doesn't take `follow_redirects`, use the same approach as `tests/test_redirects.py`.

Run: `uv run pytest -q tests/test_navigation.py tests/test_rollup_pages.py`
Expected: FAIL.

In `plugins/t100_globe.py`:
- add the route `(r"^/aircraft/table$", moved("/aircraft")),` before `^/aircraft/(?P<slug>…)$`;
- change the aircraft case in `views_for` to the three views, with `rest in ([], ["makers"], ["engines"])` and labels Families, Makers and Long-haul engines.

Run: `uv run pytest -q` and `npm test 2>&1 | grep -E "^ℹ (pass|fail)"`
Expected: all pass, `fail 0`. Fix any test from the branch that asserts on related links by pointing it at the views line instead.

- [ ] **Step 4: A look, then commit the merge**

Restart the scratch server:

```bash
pkill -f "port 8811"; (nohup uv run datasette serve t100.db --config datasette.yml --plugins-dir plugins --template-dir templates --static static:static --port 8811 >/dev/null 2>&1 &)
```

In Playwright, `/aircraft` shows the table, the views line reads "Families · Makers · Long-haul engines", and the footer is there. `/aircraft/makers` draws its chart. There are no page errors.

Stage the files by name, then commit:

```bash
git commit -m "Merge feature/airplane-table-tidy: the aircraft table becomes /aircraft

Resolved by keeping main's structure and the branch's wording and features; /aircraft/table redirects to /aircraft,
and the aircraft views are Families · Makers · Long-haul engines.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0191mnN3iPgFXTdJ7jQemcY1"
```

---

### Task 2: A route's table on its own page

**Files:**
- Modify: `plugins/t100_globe.py`: a route, `route_table_page`, `views_for`
- Modify: `templates/route.html`; create `templates/route_table.html`
- Modify: `static/charts/routepage.js`
- Modify: `tests/test_navigation.py`; create `tests/test_views_pages.py`

**Interfaces:**
- Produces: template variables `origin`, `dest`, `year`, `min_year`, `max_year` and `crumbs` for both route templates. The table page's breadcrumb ends `…, (year or dest, href), ("table", None)`.

- [ ] **Step 1: Write the failing tests**

In `tests/test_navigation.py`, replace the route views test with:

```python
def test_a_route_has_over_time_and_table_views_keeping_the_year():
    assert views("/airports/SFO/LHR") == [("Over time", "/airports/SFO/LHR", True), ("Table", "/airports/SFO/LHR/table", False)]
    assert views("/airports/atl/lax/2024/table") == [("Over time", "/airports/ATL/LAX/2024", False), ("Table", "/airports/ATL/LAX/2024/table", True)]
```

In `PAGES`, `/airports/ATL/LAX` maps to `["Over time", "Table"]`, and add `"/airports/ATL/LAX/table": ("airports", ["Over time", "Table"])`.

Create `tests/test_views_pages.py`:

```python
import re

from tests.helpers import get


def test_a_routes_table_has_its_own_page(ds):
    chart = get(ds, "/airports/ATL/LAX").text
    table = get(ds, "/airports/ATL/LAX/table")
    assert table.status_code == 200
    assert 'id="route-table"' in table.text and 'id="route-chart"' not in table.text
    assert 'id="route-chart"' in chart and 'id="route-table"' not in chart
    assert re.search(r'<li aria-current="page">table</li>', table.text)


def test_a_years_table_keeps_the_year(ds):
    r = get(ds, "/airports/ATL/LAX/2024/table")
    assert r.status_code == 200 and 'data-year="2024"' in r.text


def test_the_route_sentence_offers_the_other_direction_in_the_same_view(ds):
    assert 'href="/airports/LAX/ATL/2024"' in get(ds, "/airports/ATL/LAX/2024").text
    assert 'href="/airports/LAX/ATL/2024/table"' in get(ds, "/airports/ATL/LAX/2024/table").text
```

Run: `uv run pytest -q tests/test_navigation.py tests/test_views_pages.py`
Expected: FAIL.

- [ ] **Step 2: Server**

In `register_routes()`, before the route's own pattern, add:

```python
        (rf"^/airports/(?P<origin>{CODE})/(?P<dest>{CODE})(?:/(?P<year>[0-9]{{4}}))?/table$", route_table_page),
```

Refactor `route_page` into one helper, `route_view(template, table)`, used by both handlers:

```python
def route_view(template, table):
    async def view(datasette, request):
        origin = request.url_vars["origin"].upper()
        dest = request.url_vars["dest"].upper()
        year = request.url_vars.get("year") or ""
        here = f"/airports/{origin}/{dest}{f'/{year}' if year else ''}"
        steps = [("airports", "/airports"), (origin, f"/airports/{origin}")]
        steps += [(dest, f"/airports/{origin}/{dest}"), (year, here if table else None)] if year else [(dest, here if table else None)]
        if table:
            steps.append(("table", None))
        html = await datasette.render_template(
            template,
            {"origin": origin, "dest": dest, "year": year, "min_year": year_range(datasette)[0], "max_year": year_range(datasette)[1],
             "view": "table" if table else "", "crumbs": trail(datasette, *steps)},
            request=request,
        )
        return Response.html(html)
    return view


route_page = route_view("route.html", table=False)
route_table_page = route_view("route_table.html", table=True)
```

In `views_for`, the route case becomes this. The `table` slot is optional, and the year stays:

```python
        case ["airports", a, b, *rest] if AIRPORT_CODE.match(a) and AIRPORT_CODE.match(b) and b.lower() != "globe" and (
                rest in ([], ["table"]) or (len(rest) in (1, 2) and rest[0].isdigit() and rest[1:] in ([], ["table"]))):
            a, b = a.upper(), b.upper()
            year = f"/{rest[0]}" if rest and rest[0].isdigit() else ""
            base = f"/airports/{a}/{b}{year}"
            return make(("Over time", base, None), ("Table", f"{base}/table", None), current=1 if rest and rest[-1] == "table" else 0)
```

- [ ] **Step 3: Templates**

Create `templates/route_table.html` by copying `route.html`, then:
- the `<title>` gains ` · table`;
- delete the `<section id="route-chart">…</section>` block;
- keep `#years`, the sentence, `<section id="route-table">` and `#status`.

In `route.html`:
- delete the `<section id="route-table">…</section>` block;
- move its note (freight units, raw data link) into the chart's `#chart-note` area as a `<p class="note">` under the chart.

In both templates, the sentence becomes:

```html
    <p class="note">Each direction is a route of its own; the other way is <a href="/airports/{{ dest }}/{{ origin }}{% if year %}/{{ year }}{% endif %}{% if view %}/{{ view }}{% endif %}" id="reverse-link">{{ dest }} → {{ origin }}</a>. More from {{ origin }}: <a href="/airports/{{ origin }}">routes over time</a> · <a href="/airports/{{ origin }}/globe" id="map-link">map</a>.</p>
```

- [ ] **Step 4: Script, and carrying the query**

In `static/charts/routepage.js` `main()`:
- after the data loads, set `const hasChart = Boolean($('route-chart'));` and `const hasTable = Boolean($('route-table'));`;
- show and draw only what exists:
  - `if (hasChart) { $('route-chart').hidden = false; drawChart(); }`;
  - `if (hasTable) { $('route-table').hidden = false; drawTable(); }`.
- **The controls on the table page:** the measure, split and span controls live in `#route-chart`. Add a split control to `route_table.html` as `<label>Split by <select id="chart-split" aria-label="Split by"></select></label>`, in a `.chart-controls` div above the table. Wire it so `fillSelect` and its listener run whenever the element exists. The measure and span stay chart-only: guard each with `if ($('chart-measure'))` and `if ($('chart-span'))`.
- **Carrying the query (`carryQuery()`):** after `pushState()`, and once on load, copy `location.search` onto the views line's links (`document.querySelectorAll('nav.views a')`) and onto `#reverse-link`. Keep each link's path, and set its search to the current one, minus `month` if any. Year pages read the year from the path, never from the query.
- `drawYears` links each year to `/airports/{o}/{d}/{y}${hasTable && !hasChart ? '/table' : ''}` plus `location.search`. Read how it builds its hrefs today, and add the view suffix there.

- [ ] **Step 5: Run the tests, then commit**

Run: `uv run pytest -q` and `npm test 2>&1 | grep -E "^ℹ (pass|fail)"`
Expected: all pass; `fail 0`.

Stage the files by name, then commit:

```bash
git commit -m "A route's table gets its own page: /airports/{a}/{b}[/{year}]/table, with Over time · Table in the views line

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0191mnN3iPgFXTdJ7jQemcY1"
```

---

### Task 3: An airline's changes on their own page

**Files:**
- Modify: `plugins/t100_globe.py`: a route, `airline_changes_page`, `views_for`
- Modify: `templates/airline.html`; create `templates/airline_changes.html`
- Modify: `templates/airline_globe.html`, `static/charts/airline.js`, `static/charts/airlineglobe.js`
- Modify: `tests/test_navigation.py`, `tests/test_views_pages.py`

- [ ] **Step 1: Write the failing tests**

In `tests/test_navigation.py`, replace the airline views tests:

```python
def test_an_airline_has_over_time_changes_and_map():
    A = [("Over time", "/airlines/delta"), ("Changes", "/airlines/delta/changes"), ("Map", "/airlines/delta/globe")]
    for i, (_, path) in enumerate(A):
        assert views(path) == [(label, href, j == i) for j, (label, href) in enumerate(A)], path
```

Also update `test_the_airline_pages_map_view_keeps_the_id_its_script_rewrites` to `[None, None, "map-link"]`, and the airline regexes in `test_an_airlines_page_and_map_have_overview_and_map_views`, from "Overview" to "Over time".

Append to `tests/test_views_pages.py`:

```python
from tests.test_rollup_pages import put


def delta(db_path):
    put(db_path, "carrier_group_year", [dict(year=2019, airline_id="19790", group_id="delta", group_name="Delta (incl. Northwest)", domestic=1,
                                             service_class="F", deps=4, seats=400, passengers=300, freight=0)])


def test_an_airlines_changes_have_their_own_page(ds, db_path):
    delta(db_path)
    over_time = get(ds, "/airlines/delta").text
    changes = get(ds, "/airlines/delta/changes")
    assert changes.status_code == 200
    assert 'id="change-table"' in changes.text and 'id="al-a"' in changes.text and 'id="size-chart"' not in changes.text
    assert 'id="size-chart"' in over_time and 'id="change-table"' not in over_time and 'id="al-a"' not in over_time
    assert re.search(r'<li aria-current="page">changes</li>', changes.text)


def test_an_unknown_airlines_changes_are_not_found(ds):
    assert get(ds, "/airlines/nope/changes").status_code == 404


def test_the_airline_maps_table_link_points_at_changes(ds, db_path):
    delta(db_path)
    assert 'href="/airlines/delta/changes"' in get(ds, "/airlines/delta/globe").text
```

Run: `uv run pytest -q tests/test_navigation.py tests/test_views_pages.py`
Expected: FAIL.

- [ ] **Step 2: Server**

- Add the route `(r"^/airlines/(?P<slug>[A-Za-z0-9_-]+)/changes$", airline_changes_page),` before `^/airlines/(?P<slug>…)$`.
- `airline_changes_page` is `airline_page` with template `airline_changes.html` and crumbs `airline_crumbs(datasette, info, ("changes", None))`. Factor both into `airline_view(template, tail)`, as for the route.
- In `views_for`, the two airline cases become one:

```python
        case ["airlines", slug, *rest] if rest in ([], ["changes"], ["globe"]):
            return make(("Over time", f"/airlines/{slug}", None), ("Changes", f"/airlines/{slug}/changes", None),
                        ("Map", f"/airlines/{slug}/globe", "map-link"), current=[[], ["changes"], ["globe"]].index(rest))
```

`id="map-link"` is now on the Map view on every airline page; `loadChanges` rewrites it with the years compared.

- [ ] **Step 3: Templates**

Create `templates/airline_changes.html` from `airline.html`:
- keep the head, the body's `data-*`, nav, search, h1, `#full-name`, the intro and the footer;
- replace the members list, How big and How many places with:
  - the "What changed" section, from `<h2 id="changes">` through its note;
  - a copy of the minimum-flights control, as its own sentence above the compare: `<p class="chart-sentence">Count airport pairs flown at least <select id="al-min" …>…</select> in the year.</p>`.

In `airline.html`, delete the "What changed" section.

In `airline_globe.html`, `#table-link`'s href becomes `/airlines/{{ own }}/changes`.

- [ ] **Step 4: Scripts**

**`static/charts/airline.js` `main()`:**
- `nameHeading()` runs on both pages.
- **The `#changes` forward:** first thing, `if (location.hash === '#changes' && $('size-chart')) { location.replace(`/airlines/${airline || group}/changes${location.search}`); return; }`.
- **Each page's parts:** with `const hasSize = Boolean($('size-chart'))` and `const hasChanges = Boolean($('change-table'))`:
  - fill and wire the measure, kind, split and span controls, and fetch `carrier_group_detail`, only when `hasSize`;
  - fill the year menus and wire `al-a`, `al-b` and `al-status` only when `hasChanges`;
  - `al-min` exists on both pages, and its change handler calls `drawPairs` if `hasSize` and `loadChanges` if `hasChanges`.
  - Fetch `airports` for place names only when `hasChanges`, since only the table uses them.
- **Carrying the query (`carryQuery()`):** `al-min`, `al-a` and `al-b` write `min`, `from` and `to` into the query with `history.replaceState`, as `span` does today. Then copy `location.search` onto the views line's links, as for the route.
- The theme listener redraws what exists.

**`static/charts/airlineglobe.js` line 133:** `$('table-link').href = `/airlines/${own}/changes${state.compare ? `?from=${state.compare}&to=${state.year}` : ''}`;`

- [ ] **Step 5: Run the tests, then commit**

Run: `uv run pytest -q` and `npm test 2>&1 | grep -E "^ℹ (pass|fail)"`
Expected: all pass; `fail 0`.

Stage the files by name, then commit:

```bash
git commit -m "An airline's changes get their own page: /airlines/{airline}/changes, with Over time · Changes · Map in the views line

Old #changes links forward there; the airline map's table link goes there with its years.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0191mnN3iPgFXTdJ7jQemcY1"
```

---

### Task 4: Smoke check, and a browser pass

**Files:**
- Modify: `scripts/smoke_check.sh`
- Create (scratchpad): `views_check.py`

- [ ] **Step 1: Smoke check**

In `scripts/smoke_check.sh`, after the `/airports/SFO/LHR/2019` line, add:

```sh
check 200 /airports/SFO/LHR/2019/table                              "route-table"
check 200 /airlines/delta/changes                                   "change-table"
check 301 /aircraft/table
```

Restart the scratch server. Run: `scripts/smoke_check.sh http://localhost:8811 | grep -v "^ok"`
Expected: the only failure is the `403 /t100/-/query.json` line, which fails locally by design.

- [ ] **Step 2: Browser checks**

`views_check.py` (Playwright, at 1280) checks:
1. **The route's settings carry to its table:** on `/airports/ATL/JFK?measure=seats&split=aircraft`, click "Table" in the views line. Expected: the URL ends `/airports/ATL/JFK/table?measure=seats&split=aircraft`, and the table's first header is "Aircraft".
2. **A year with no flights:** on `/airports/SFO/LHR/1995/table`, check whether `#status` says "No flights"; if the route did fly that year, find a year it didn't. Expected: the status shows and no table rows render.
3. **The changes page on its own:** on `/airlines/delta/changes?from=2019&to=2025`, `#al-a` is 2019, `#al-b` is 2025, and the table has rows.
4. **The `#changes` forward:** `/airlines/delta?from=2019&to=2025#changes` lands on `/airlines/delta/changes?from=2019&to=2025`.
5. **A merged airline:** on `/airlines/delta/changes`, the Airline column header exists, since Delta includes Northwest.
6. **The map's table link:** on `/airlines/delta/globe?year=2025&compare=2019`, `#table-link` is `/airlines/delta/changes?from=2019&to=2025`.
7. **Errors:** no page errors anywhere.

Run: `uv run --no-project --with playwright python views_check.py`
Expected: all seven hold.

- [ ] **Step 3: Commit**

```bash
git add scripts/smoke_check.sh
git commit -m "Smoke check: a route's table, an airline's changes, and the old aircraft table address

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0191mnN3iPgFXTdJ7jQemcY1"
```
