# Airline Routes Heat Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/airlines/{airline}/routes` is a heat map of the airline's airport pairs by year. It's a new "Routes" view in the airline's views line: Over time · Routes · Changes · Map.

**Architecture:**
- **The data:** a new canned query, `carrier_route_by_year`, returns pair-year rows (12+ departures) for a group or one member.
- **The page:** the airlines heat map's script, `static/charts/rollup.js`, gains a second page kind, `routes`. Its rows come from a new pure function, `routeRows` (`static/charts/src/rollup.js`). Its labels link to the route with the airline highlighted, and its hover text gives place names from the `airports` query.
- **The template:** a new `templates/airline_routes.html` carries the airline header and the heat-map controls without "flights".
- **The plugin** routes the page through the existing `airline_view` and adds the views-line entry.

**Tech Stack:** a Datasette plugin (Python, Jinja), canned SQL in `datasette.yml`, plain ES modules with Observable Plot, `node --test`, pytest, and headless Playwright (run as `uv run --no-project --with playwright python`).

**Spec:** `docs/superpowers/specs/2026-10-22-airline-routes-design.md`

## Global Constraints

- **The path** is `/airlines/{airline}/routes`, for a group (`delta`) or a member (`19386`). An unknown airline gives a 404.
- **The views line** on all four airline pages is **Over time · Routes · Changes · Map**, and the Map entry keeps its id, `map-link`.
- **The breadcrumb's** last step is "routes".
- **Rows** are airport pairs labelled `ATL – MCO` (alphabetical, both directions together).
- **Links** go to `/airports/{origin}/{dest}?split=carrier&highlight=airline:{group}`. `{group}` is the page's group, even on a member's page.
- **Only route-years with at least 12 departures** are included.
- **Settings:**
  - `measure`: passengers;
  - `service`: all, domestic or international;
  - `n`: 10, 25 or 50, with 50 as the default;
  - `rank`: `all` or `latest`, where `latest` means the airline's own last year (`data-latest-year`);
  - `scale`: `year` by default.

  There's no flights control.
- **The views line** carries the whole query on the routes page, as `carryQuery` in `static/charts/airline.js` does. The airlines heat map (`data-kind="airlines"`) keeps `sharedQuery`.
- **Staging:** stage files by name, because `templates/` holds the user's untracked `query-t100-*.html` files.
- **Commit trailer:** every commit ends with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_0191mnN3iPgFXTdJ7jQemcY1
  ```
- **Git:** don't push or merge.

## Review Focus

1. **A member's page** (`/airlines/19386/routes`) queries with `airline=19386`, but its links highlight the group (`airline:delta`).
2. **The airlines heat map at `/airlines/over-time`** is unchanged:
   - the flights control still works;
   - airline labels still link to `/airlines/{id}`;
   - the views line still carries only `measure`, `flights` and `service`.
3. **An airline with no international routes,** shown international only, says "Nothing to chart for this selection." and doesn't throw.
4. **The airports query failing or loading slowly** still draws the heat map. Places are only hover text.
5. **The biggest airline** (`/airlines/american/routes`) isn't truncated: about 29,500 rows against the 50,000 limit.

---

### Task 1: The `carrier_route_by_year` query

**Files:**
- Modify: `datasette.yml` (directly after the `carrier_routes_year` query)
- Test: `tests/test_rollup_queries.py`

**Interfaces:**
- Produces: `/t100/carrier_route_by_year.json?group=<id>&airline=<''|id>`, which returns rows `{origin, dest, year, deps, seats, passengers, freight, service}`. There's one row per pair-year with `SUM(deps) >= 12`, ordered by year, origin and destination.

- [ ] **Step 1: Write the failing test.** Append it to `tests/test_rollup_queries.py`; `put` and `get_json` are already imported there.

```python
def cry(year, airline, origin, dest, deps, domestic=True):
    return dict(group_id="delta", airline_id=airline, year=year, origin=origin, dest=dest, deps=deps, seats=deps * 100,
                passengers=deps * 80, freight=deps * 1000, first_month=1, last_month=12, domestic_deps=deps if domestic else 0)


def test_carrier_route_by_year_sums_members_and_keeps_pairs_flown_12_times(ds, db_path):
    put(db_path, "carrier_route_year", [cry(2005, "19790", "ATL", "LGA", 10), cry(2005, "19386", "ATL", "LGA", 5),
                                        cry(2019, "19790", "ATL", "LGA", 30), cry(2019, "19790", "ATL", "XNA", 11),
                                        cry(2019, "19790", "ATL", "LHR", 20, domestic=False)])
    url = "/t100/carrier_route_by_year.json?_shape=objects&group=delta&airline="
    got = {(r["origin"], r["dest"], r["year"]): (r["deps"], r["passengers"], r["service"]) for r in get_json(ds, url)["rows"]}
    assert got == {("ATL", "LGA", 2005): (15, 1200, "domestic"), ("ATL", "LGA", 2019): (30, 2400, "domestic"),
                   ("ATL", "LHR", 2019): (20, 1600, "international")}  # ATL-XNA flew 11 times: under the cut-off
    one = get_json(ds, url + "19790")["rows"]
    assert [(r["origin"], r["dest"], r["year"]) for r in one] == [("ATL", "LGA", 2019), ("ATL", "LHR", 2019)]  # Delta alone flew ATL-LGA 10 times in 2005
```

- [ ] **Step 2: Run the test to watch it fail.**

Run: `uv run pytest tests/test_rollup_queries.py -k carrier_route_by_year -q`
Expected: 1 failed, with a 404 ("Table not found").

- [ ] **Step 3: Add the query** to `datasette.yml`, directly after `carrier_routes_year`'s `ORDER BY r.passengers DESC` line, at the same indentation as `carrier_routes_year:`:

```yaml

      # an airline's routes heat map: each airport pair (both directions together) by year, flown at least 12 times
      carrier_route_by_year:
        sql: |
          SELECT
            r.origin, r.dest, r.year,
            SUM(r.deps) AS deps, SUM(r.seats) AS seats, SUM(r.passengers) AS passengers, SUM(r.freight) AS freight,
            CASE WHEN SUM(r.domestic_deps) * 2 > SUM(r.deps) THEN 'domestic' ELSE 'international' END AS service
          FROM carrier_route_year r
          WHERE r.group_id = :group AND (:airline = '' OR r.airline_id = :airline)
          GROUP BY r.origin, r.dest, r.year
          HAVING SUM(r.deps) >= 12
          ORDER BY r.year, r.origin, r.dest
```

- [ ] **Step 4: Run the tests to watch them pass.**

Run: `uv run pytest tests/test_rollup_queries.py -q`
Expected: every test passes.

- [ ] **Step 5: Check the biggest airline's size against the real database.**

Run: `sqlite3 t100.db "select count(*) from (select origin,dest,year from carrier_route_year where group_id='american' group by 1,2,3 having sum(deps)>=12)"`
Expected: about 29,500, under 50,000.

- [ ] **Step 6: Commit.**

```bash
git add datasette.yml tests/test_rollup_queries.py
git commit -m "carrier_route_by_year query: an airline's airport pairs by year, flown at least 12 times

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0191mnN3iPgFXTdJ7jQemcY1"
```

---

### Task 2: `routeRows`, and `rollupRows` for rows without a kind

**Files:**
- Modify: `static/charts/src/rollup.js`
- Test: `static/charts/test/rollup.test.js`

**Interfaces:**
- Consumes: Task 1's row shape.
- Produces:
  - `routeRows(rows) → [{route, origin, dest, year, service, deps, seats, passengers, freight}]`, where `route` is `"ATL – MCO"` (with an en dash);
  - `rollupRows(rows, {key, kind})`, which now passes rows that have no `kind`.

- [ ] **Step 1: Write the failing tests.** Add `routeRows` to the test file's import from `../src/rollup.js`, then append:

```js
test('rollupRows keeps rows that have no kind of flight, whatever kind is asked for', () => {
  const rows = [{ year: 2019, route: 'ATL – LGA', deps: 5, seats: 0, passengers: 0, freight: 0, service: 'domestic' }];
  assert.equal(rollupRows(rows, { key: 'route', kind: 'passenger' }).length, 1);
  assert.equal(rollupRows([f(2019, 'Boeing 747', 1, { kind: 'freight' })], { key: 'family', kind: 'passenger' }).length, 0);
});

test('routeRows names each airport pair and keeps its measures and service', () => {
  const out = routeRows([{ origin: 'ATL', dest: 'LGA', year: 2019, deps: 30, seats: 3000, passengers: 2400, freight: 30000, service: 'domestic' }]);
  assert.deepEqual(out, [{ route: 'ATL – LGA', origin: 'ATL', dest: 'LGA', year: 2019, service: 'domestic', deps: 30, seats: 3000, passengers: 2400, freight: 30000 }]);
  const res = buildHeatmap(rollupRows(out, { key: 'route', kind: 'passenger' }), { measure: 'deps', n: 5 });
  assert.deepEqual(res.dests, ['ATL – LGA']);
});
```

- [ ] **Step 2: Run the tests to watch them fail.**

Run: `node --test static/charts/test/rollup.test.js`
Expected: the file fails to load, because `routeRows` isn't exported yet.

- [ ] **Step 3: Implement.** In `static/charts/src/rollup.js`, change `rollupRows`'s filter line to:

```js
    .filter((r) => kind === 'all' || !r.kind || r.kind === kind) // rows with no kind (an airline's routes) can't be split by it
```

Add after `rollupRows`:

```js
// Rows from carrier_route_by_year -> rows named by their airport pair ("ATL – LGA"), both directions together
export function routeRows(rows) {
  return rows.map((r) => ({
    route: `${r.origin} – ${r.dest}`, origin: r.origin, dest: r.dest, year: r.year, service: r.service,
    deps: r.deps, seats: r.seats, passengers: r.passengers, freight: r.freight,
  }));
}
```

- [ ] **Step 4: Run the tests to watch them pass.**

Run: `node --test static/charts/test/rollup.test.js; npm test 2>&1 | grep -E "ℹ (pass|fail)"`
Expected: every test passes, with `fail 0`.

- [ ] **Step 5: Commit.**

```bash
git add static/charts/src/rollup.js static/charts/test/rollup.test.js
git commit -m "routeRows names an airline's airport pairs for the heat map; rollupRows passes rows with no kind

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0191mnN3iPgFXTdJ7jQemcY1"
```

---

### Task 3: The route, the views line and the template

**Files:**
- Modify: `plugins/t100_globe.py` (`register_routes`, `views_for`, the airline page handlers)
- Create: `templates/airline_routes.html`
- Modify: `scripts/smoke_check.sh`
- Test: `tests/test_navigation.py`, `tests/test_views_pages.py` and `tests/test_page_frame.py`

**Interfaces:**
- Consumes: nothing from earlier tasks, apart from the script path `/static/charts/rollup.js`.
- Produces: for Task 4:
  - the body attributes `data-kind="routes"`, `data-group`, `data-airline` and `data-latest-year` (the airline's last year);
  - the controls `#heat-measure`, `#heat-service`, `#heat-n` and `#heat-rank`, and the `input[name=scale]` radios (no `#heat-kind`);
  - `#scale-note`, `#heatmap` and `#rank-note`.

- [ ] **Step 1: Write the failing tests.** In `tests/test_navigation.py`:
  - in `test_aircraft_and_airline_views`, make `A` read:

    ```python
        A = [("Over time", "/airlines/delta"), ("Routes", "/airlines/delta/routes"), ("Changes", "/airlines/delta/changes"), ("Map", "/airlines/delta/globe")]
    ```

  - in `test_the_airline_pages_map_view_keeps_the_id_its_script_rewrites`, expect `[None, None, None, "map-link"]`;
  - in `test_an_airlines_page_and_map_have_overview_and_map_views`, change the two regexes to:

    ```python
        assert re.search(r'<strong aria-current="page">Over time</strong> · <a href="/airlines/delta/routes">Routes</a> · <a href="/airlines/delta/changes">Changes</a> · <a href="/airlines/delta/globe" id="map-link">Map</a>', page)
        assert re.search(r'<a href="/airlines/delta">Over time</a> · <a href="/airlines/delta/routes">Routes</a> · <a href="/airlines/delta/changes">Changes</a> · <strong aria-current="page">Map</strong>', get(ds, "/airlines/delta/globe").text)
    ```

  - in `test_the_airlines_table_and_heat_map_are_two_views_of_the_section`, expect `["Over time", "Routes", "Changes", "Map"]`.

Append to `tests/test_views_pages.py`:

```python
def test_an_airlines_routes_have_their_own_page(ds, db_path):
    delta(db_path)
    r = get(ds, "/airlines/delta/routes")
    assert r.status_code == 200
    assert 'id="heatmap"' in r.text and 'data-kind="routes"' in r.text and "/static/charts/rollup.js" in r.text
    assert 'id="heat-kind"' not in r.text and 'id="heat-service"' in r.text and 'name="scale"' in r.text
    assert 'data-group="delta"' in r.text and 'data-airline=""' in r.text and 'data-latest-year="2019"' in r.text
    assert re.search(r'<li aria-current="page">routes</li>', r.text)
    assert re.search(r'<a href="/airlines/delta">Over time</a> · <strong aria-current="page">Routes</strong>', r.text)


def test_a_members_routes_page_queries_the_member_and_ranks_by_its_last_year(ds, db_path):
    put(db_path, "carrier_group", [dict(airline_id="19386", group_id="delta", group_name="Delta (incl. Northwest)", airline_name="Northwest Airlines Inc.")])
    put(db_path, "carrier_group_year", [dict(year=2008, airline_id="19386", group_id="delta", group_name="Delta (incl. Northwest)", domestic=1,
                                             service_class="F", deps=4, seats=400, passengers=300, freight=0)])
    r = get(ds, "/airlines/19386/routes")
    assert r.status_code == 200
    assert 'data-group="delta"' in r.text and 'data-airline="19386"' in r.text and 'data-latest-year="2008"' in r.text
    assert ">2008 only<" in r.text


def test_an_unknown_airlines_routes_are_not_found(ds):
    assert get(ds, "/airlines/nope/routes").status_code == 404
```

In `tests/test_page_frame.py`, add `"airline_routes"` to `TEMPLATES`.

- [ ] **Step 2: Run the tests to watch them fail.**

Run: `uv run pytest tests/test_navigation.py tests/test_views_pages.py tests/test_page_frame.py -q 2>&1 | tail -12`
Expected: failures for the views line (no Routes yet), the routes pages (404), and `airline_routes.html` (missing).

- [ ] **Step 3: Change the plugin.** In `register_routes`, after the `/changes$` airline route, add:

```python
        (r"^/airlines/(?P<slug>[A-Za-z0-9_-]+)/routes$", airline_routes_page),
```

Replace the airline case in `views_for` with:

```python
        case ["airlines", slug, *rest] if rest in ([], ["routes"], ["changes"], ["globe"]):
            return make(("Over time", f"/airlines/{slug}", None), ("Routes", f"/airlines/{slug}/routes", None),
                        ("Changes", f"/airlines/{slug}/changes", None), ("Map", f"/airlines/{slug}/globe", "map-link"),
                        current=[[], ["routes"], ["changes"], ["globe"]].index(rest))
```

After `airline_changes_page = …`, add:

```python
airline_routes_page = airline_view("airline_routes.html", (("routes", None),))
```

- [ ] **Step 4: Create `templates/airline_routes.html`.**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>{{ name }} · routes · T-100</title>
  <link rel="stylesheet" href="/static/common/base.css">
  <link rel="stylesheet" href="/static/charts/style.css">
  <link rel="stylesheet" href="/static/nav/style.css">
  <script type="module" src="/static/nav/main.js"></script>
</head>
<body data-kind="routes" data-group="{{ group }}" data-airline="{{ airline }}" data-latest-year="{{ last_year }}">
  <main>
    {% include "_nav.html" %}
    {% include "_airline_search.html" %}
    <h1 id="airline-name">{{ name }}</h1>
    <p class="intro">
      The airport pairs {{ name }} flew from {{ first_year }} to {{ last_year }}, busiest first, with both directions counted together.
      {% if parent %}One of the airlines counted together as <a href="/airlines/{{ parent.id }}">{{ parent.name }}</a>.{% endif %}
      {% if members %}Counts {{ members|map(attribute="name")|join(", ") }} together for every year.{% endif %}
    </p>
    <p class="chart-sentence">
      Show <select id="heat-measure" aria-label="Measure"></select>
      on <select id="heat-service" aria-label="Routes"><option value="all">all routes</option><option value="domestic">domestic routes</option><option value="international">international routes</option></select>
      for the top <select id="heat-n" aria-label="Number of rows"><option>10</option><option>25</option><option selected>50</option></select>
      routes, ranked by <select id="heat-rank" aria-label="Year used to rank rows"><option value="all">all years</option><option value="latest">{{ last_year }} only</option></select>.
    </p>
    <fieldset id="heat-scale" class="scale-choice">
      <legend>Colour</legend>
      <label><input type="radio" name="scale" value="absolute"> Amount</label>
      <label><input type="radio" name="scale" value="year" checked> Share of each year</label>
      <label><input type="radio" name="scale" value="busiest"> Compared to the biggest</label>
    </fieldset>
    <p class="note" id="scale-note" hidden></p>
    <div id="heatmap" aria-live="polite">Loading chart…</div>
    <p class="note" id="rank-note"></p>
    <p class="note" id="about-note">
      Flying done for the airline by a regional partner, such as SkyWest for Alaska or United, is reported under the regional's own name and is not included. How airlines are <a href="/about#groupings">grouped</a>.
      Freight before 2003 leaves out most domestic FedEx and UPS flying: see <a href="/about#breaks">known gaps in the data</a>.
    </p>
    {% include "_footer.html" %}
  </main>
  <script type="module" src="/static/charts/rollup.js"></script>
</body>
</html>
```

- [ ] **Step 5: Update the smoke check.** In `scripts/smoke_check.sh`, after `check 200 /airlines/delta                                          "size-chart"`, add:

```sh
check 200 /airlines/delta/routes                                   "heatmap"
```

- [ ] **Step 6: Run the tests to watch them pass.**

Run: `uv run pytest -q 2>&1 | tail -3; sh -n scripts/smoke_check.sh && echo ok`
Expected: every test passes, then `ok`.

- [ ] **Step 7: Commit.**

```bash
git add plugins/t100_globe.py templates/airline_routes.html scripts/smoke_check.sh tests/test_navigation.py tests/test_views_pages.py tests/test_page_frame.py
git commit -m "An airline's Routes view: /airlines/{airline}/routes, between Over time and Changes in its views line

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0191mnN3iPgFXTdJ7jQemcY1"
```

---

### Task 4: The routes kind in the heat map script

**Files:**
- Modify: `static/charts/rollup.js`
- Test: the Playwright script `airline_routes_check.py`, in the scratchpad

**Interfaces:**
- Consumes:
  - `routeRows` and `rollupRows` (Task 2);
  - the query (Task 1);
  - the template's attributes and ids (Task 3);
  - `sharedQuery` (`static/charts/src/airlines.js`, already imported).
- Produces: the working page.

- [ ] **Step 1: Write the failing browser check.** Restart the scratch server:

```sh
pkill -f "port 8811"; (nohup uv run datasette serve t100.db --config datasette.yml --plugins-dir plugins --template-dir templates --static static:static --port 8811 >/dev/null 2>&1 &)
```

Then create `airline_routes_check.py` in the scratchpad:

```python
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8811"
fails = []
def check(ok, what):
    print("ok  " if ok else "FAIL", what)
    if not ok: fails.append(what)

LABELS = "() => [...document.querySelectorAll('#heatmap svg a')].map((a) => ({ href: a.getAttribute('href'), text: a.textContent, title: a.querySelector('title')?.textContent || '' }))"

with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    pg = b.new_page(viewport={"width": 1280, "height": 900}); pg.on("pageerror", lambda e: errs.append(str(e)))

    pg.goto(BASE + "/airlines/delta/routes"); pg.wait_for_selector("#heatmap svg", timeout=20000)
    labels = pg.evaluate(LABELS)
    check(len(labels) == 50, f"50 rows (got {len(labels)})")
    first = labels[0] if labels else {}
    check(" – " in first.get("text", "") and first.get("href", "").endswith("?split=carrier&highlight=airline:delta"), f"a label links to the route with Delta highlighted: {first}")
    check(" – " in first.get("title", "") and first.get("title") != first.get("text"), f"a label's hover text gives the places: {first.get('title')}")
    check(pg.locator("#heat-kind").count() == 0, "no flights control")
    check("12 departures" in pg.inner_text("#rank-note"), "the note gives the cut-off: " + pg.inner_text("#rank-note"))

    pg.goto(BASE + "/airlines/19386/routes?rank=latest"); pg.wait_for_selector("#heatmap svg", timeout=20000)
    nw = pg.evaluate(LABELS)
    check(len(nw) > 0 and all(l["href"].endswith("highlight=airline:delta") for l in nw), f"Northwest ranked by 2009 draws rows that highlight the group ({len(nw)})")

    pg.goto(BASE + "/airlines/delta/routes"); pg.wait_for_selector("#heatmap svg", timeout=20000)
    pg.select_option("#heat-service", "international"); pg.check('input[name="scale"][value="busiest"]'); pg.wait_for_timeout(500)
    pg.reload(); pg.wait_for_selector("#heatmap svg", timeout=20000)
    check(pg.eval_on_selector("#heat-service", "s => s.value") == "international" and pg.is_checked('input[name="scale"][value="busiest"]'), "settings survive a reload: " + pg.url)
    changes = pg.eval_on_selector('nav.views a[href^="/airlines/delta/changes"]', "a => a.search")
    check("service=international" in changes, f"the views line carries the query: {changes}")
    pg.click('nav.views a[href^="/airlines/delta/changes"]'); pg.wait_for_selector("#change-table tbody tr", timeout=20000)
    check(pg.url.split("?")[0].endswith("/airlines/delta/changes"), "Changes opens and ignores the heat-map settings")

    pg.goto(BASE + "/airlines/over-time?flights=freight"); pg.wait_for_selector("#heatmap svg", timeout=20000)
    al = pg.evaluate(LABELS)
    check(len(al) > 0 and all(l["href"].startswith("/airlines/") for l in al), "the airlines heat map still links airlines")
    back = pg.eval_on_selector("nav.views a", "a => a.pathname + a.search")
    check(back == "/airlines?flights=freight", f"the airlines heat map still carries only the shared settings: {back}")

    check(not errs, f"no page errors {errs}")
    b.close()
print("FAILURES:", len(fails))
```

Run: `timeout 200 uv run --no-project --with playwright python <scratchpad>/airline_routes_check.py`
Expected: it fails with a timeout waiting for `#heatmap svg`. Today `rollup.js` has no `routes` kind, so `page` is undefined and the script throws.

- [ ] **Step 2: Add the routes kind to `static/charts/rollup.js`.**
- **Imports:** extend the `rollup.js` import to `import { rollupRows, routeRows } from '/static/charts/src/rollup.js';`.
- **`KINDS`:**

  ```js
  const KINDS = {
    airlines: { query: 'carrier_group_by_year', key: 'group_name', noun: 'airline' },
    routes: { query: 'carrier_route_by_year', key: 'route', noun: 'route' },
  };
  ```

- **After `const page = KINDS[kind];`, add:**

  ```js
  const body = document.body.dataset;
  const queryParams = kind === 'routes' ? { group: body.group, airline: body.airline } : {};
  ```

- **Replace the `familyHref` function and its comment** with:

  ```js
  // a label opens the thing it names: an airline's own page, or a route with this airline picked out
  let places = new Map();
  const place = (code) => places.get(code) || code;
  const pairOf = (route) => route.split(' – ');
  function familyHref(name) {
    if (kind === 'routes') { const [o, d] = pairOf(name); return `/airports/${o}/${d}?split=carrier&highlight=airline:${body.group}`; }
    const id = rows.find((r) => r.group_name === name)?.group_id;
    return id ? `/airlines/${id}` : undefined;
  }
  const titleOf = (name) => (kind === 'routes' ? pairOf(name).map(place).join(' – ') : name);
  ```

- **The `carry` function:**

  ```js
  // the views line: an airline's views pass their whole query, as its other pages do; the airlines heat map passes the
  // settings the airlines table reads too
  const carry = () => { for (const a of document.querySelectorAll('nav.views a')) a.search = kind === 'routes' ? location.search : sharedQuery(location.search); };
  ```

- **In `draw()`:**
  - Replace the `rank-note` assignment with:

    ```js
      $('rank-note').textContent = `Rows are ranked by the measure ${rankYear() === null ? 'summed over all years' : `in ${rankYear()} alone, so ones that did not fly then are not shown`}. Each cell is one ${page.noun} in one year; blank means none. Freight is in short tons (2,000 lb).${kind === 'airlines' ? ' Click an airline\'s name to see its routes. Airlines that merged are counted together for every year, including years before the merger.' : ''}${kind === 'routes' ? ' Each row is an airport pair, both directions together; a year shows when the airline flew it at least 12 departures. A merged airline counts its members together for every year. Click a route to see it with this airline picked out.' : ''}`;
    ```

  - Replace the `buildHeatmap(rollupRows(…))` line with:

    ```js
      const res = buildHeatmap(rollupRows(rows, { key: page.key, kind: kind === 'routes' ? 'all' : state.flights }), { ...state, rankYear: rankYear() });
    ```

  - In the `Plot.text` mark, change `title: 'dest'` to `title: 'title'`, and add `title: titleOf(d)` to each object in the `res.dests.map((d) => ({ … }))` array.
- **In `fillControls()`:**
  - change `$('heat-kind').value = state.flights;` to `if ($('heat-kind')) $('heat-kind').value = state.flights;`;
  - change `bind('heat-kind', 'flights');` to `if ($('heat-kind')) bind('heat-kind', 'flights');`.
- **In `main()`,** replace the `try` block's first three lines (`const res = …`, `rows = res.rows;`, and the `shorts` line) with:

  ```js
      const [res, airports] = await Promise.all([
        fetchRows(queryUrl(page.query, queryParams)),
        kind === 'routes' ? fetchRows(queryUrl('airports')).catch(() => null) : null, // place names are only hover text
      ]);
      rows = kind === 'routes' ? routeRows(res.rows) : res.rows;
      if (airports) places = new Map(airports.rows.map((r) => [r.code, r.place]));
      if (kind === 'airlines') shorts = shortNames(rows.map((r) => r.group_name));
  ```

- [ ] **Step 3: Run the browser check to watch it pass.** Restart the scratch server (with the same command as in Step 1), then:

Run: `timeout 200 uv run --no-project --with playwright python <scratchpad>/airline_routes_check.py`
Expected: every line is `ok`, and the output ends with `FAILURES: 0`. If a check fails because the real data differs from what's assumed here, read the data with `sqlite3` before changing either the check or the code.

- [ ] **Step 4: Run every suite.**

Run: `npm test 2>&1 | grep -E "ℹ (pass|fail)"; uv run pytest -q 2>&1 | tail -1`
Expected: `fail 0`, and every pytest test passes.

- [ ] **Step 5: Look at the page at phone width.** Take a 390px-wide screenshot of `/airlines/delta/routes`, and check that there's no sideways page scroll (`document.documentElement.scrollWidth <= innerWidth`). The heat map is as wide as the airlines heat map is.

- [ ] **Step 6: Commit.**

```bash
git add static/charts/rollup.js
git commit -m "Airline routes heat map: airport pairs by year, labels opening the route with the airline highlighted

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0191mnN3iPgFXTdJ7jQemcY1"
```

---

### Task 5: The roadmap

**Files:**
- Modify: `docs/site-coherence.md` (the Views part 3 list)

- [ ] **Step 1: Mark the routes view built.** In part 3's list, add a bullet after the airlines table's:

```markdown
- **An airline's routes: built as a heat map**, spec `docs/superpowers/specs/2026-10-22-airline-routes-design.md`.
  - `/airlines/{airline}/routes` shows airport pairs (both directions together) by year, with route-years of at least 12 departures, and labels that open the route with the airline highlighted.
  - The views line is Over time · Routes · Changes · Map.
  - A table version was considered and dropped.
```

Then remove "an airline's routes heat map;" from the "Still to come" list.

- [ ] **Step 2: Commit.**

```bash
git add docs/site-coherence.md
git commit -m "Roadmap: an airline's routes heat map is done

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0191mnN3iPgFXTdJ7jQemcY1"
```
