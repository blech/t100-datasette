# Front Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the busiest-airports table at `/` with a front page that has an introduction and three story sections (airports map, engine story, airline concentration), and move the table to `/airports` and the map chooser to `/airports/globe`.

**Architecture:** The `home_page` handler in `plugins/t100_globe.py` runs canned queries from `datasette.yml` and turns their rows into story numbers using pure functions in the same file. `templates/home.html` renders those numbers as prose. `static/home/main.js` fetches the same canned queries and draws three graphics independently:
- a canvas map of the US, using a new composite projection in `static/globe/src/usamap.js`;
- two Observable Plot charts.

**Tech Stack:** Datasette 1.0a41 plugin (Python, Jinja), SQLite canned queries, plain ES modules with vendored d3-geo/topojson (UMD globals) and Observable Plot, pytest, `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-18-front-page-design.md`

## Global Constraints

- Every number in the front page prose comes from the database at render time, never typed into a template.
- Each graphic is at most `min(500px, 66vh)` tall.
- Section rule: a 1px top border on the section with the `h2` directly beneath it (the husk.org/labs pattern), in a `--rule` colour based on `#999`.
- Writing: assume no knowledge of T-100 or aviation terms. Name aircraft people know and explain terms in a clause.
- Order of sections: Airports, Aircraft, Airlines.
- `/` with `year` or `sort` → 301 to `/airports` with the query string kept. `/globe` → 301 `/airports/globe`, query kept. `/routes` → 301 `/airports`, query kept.
- The page never errors when a query returns no rows: that section drops its numbers and keeps its heading and links.
- No build step: plain ES modules. Vendored libraries are loaded as classic scripts from `static/globe/vendor/`.
- Commits end with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_0191mnN3iPgFXTdJ7jQemcY1
  ```
- Do not push. The owner decides when to deploy.

## Planner's rulings (deviations from the spec, decided while planning)

1. **The map gets its own small drawing code instead of a `'usa'` mode in `NetworkRenderer`.** The renderer is built around rotation, zoom and the camera, and a composite projection cannot rotate. Cost if wrong: about 40 lines that could have been shared.
2. **US outlines come from the vendored us-atlas `states-10m.json` (114 KB, which includes Puerto Rico and the Virgin Islands), not `land-110m.json`.** World land draws Canada, Mexico and Cuba underneath the insets. Cost: 114 KB, fetched only by the front page.
3. **The map's airports use a new `busiest_airports` query (top 100 by passengers from `airport_year_totals`).** The chooser's `top_us_airports` scans the raw flights and takes about 1 second, which is too slow to run on every front page render. Cost: one more canned query.
4. **The story functions stay in `plugins/t100_globe.py`, not a new `plugins/t100_home.py`.** The plugins directory isn't on `sys.path` in production, so one plugin file can't import another. Tests import `plugins.t100_globe` directly, which works because `pyproject.toml` sets `pythonpath = ["."]`.
5. **`static/landing/` keeps its name and holds the table's code.** Its `style.css` is the base stylesheet for every page, and `routepage.js` imports its `table.js`, so renaming it touches eight templates for no gain. Only the template is renamed: `landing.html` becomes `airports.html`. The `.section` rule goes in `static/landing/style.css`, the stylesheet every content page loads, and the nav's theme painter sets `--rule`.
6. **Map dots are sized by passengers** (area proportional, 2.5 to 12px), where the chooser uses fixed 4px dots. The spec asked for dots "sized by passengers".

## Review Focus

1. **Year boundaries:** what if `min_year` or `max_year` has no data (for example, the config is bumped to 2026 before the data is loaded)? Each story returns `None` and the section shows only its heading and links. Tests: `test_stories_with_a_missing_year_are_none` and `test_home_page_without_data_still_renders`.
2. **The lowest point being an end year:** if the top-four share was lowest in the first or last year, the sentence must not say "fell to X by {first year}". The template only shows the dip clause when the low year differs from both ends. Test: `test_concentration_story_without_a_dip_has_no_low_year`.
3. **Airports the projection can't place** (Guam GUM, Saipan SPN, American Samoa PPG) must be dropped, not drawn at NaN or crash. Tests: `projects GUM to null` and `placeOnMap drops points the projection cannot place`.
4. **Old front-page links:** `/?year=2019&sort=deps` must reach the table. Plain `/?theme=night` must stay on the front page. Test: `test_root_with_table_params_redirects_to_airports`.
5. **The nav carrying settings:** `/airports/globe` must be classed as a globe page, not as an airport called "globe". Test: the `targetOf('/airports/globe')` assertion in Task 3.

---

## File structure

**Create:**
- `templates/home.html`: the front page.
- `static/home/main.js`: draws the three graphics.
- `static/home/style.css`: front-page layout (graphic boxes, map tooltip).
- `static/home/src/map.js`: pure map helpers (dot radius, placement, hit test) and canvas drawing.
- `static/home/src/concentration.js`: rows → plot points for the airline chart.
- `static/home/test/map.test.js` and `static/home/test/concentration.test.js`.
- `static/globe/src/usamap.js`: the composite projection `geoAlbersUsaTerritories(d3)`.
- `static/globe/test/usamap.test.js` and `static/globe/test/d3.js`, which loads the vendored d3 into node for tests.
- `static/globe/vendor/states-10m.json`: the vendored us-atlas file.
- `tests/test_home_queries.py`, `tests/test_home_stories.py`, `tests/test_home_page.py`.

**Rename:** `templates/landing.html` → `templates/airports.html`.

**Modify:**
- `datasette.yml`: three new canned queries.
- `plugins/t100_globe.py`: routes, `home_page`, `canned`, story functions, `airports_index`, `globe_page` crumbs.
- `static/landing/style.css`: `--rule` and `.section`.
- `static/nav/main.js`: paint `--rule`.
- `static/nav/src/state.js`: `targetOf`.
- `static/nav/test/state.test.js`.
- `static/globe/vendor/README.md`.
- `package.json`: test glob.
- `README.md`.
- Existing tests that use `/` or `/globe`: `tests/test_landing_page.py`, `test_nav.py`, `test_redirects.py`, `test_routes_page.py`, `test_globe_page.py`, `test_foreign_note.py`, `test_about_page.py`.

---

### Task 1: Canned queries for the front page

**Files:**
- Modify: `datasette.yml` (add after `top_airports`, before `destinations`)
- Test: `tests/test_home_queries.py`

**Interfaces:**
- Produces:
  - `busiest_airports(:year)` → rows `origin, origin_city_name, total_passengers`, US and territories only (`origin_wac` 1–93), passengers > 0, top 100 by passengers then code.
  - `carrier_concentration` → rows `year, top4, top10, carriers`. Shares are fractions of 1; carriers ranked by passengers then `airline_id`.
  - `top_carriers(:year)` → up to 4 rows `airline_id, airline_name, share`.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_home_queries.py
import pytest

from tests.helpers import get_json
from tests.test_rollup_queries import put


def apt(year, origin, city, wac, passengers):
    return dict(year=year, origin=origin, origin_city_name=city, origin_wac=wac, deps=1, seats=1, passengers=passengers, freight=0)


def carrier(year, airline_id, passengers, domestic=1):
    return dict(year=year, airline_id=airline_id, group_id=airline_id, group_name=airline_id, domestic=domestic, service_class="F",
                deps=1, seats=1, passengers=passengers, freight=0)


def test_busiest_airports_are_us_only_and_ordered_by_passengers(ds, db_path):
    put(db_path, "airport_year_totals", [
        apt(2025, "ATL", "Atlanta, GA", 34, 500), apt(2025, "DFW", "Dallas/Fort Worth, TX", 74, 400),
        apt(2025, "LHR", "London, United Kingdom", 493, 900), apt(2025, "SJU", "San Juan, PR", 3, 400),
        apt(2025, "XXX", "Nowhere, TX", 74, 0), apt(2024, "ORD", "Chicago, IL", 41, 999)])
    rows = get_json(ds, "/t100/busiest_airports.json?_shape=objects&year=2025")["rows"]
    assert [(r["origin"], r["total_passengers"]) for r in rows] == [("ATL", 500), ("DFW", 400), ("SJU", 400)]
    assert rows[0]["origin_city_name"] == "Atlanta, GA"


def test_carrier_concentration_sums_each_airline_and_ranks_ties_by_id(ds, db_path):
    # five airlines; A is split across domestic and international and must be summed first
    put(db_path, "carrier_group_year", [
        carrier(2025, "A", 30), carrier(2025, "A", 10, domestic=0), carrier(2025, "B", 20), carrier(2025, "C", 20),
        carrier(2025, "D", 10), carrier(2025, "E", 10), carrier(2024, "A", 50), carrier(2024, "B", 50)])
    rows = get_json(ds, "/t100/carrier_concentration.json?_shape=objects")["rows"]
    assert [r["year"] for r in rows] == [2024, 2025]
    assert rows[0]["top4"] == pytest.approx(1.0) and rows[0]["carriers"] == 2
    # 2025: total 100; top four are A 40, B 20, C 20, then D 10 (D beats E on id)
    assert rows[1]["top4"] == pytest.approx(0.9) and rows[1]["top10"] == pytest.approx(1.0) and rows[1]["carriers"] == 5


def test_top_carriers_names_the_top_four_with_their_shares(ds, db_path):
    put(db_path, "carrier_group_year", [carrier(2025, x, p) for x, p in [("19393", 40), ("19805", 30), ("19790", 15), ("19977", 10), ("1", 5)]])
    put(db_path, "carrier_group", [dict(airline_id="19393", group_id="19393", group_name="Southwest", airline_name="Southwest Airlines Co.")])
    rows = get_json(ds, "/t100/top_carriers.json?_shape=objects&year=2025")["rows"]
    assert [r["airline_id"] for r in rows] == ["19393", "19805", "19790", "19977"]
    assert rows[0]["airline_name"] == "Southwest Airlines Co." and rows[1]["airline_name"] == "19805"
    assert rows[0]["share"] == pytest.approx(0.4)
```

- [ ] **Step 2: Run them to verify they fail**

Run: `uv run pytest tests/test_home_queries.py -q`
Expected: 3 failed. Each `get_json` assertion fails with a 404 for the unknown query.

- [ ] **Step 3: Add the queries to `datasette.yml`**

Insert after the `top_airports` block (keep the same 6-space indentation as the other query names):

```yaml
      # the front page map: the 100 busiest US airports by passengers in one year (column named as the chooser's)
      busiest_airports:
        sql: |
          SELECT origin, origin_city_name, passengers AS total_passengers
          FROM airport_year_totals
          WHERE year = CAST(:year AS integer)
            AND origin_wac BETWEEN 1 AND 93
            AND passengers > 0
          ORDER BY passengers DESC, origin
          LIMIT 100

      # the front page airline story: the share of all passengers carried by the four and ten biggest
      # reporting carriers each year (operating carriers, so regional partners count on their own)
      carrier_concentration:
        sql: |
          WITH totals AS (
            SELECT year, airline_id, SUM(passengers) AS passengers
            FROM carrier_group_year
            GROUP BY year, airline_id
            HAVING SUM(passengers) > 0
          ), ranked AS (
            SELECT year, passengers,
              ROW_NUMBER() OVER (PARTITION BY year ORDER BY passengers DESC, airline_id) AS rank,
              SUM(passengers) OVER (PARTITION BY year) AS total
            FROM totals
          )
          SELECT year,
            1.0 * SUM(CASE WHEN rank <= 4 THEN passengers ELSE 0 END) / MAX(total) AS top4,
            1.0 * SUM(CASE WHEN rank <= 10 THEN passengers ELSE 0 END) / MAX(total) AS top10,
            COUNT(*) AS carriers
          FROM ranked
          GROUP BY year
          ORDER BY year

      top_carriers:
        sql: |
          WITH totals AS (
            SELECT airline_id, SUM(passengers) AS passengers
            FROM carrier_group_year
            WHERE year = CAST(:year AS integer)
            GROUP BY airline_id
          )
          SELECT t.airline_id, COALESCE(g.airline_name, t.airline_id) AS airline_name,
            1.0 * t.passengers / (SELECT SUM(passengers) FROM totals) AS share
          FROM totals AS t
          LEFT JOIN carrier_group AS g ON g.airline_id = t.airline_id
          ORDER BY t.passengers DESC, t.airline_id
          LIMIT 4
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `uv run pytest tests/test_home_queries.py -q`
Expected: 3 passed.

- [ ] **Step 5: Check the queries against the real database**

Run: `sqlite3 t100.db "SELECT COUNT(*) FROM airport_year_totals WHERE year=2025 AND origin_wac BETWEEN 1 AND 93 AND passengers>0"`
Expected: a number above 100, so `LIMIT 100` bites.

Run: `uv run datasette t100.db --config datasette.yml --get "/t100/carrier_concentration.json?_shape=array" | python3 -c "import json,sys;r=json.load(sys.stdin);print(r[0]['year'],round(r[0]['top4'],3),r[-1]['year'],round(r[-1]['top4'],3))"`
Expected: `1990 0.506 2025 0.587`

- [ ] **Step 6: Commit**

```bash
git add datasette.yml tests/test_home_queries.py
git commit -m "Front page queries: busiest airports, carrier concentration and top carriers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0191mnN3iPgFXTdJ7jQemcY1"
```

---

### Task 2: Story functions

**Files:**
- Modify: `plugins/t100_globe.py` (add a block of pure functions after `is_foreign`)
- Test: `tests/test_home_stories.py`

**Interfaces:**
- Consumes: the row shapes from Task 1, plus `engines_by_year` rows (`year, aircraft_group` as text, `distance_band, service, kind, deps, …`).
- Produces (all pure, all return `None` when their data is missing):
  - `airport_story(rows) -> {"airports": [{"code", "city", "passengers"}] * 3} | None`, where `passengers` is a string such as `"51.5 million"`;
  - `engine_story(rows, first, last) -> {"first_year", "last_year", "first_tri_quad", "last_twin"} | None`, with percentages as strings such as `"81%"`;
  - `concentration_story(rows, first, last) -> {"first_year", "first", "low_year", "low", "last_year", "last"} | None`, where `low_year` is `None` when the lowest year is an end year;
  - `carrier_shares(rows) -> [{"name", "share"}] | None`, where `share` is like `"15.4%"`;
  - `short_airline_name(name) -> str`.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_home_stories.py
from plugins.t100_globe import airport_story, carrier_shares, concentration_story, engine_story, short_airline_name


def test_airport_story_names_the_top_three():
    rows = [dict(origin=c, origin_city_name=f"{c} city", total_passengers=p) for c, p in [("ATL", 51_508_668), ("DFW", 41_309_075), ("ORD", 40_755_119), ("DEN", 1)]]
    story = airport_story(rows)
    assert [a["code"] for a in story["airports"]] == ["ATL", "DFW", "ORD"]
    assert story["airports"][0] == {"code": "ATL", "city": "ATL city", "passengers": "51.5 million"}


def eng(year, group, band, deps, kind="passenger"):
    return dict(year=year, aircraft_group=group, distance_band=band, service="international", kind=kind, deps=deps)


def test_engine_story_uses_long_haul_passenger_departures():
    rows = [eng(1990, "6", 3000, 19), eng(1990, "8", 5000, 55), eng(1990, "7", 3000, 26), eng(1990, "6", 1500, 1000),
            eng(1990, "8", 3000, 500, kind="freight"), eng(2025, "6", 3000, 94), eng(2025, "8", 5000, 6)]
    assert engine_story(rows, 1990, 2025) == {"first_year": 1990, "last_year": 2025, "first_tri_quad": "81%", "last_twin": "94%"}


def test_concentration_story_finds_the_dip():
    rows = [dict(year=y, top4=s) for y, s in [(1990, 0.506), (2005, 0.421), (2006, 0.43), (2025, 0.587)]]
    assert concentration_story(rows, 1990, 2025) == {
        "first_year": 1990, "first": "51%", "low_year": 2005, "low": "42%", "last_year": 2025, "last": "59%"}


def test_concentration_story_without_a_dip_has_no_low_year():
    rows = [dict(year=y, top4=s) for y, s in [(1990, 0.4), (2000, 0.5), (2025, 0.6)]]
    assert concentration_story(rows, 1990, 2025)["low_year"] is None


def test_carrier_shares_shorten_names():
    rows = [dict(airline_id="19393", airline_name="Southwest Airlines Co.", share=0.1542),
            dict(airline_id="19805", airline_name="American Airlines Inc.", share=0.151)]
    assert carrier_shares(rows) == [{"name": "Southwest Airlines", "share": "15.4%"}, {"name": "American Airlines", "share": "15.1%"}]


def test_short_airline_name_drops_legal_endings_only():
    assert short_airline_name("Delta Air Lines Inc.") == "Delta Air Lines"
    assert short_airline_name("Trans World Airways LLC") == "Trans World Airways"
    assert short_airline_name("SkyWest Airlines Inc.") == "SkyWest Airlines"
    assert short_airline_name("Allegiant Air") == "Allegiant Air"


def test_stories_with_a_missing_year_are_none():
    assert airport_story([]) is None
    assert airport_story([dict(origin="ATL", origin_city_name="Atlanta, GA", total_passengers=1)]) is None
    assert engine_story([eng(1990, "6", 3000, 1)], 1990, 2026) is None
    assert concentration_story([dict(year=1990, top4=0.5)], 1990, 2026) is None
    assert carrier_shares([]) is None
```

- [ ] **Step 2: Run them to verify they fail**

Run: `uv run pytest tests/test_home_stories.py -q`
Expected: an error collecting the file, `ImportError: cannot import name 'airport_story'`.

- [ ] **Step 3: Implement the functions in `plugins/t100_globe.py`, after `is_foreign`**

```python
# --- front page stories: rows from the canned queries -> the numbers the prose quotes, or None without data

def percent(fraction, places=0):
    return f"{fraction * 100:.{places}f}%"


def airport_story(rows):
    """busiest_airports rows (busiest first) -> the top three airports."""
    if len(rows) < 3:
        return None
    return {"airports": [{"code": r["origin"], "city": r["origin_city_name"], "passengers": f"{r['total_passengers'] / 1e6:.1f} million"}
                         for r in rows[:3]]}


def engine_shares(rows, year):
    """Shares of passenger departures on flights of 3,000 miles or more by BTS aircraft group (6 twin, 7 tri, 8 quad)."""
    deps = {}
    for r in rows:
        if r["year"] == year and r["kind"] == "passenger" and r["distance_band"] >= 3000:
            group = str(r["aircraft_group"])
            deps[group] = deps.get(group, 0) + r["deps"]
    total = sum(deps.values())
    if not total:
        return None
    return {"twin": deps.get("6", 0) / total, "tri_quad": (deps.get("7", 0) + deps.get("8", 0)) / total}


def engine_story(rows, first, last):
    """engines_by_year rows -> how much of the long haul tri- and quad-jets flew in the first year, and twins in the last."""
    a, b = engine_shares(rows, first), engine_shares(rows, last)
    if not a or not b:
        return None
    return {"first_year": first, "last_year": last, "first_tri_quad": percent(a["tri_quad"]), "last_twin": percent(b["twin"])}


def concentration_story(rows, first, last):
    """carrier_concentration rows -> the top-four share at each end and at its lowest year in between (None if that is an end)."""
    shares = {r["year"]: r["top4"] for r in rows}
    if first not in shares or last not in shares:
        return None
    low_year = min(shares, key=lambda y: (shares[y], y))
    dip = low_year not in (first, last)
    return {"first_year": first, "first": percent(shares[first]), "low_year": low_year if dip else None,
            "low": percent(shares[low_year]) if dip else None, "last_year": last, "last": percent(shares[last])}


LEGAL_ENDING = re.compile(r"[\s,]+(?:Inc\.?|Co\.?|LLC|L\.L\.C\.|Corp\.?|Corporation|Ltd\.?)$")


def short_airline_name(name):
    """"Southwest Airlines Co." -> "Southwest Airlines": BTS's legal names without the legal ending."""
    previous = None
    while previous != name:
        previous, name = name, LEGAL_ENDING.sub("", name).strip()
    return name


def carrier_shares(rows):
    """top_carriers rows -> short names and one-decimal shares."""
    if not rows:
        return None
    return [{"name": short_airline_name(r["airline_name"]), "share": percent(r["share"], 1)} for r in rows]
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `uv run pytest tests/test_home_stories.py -q`
Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add plugins/t100_globe.py tests/test_home_stories.py
git commit -m "Front page stories: turn query rows into the numbers the prose quotes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0191mnN3iPgFXTdJ7jQemcY1"
```

---

### Task 3: Routes, the front page template and the table's move

**Files:**
- Modify: `plugins/t100_globe.py` (routes, `airports_index`, `globe_page`, `landing_page` → `home_page`, new `canned`)
- Rename: `templates/landing.html` → `templates/airports.html`
- Create: `templates/home.html`, `static/home/style.css`
- Modify: `static/landing/style.css`, `static/nav/main.js`, `static/nav/src/state.js`, `static/nav/test/state.test.js`
- Tests: create `tests/test_home_page.py`; update `tests/test_landing_page.py`, `test_nav.py`, `test_redirects.py`, `test_routes_page.py`, `test_globe_page.py`, `test_foreign_note.py`, `test_about_page.py`

**Interfaces:**
- Consumes: Task 1 queries, Task 2 functions.
- Produces:
  - `home.html` element ids that Task 5 and Task 6 draw into: `usa-map` (canvas), `map-box`, `map-tip`, `map-status`, `engine-chart`, `concentration-chart`;
  - `body` `data-min-year` and `data-max-year`;
  - the CSS class `.section`;
  - the CSS custom property `--rule`.

- [ ] **Step 1: Write the failing Python tests**

Create `tests/test_home_page.py`:

```python
import re

from tests.helpers import get
from tests.test_home_queries import apt, carrier
from tests.test_home_stories import eng
from tests.test_rollup_queries import put


def load(db_path):
    put(db_path, "airport_year_totals", [apt(2025, "ATL", "Atlanta, GA", 34, 51_508_668), apt(2025, "DFW", "Dallas/Fort Worth, TX", 74, 41_309_075),
                                         apt(2025, "ORD", "Chicago, IL", 41, 40_755_119)])
    put(db_path, "aircraft_group_band_year", [
        dict(year=y, aircraft_group=g, distance_band=3000, domestic=0, service_class="F", deps=d, seats=0, passengers=0, freight=0)
        for y, g, d in [(1990, "6", 19), (1990, "8", 81), (2025, "6", 94), (2025, "8", 6)]])
    put(db_path, "carrier_group_year", [carrier(1990, "A", 50), carrier(1990, "B", 50), carrier(2025, "A", 60), carrier(2025, "B", 40)])
    put(db_path, "carrier_group", [dict(airline_id="A", group_id="A", group_name="A", airline_name="Alpha Airlines Inc.")])


def test_home_page_tells_the_three_stories(ds, db_path):
    load(db_path)
    html = get(ds, "/").text
    assert [h for h in re.findall(r"<h2[^>]*>([^<]*)</h2>", html)] == ["Airports", "Aircraft", "Airlines"]
    assert "Atlanta, GA (ATL)" in html and "51.5 million" in html and "Chicago, IL (ORD)" in html
    assert "81%" in html and "94%" in html
    assert "Alpha Airlines 60.0%" in html
    for href in ["/airports", "/airports/globe", "/aircraft/engines", "/aircraft", "/airlines", "/about"]:
        assert f'href="{href}"' in html, href
    assert "/static/home/main.js" in html and 'data-max-year="2025"' in html
    assert html.count('class="section"') == 3


def test_home_page_without_data_still_renders(ds):
    r = get(ds, "/")
    assert r.status_code == 200
    assert "million" not in r.text and "Airlines" in r.text and 'href="/airlines"' in r.text


def test_root_with_table_params_redirects_to_airports(ds):
    r = get(ds, "/?year=2019&sort=deps")
    assert r.status_code == 301 and r.headers["location"] == "/airports?year=2019&sort=deps"
    assert get(ds, "/?sort=seats").headers["location"] == "/airports?sort=seats"
    assert get(ds, "/?theme=night").status_code == 200
```

Replace `tests/test_landing_page.py` with:

```python
from tests.helpers import get


def test_airports_is_the_busiest_airports_table_with_the_configured_year_range(ds):
    r = get(ds, "/airports")
    assert r.status_code == 200
    assert 'data-min-year="1990"' in r.text and 'data-max-year="2025"' in r.text
    assert "/static/landing/main.js" in r.text and 'id="airports"' in r.text
    assert 'href="/airports/globe"' in r.text


def test_root_is_no_longer_the_table(ds):
    assert "/static/landing/main.js" not in get(ds, "/").text


def test_datasette_index_is_still_reachable(ds):
    r = get(ds, "/-/")
    assert r.status_code == 200 and "data-min-year" not in r.text
    assert get(ds, "/.json").status_code == 200
```

Then edit the existing tests:

`tests/test_redirects.py`: add these entries to the end of the `OLD` list:

```python
    ("/globe", "/airports/globe"),
    ("/globe?year=2020&theme=night", "/airports/globe?year=2020&theme=night"),
    ("/routes", "/airports"),
    ("/routes?theme=night", "/airports?theme=night"),
```

Replace `test_old_routes_index_goes_to_the_landing_page` and `test_the_all_airports_globe_keeps_its_place` with:

```python
def test_the_all_airports_globe_lives_under_airports(ds):
    assert get(ds, "/airports/globe").status_code == 200
```

`tests/test_routes_page.py`: replace `test_airports_index_goes_to_the_landing_page_keeping_the_query` with:

```python
def test_airports_index_is_the_table(ds):
    r = get(ds, "/airports?theme=night")
    assert r.status_code == 200 and 'id="airports"' in r.text
```

In `test_globe_page_links_to_routes_over_time`, change `get(ds, "/globe")` to `get(ds, "/airports/globe")`.

`tests/test_globe_page.py`: in `test_no_airport_shows_chooser_page`, change `"/globe"` to `"/airports/globe"`.

`tests/test_foreign_note.py`: in `test_globe_page_flags_foreign_airports_and_not_the_chooser`, change `get(ds, "/globe")` to `get(ds, "/airports/globe")`.

`tests/test_nav.py`: replace `test_globe_trails`' first assertion with:

```python
    assert crumbs(ds, "/airports/globe") == [("t100.husk.org", "/"), ("airports", "/airports"), ("globe", None)]
```

Add:

```python
def test_airports_table_trail(ds):
    assert crumbs(ds, "/airports") == [("t100.husk.org", "/"), ("airports", None)]
```

Change the path list in `test_every_page_has_one_theme_chooser_and_the_shared_scripts` to:

```python
["/", "/airports", "/airports/globe", "/airports/ATL/globe", "/airports/ATL", "/airports/ATL/LAX"]
```

`tests/test_about_page.py`: in the `test_caveats_link_to_the_matching_section` parameters, change `("/", "measures")` to `("/airports", "measures")`. `test_landing_page_links_to_about_in_its_prose` keeps `/`, because the front page intro links to `/about`.

- [ ] **Step 2: Write the failing nav test**

In `static/nav/test/state.test.js`, after the line `assert.equal(targetOf('/airports/ATL/globe'), 'globe');`, add:

```js
  assert.equal(targetOf('/airports/globe'), 'globe');
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `uv run pytest -q 2>&1 | tail -15`
Expected: failures in `test_home_page.py`, `test_landing_page.py`, `test_redirects.py` (the `/globe` and `/routes` entries), `test_routes_page.py`, `test_globe_page.py`, `test_foreign_note.py`, `test_nav.py` and `test_about_page.py` (`/airports` measures). Every other test passes.

Run: `npm test 2>&1 | grep -E "^# (pass|fail)"`
Expected: `# fail 1`, from `targetOf('/airports/globe')` returning `'routes'`.

- [ ] **Step 4: Fix `targetOf` in `static/nav/src/state.js`**

Replace the globe line:

```js
  if (path === '/globe' || path === '/airports/globe' || /^\/airports\/[^/]+\/globe$/.test(path)) return 'globe';
```

- [ ] **Step 5: Change the routes and handlers in `plugins/t100_globe.py`**

In `register_routes()`:
- replace `(r"^/$", landing_page),` with `(r"^/$", home_page),`;
- add `(r"^/airports/globe$", globe_page),` directly after the `/airports$` line. It must come before the `{CODE}` routes for readability; it can't clash, because `globe` is five characters;
- replace `(r"^/globe$", globe_page),` with `(r"^/globe$", moved("/airports/globe")),`, and move it into the "paths the site used before" group;
- replace `(r"^/routes$", airports_index),` with `(r"^/routes$", moved("/airports")),`.

Replace `airports_index` and `landing_page` with:

```python
def year_range(datasette):
    config = datasette.plugin_config("t100_globe") or {}
    return config.get("min_year", 1990), config.get("max_year", 2025)


async def airports_index(datasette, request):
    """The busiest-airports table, which was the front page before the front page told stories."""
    min_year, max_year = year_range(datasette)
    html = await datasette.render_template(
        "airports.html",
        {"min_year": min_year, "max_year": max_year, "crumbs": trail(datasette, ("airports", None))},
        request=request,
    )
    return Response.html(html)


async def canned(datasette, name, params=None):
    """Rows of one of datasette.yml's canned queries as dicts, so the prose quotes the same numbers the charts fetch."""
    sql = datasette.config["databases"]["t100"]["queries"][name]["sql"]
    result = await datasette.get_database("t100").execute(sql, params or {})
    return [dict(row) for row in result.rows]


# the busiest-airports table's settings; the front page used to be that table
TABLE_PARAMS = ("year", "sort")


async def home_page(datasette, request):
    if any(request.args.get(key) is not None for key in TABLE_PARAMS):
        return Response.redirect(f"/airports?{request.query_string}", status=301)
    min_year, max_year = year_range(datasette)
    html = await datasette.render_template(
        "home.html",
        {
            "min_year": min_year,
            "max_year": max_year,
            "crumbs": trail(datasette),
            "airports": airport_story(await canned(datasette, "busiest_airports", {"year": max_year})),
            "engines": engine_story(await canned(datasette, "engines_by_year"), min_year, max_year),
            "concentration": concentration_story(await canned(datasette, "carrier_concentration"), min_year, max_year),
            "carriers": carrier_shares(await canned(datasette, "top_carriers", {"year": max_year})),
        },
        request=request,
    )
    return Response.html(html)
```

In `globe_page`, change the no-origin trail from `[("globe", None)]` to `[("airports", "/airports"), ("globe", None)]`.

`about_page` can use `year_range` too, but leave it unchanged.

- [ ] **Step 6: Move the table's template**

Run: `git mv templates/landing.html templates/airports.html`

In `templates/airports.html`:
- change the `<title>` to `Busiest airports, {{ min_year }}–{{ max_year }} · T-100`;
- change the `<h1>` to `Busiest US airports`;
- replace the whole `<p class="intro">…</p>` with:

```html
    <p class="intro">
      The busiest US airports in any year since {{ min_year }}, by passengers, departures, seats or freight.
      Pick one to see where it flies and how its routes changed, or <a href="/airports/globe">browse them on the map</a>.
    </p>
```

- change the `noscript`'s `href="/globe"` to `href="/airports/globe"`.

- [ ] **Step 7: Add the rule style**

In `static/landing/style.css`:
- add `--rule:#999;` to the `:root` line, after `--line:#ddd9d0;`;
- append:

```css
/* a 1px rule above each section, its heading directly beneath (the husk.org/labs pattern) */
.section { border-top:1px solid var(--rule); margin:36px 0 0; padding:4px 0 0; }
.section > h2 { margin:0 0 8px; }
```

In `static/nav/main.js` `paint()`, after the `--line` line, add:

```js
  root.setProperty('--rule', `color-mix(in srgb, ${t.ui.fg} 45%, ${t.bg})`);
```

- [ ] **Step 8: Create `templates/home.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>US air traffic, {{ min_year }}–{{ max_year }} · T-100</title>
  <link rel="stylesheet" href="/static/landing/style.css">
  <link rel="stylesheet" href="/static/home/style.css">
  <link rel="stylesheet" href="/static/nav/style.css">
  <script type="module" src="/static/nav/main.js"></script>
</head>
<body data-min-year="{{ min_year }}" data-max-year="{{ max_year }}">
  <main>
    {% include "_nav.html" %}
    <h1>US air traffic, {{ min_year }}–{{ max_year }}</h1>
    <p class="intro">
      Every scheduled and charter flight to, from and within the United States since {{ min_year }}, as reported by airlines to the
      Department of Transportation: who flew it, between which airports, on what aircraft, and how many people and how much freight it carried.
      <a href="/about">What the numbers mean</a>.
    </p>

    <section class="section" aria-labelledby="airports-heading">
      <h2 id="airports-heading">Airports</h2>
      {% if airports %}{% set a = airports.airports %}
      <p class="story">The busiest airport in {{ max_year }} was {{ a[0].city }} ({{ a[0].code }}), where {{ a[0].passengers }} passengers boarded,
        ahead of {{ a[1].city }} ({{ a[1].code }}) and {{ a[2].city }} ({{ a[2].code }}).</p>
      {% endif %}
      <div class="graphic map-box" id="map-box">
        <canvas id="usa-map" aria-label="Map of the busiest US airports in {{ max_year }}"></canvas>
        <div id="map-tip" class="map-tip" hidden></div>
        <p id="map-status" class="graphic-status">Loading map…</p>
      </div>
      <p class="more"><a href="/airports">All airports →</a> · <a href="/airports/globe">Explore the map →</a></p>
    </section>

    <section class="section" aria-labelledby="aircraft-heading">
      <h2 id="aircraft-heading">Aircraft</h2>
      {% if engines %}
      <p class="story">In {{ engines.first_year }}, {{ engines.first_tri_quad }} of flights of 3,000 miles or more were flown by jets with three or four engines:
        747s, DC-10s, TriStars. In {{ engines.last_year }} twin-engined jets flew {{ engines.last_twin }} of them.</p>
      {% endif %}
      <div class="graphic chart-box" id="engine-chart"><p class="graphic-status">Loading chart…</p></div>
      <p class="more"><a href="/aircraft/engines">The long-haul story →</a> · <a href="/aircraft">All aircraft →</a></p>
    </section>

    <section class="section" aria-labelledby="airlines-heading">
      <h2 id="airlines-heading">Airlines</h2>
      {% if concentration %}{% set c = concentration %}
      <p class="story">In {{ c.first_year }} the four biggest airlines carried {{ c.first }} of all passengers.
        {% if c.low_year %}As Southwest and other low-cost airlines grew, that fell to {{ c.low }} by {{ c.low_year }}; after a run of mergers it was {{ c.last }} in {{ c.last_year }}.
        {% else %}By {{ c.last_year }} it was {{ c.last }}.{% endif %}</p>
      {% endif %}
      <div class="graphic chart-box" id="concentration-chart"><p class="graphic-status">Loading chart…</p></div>
      {% if carriers %}<p class="story">The biggest in {{ max_year }}:
        {% for x in carriers %}{{ x.name }} {{ x.share }}{% if not loop.last %}, {% endif %}{% endfor %}.</p>{% endif %}
      <p class="more"><a href="/airlines">All airlines →</a></p>
    </section>

    <p class="note">
      Map: the 100 busiest US airports by passengers in {{ max_year }}; Guam, Saipan and American Samoa are not shown.
      Long haul means flights of 3,000 miles or more, counted by departures.
      T-100 counts the airline that operates each flight. Regional airlines such as SkyWest fly many flights sold under the big brands' names,
      so those brands' real reach is larger than the airline chart shows. <a href="/about">More about the data</a>.
    </p>
  </main>
  <script src="/static/globe/vendor/d3-array.min.js"></script>
  <script src="/static/globe/vendor/d3-geo.min.js"></script>
  <script src="/static/globe/vendor/topojson-client.min.js"></script>
  <script type="module" src="/static/home/main.js"></script>
</body>
</html>
```

Note: `/static/home/main.js` doesn't exist until Task 5. The page renders anyway, because the script simply 404s.

- [ ] **Step 9: Create `static/home/style.css`**

```css
.story { max-width:42em; margin:0 0 8px; }
.more { font-size:14px; margin:8px 0 0; }
/* each graphic leaves room on screen for the next section to show */
.graphic { position:relative; margin:12px 0 0; }
.map-box { height:min(500px, 66vh); }
.chart-box { min-height:min(380px, 66vh); }
#usa-map { display:block; width:100%; height:100%; cursor:default; }
#usa-map.pointing { cursor:pointer; }
.graphic-status { color:var(--muted); font-size:13px; margin:0; }
.map-box .graphic-status { position:absolute; left:0; top:0; }
.map-tip { position:absolute; pointer-events:none; z-index:2; padding:4px 8px; border-radius:6px; font-size:12px; white-space:nowrap;
  background:var(--bg); color:var(--fg); border:1px solid var(--line); box-shadow:0 2px 8px rgba(0,0,0,.2); }
.map-tip[hidden] { display:none; }
.chart-box figure { margin:0; }
.chart-box svg { --plot-background: var(--bg); }
```

- [ ] **Step 10: Run all the tests**

Run: `uv run pytest -q 2>&1 | tail -5`
Expected: all pass.

Run: `npm test 2>&1 | grep -E "^# (pass|fail)"`
Expected: `# fail 0`.

If `test_globe_page_links_to_routes_over_time`'s `"/airports/" not in …` assertion fails on `/airports/globe`, check where the string comes from. The breadcrumb `href="/airports"` has no trailing slash. A real airport link on the chooser page would be a regression.

- [ ] **Step 11: Commit**

```bash
git add -A plugins/t100_globe.py templates/home.html templates/airports.html templates/landing.html static/home/style.css \
  static/landing/style.css static/nav tests
git commit -m "Front page tells three stories; the busiest-airports table moves to /airports and the map chooser to /airports/globe

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0191mnN3iPgFXTdJ7jQemcY1"
```

---

### Task 4: The US projection with a Puerto Rico inset

**Files:**
- Create: `static/globe/src/usamap.js`, `static/globe/test/d3.js`, `static/globe/test/usamap.test.js`
- Create: `static/globe/vendor/states-10m.json`, downloaded from `https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/states-10m.json`
- Modify: `static/globe/vendor/README.md`

**Interfaces:**
- Produces:
  - `geoAlbersUsaTerritories(d3)` → a projection function `([lon, lat]) => [x, y] | null`, with `.invert`, `.stream`, `.scale`, `.translate`, `.fitSize([w, h], margin = 8)` and `.insetFrames()` (an array of `[[x0, y0], [x1, y1]]` pixel boxes);
  - the `INSETS` constant;
  - `loadD3()` (test-only) → the d3 namespace from the vendored UMD files.

- [ ] **Step 1: Vendor the US outline**

Run:
```bash
curl -sL -o static/globe/vendor/states-10m.json https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/states-10m.json
python3 -I -c "import json;d=json.load(open('static/globe/vendor/states-10m.json'));print(sorted(d['objects']), len(d['objects']['states']['geometries']))"
```
Expected: `['nation', 'states'] 56`

Add a row to the table in `static/globe/vendor/README.md`:

```
| states-10m.json | https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/states-10m.json (US Census cartographic boundaries, states and territories) | ISC |
```

- [ ] **Step 2: Write the test helper and the failing tests**

`static/globe/test/d3.js`:

```js
// The vendored d3 builds are browser scripts (UMD) that set a global d3; run them in a sandbox for tests.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export function loadD3() {
  const ctx = vm.createContext({});
  for (const f of ['d3-array.min.js', 'd3-geo.min.js']) {
    vm.runInContext(readFileSync(new URL(`../vendor/${f}`, import.meta.url), 'utf8'), ctx);
  }
  return ctx.d3;
}
```

`static/globe/test/usamap.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadD3 } from './d3.js';
import { geoAlbersUsaTerritories, INSETS } from '../src/usamap.js';

const d3 = loadD3();
const W = 910;
const H = 476;
const proj = geoAlbersUsaTerritories(d3).fitSize([W, H], 0);
const AIRPORTS = { ATL: [-84.43, 33.64], BOS: [-71.0, 42.36], ANC: [-149.99, 61.17], HNL: [-157.92, 21.32], SJU: [-66.0, 18.44], STT: [-64.97, 18.34], GUM: [144.8, 13.48] };

// which inset box (in lower-48 units) a pixel falls in
function insetOf([x, y]) {
  const k = proj.scale();
  const [tx, ty] = proj.translate();
  const u = (x - tx) / k;
  const v = (y - ty) / k;
  for (const [name, [[x0, y0], [x1, y1]]] of Object.entries(INSETS)) if (u >= x0 && u < x1 && v >= y0 && v < y1) return name;
  return 'lower48';
}

test('airports land in the right part of the map', () => {
  assert.equal(insetOf(proj(AIRPORTS.ATL)), 'lower48');
  assert.equal(insetOf(proj(AIRPORTS.BOS)), 'lower48');
  assert.equal(insetOf(proj(AIRPORTS.ANC)), 'alaska');
  assert.equal(insetOf(proj(AIRPORTS.HNL)), 'hawaii');
  assert.equal(insetOf(proj(AIRPORTS.SJU)), 'caribbean');
  assert.equal(insetOf(proj(AIRPORTS.STT)), 'caribbean');
});

test('projects GUM to null', () => {
  assert.equal(proj(AIRPORTS.GUM), null);
});

test('everything it places is inside the fitted size', () => {
  for (const [code, ll] of Object.entries(AIRPORTS)) {
    const p = proj(ll);
    if (!p) continue;
    assert.ok(p[0] >= 0 && p[0] <= W && p[1] >= 0 && p[1] <= H, `${code} at ${p}`);
  }
});

test('invert round-trips a point in each part', () => {
  for (const code of ['ATL', 'ANC', 'HNL', 'SJU']) {
    const back = proj.invert(proj(AIRPORTS[code]));
    assert.ok(Math.abs(back[0] - AIRPORTS[code][0]) < 1e-6 && Math.abs(back[1] - AIRPORTS[code][1]) < 1e-6, code);
  }
});

test('fitSize scales to the tighter side and centres', () => {
  const p = geoAlbersUsaTerritories(d3).fitSize([400, 600], 10);
  assert.ok(Math.abs(p.scale() - 380 / 0.91) < 1e-9);
  assert.deepEqual(p.translate(), [200, 300]);
  assert.equal(p.insetFrames().length, 3);
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `node --test static/globe/test/usamap.test.js 2>&1 | tail -5`
Expected: it fails with `Cannot find module …/static/globe/src/usamap.js`.

- [ ] **Step 4: Implement `static/globe/src/usamap.js`**

```js
// A composite equal-area projection of the United States: d3.geoAlbersUsa's lower 48, Alaska and Hawaii,
// plus a third inset for Puerto Rico and the US Virgin Islands off the coast east of Florida. It follows
// d3-geo's albersUsa source. Takes the d3 namespace (the vendored UMD build sets window.d3) as an argument.
// Places it has no part for (Guam, Saipan, American Samoa) project to null.
const EPSILON = 1e-6;

// the insets' boxes in units of the lower 48's scale, relative to its translate
export const INSETS = {
  alaska: [[-0.425, 0.120], [-0.214, 0.234]],
  hawaii: [[-0.214, 0.166], [-0.115, 0.234]],
  caribbean: [[0.300, 0.140], [0.440, 0.234]],
};
// the whole map is this many lower-48 units across and down
const WIDTH = 0.91;
const HEIGHT = 0.476;

const inBox = (x, y, [[x0, y0], [x1, y1]]) => x >= x0 && x < x1 && y >= y0 && y < y1;

function multiplex(streams) {
  return {
    point(x, y) { for (const s of streams) s.point(x, y); },
    sphere() { for (const s of streams) s.sphere(); },
    lineStart() { for (const s of streams) s.lineStart(); },
    lineEnd() { for (const s of streams) s.lineEnd(); },
    polygonStart() { for (const s of streams) s.polygonStart(); },
    polygonEnd() { for (const s of streams) s.polygonEnd(); },
  };
}

export function geoAlbersUsaTerritories(d3) {
  const lower48 = d3.geoAlbers();
  const alaska = d3.geoConicEqualArea().rotate([154, 0]).center([-2, 58.5]).parallels([55, 65]);
  const hawaii = d3.geoConicEqualArea().rotate([157, 0]).center([-3, 19.9]).parallels([8, 18]);
  const caribbean = d3.geoMercator().center([-65.9, 18.1]);
  const parts = [lower48, alaska, hawaii, caribbean];
  let point;
  const pointStream = { point(x, y) { point = [x, y]; } };
  let pointStreams = [];
  let cache = null;
  let cacheStream = null;

  // the first part whose clip box takes the point wins
  function projection([lon, lat]) {
    point = null;
    for (const s of pointStreams) {
      s.point(lon, lat);
      if (point) return point;
    }
    return null;
  }

  projection.invert = (coordinates) => {
    const k = lower48.scale();
    const [tx, ty] = lower48.translate();
    const x = (coordinates[0] - tx) / k;
    const y = (coordinates[1] - ty) / k;
    const part = inBox(x, y, INSETS.alaska) ? alaska
      : inBox(x, y, INSETS.hawaii) ? hawaii
        : inBox(x, y, INSETS.caribbean) ? caribbean
          : lower48;
    return part.invert(coordinates);
  };

  projection.stream = (stream) => {
    if (cache && cacheStream === stream) return cache;
    cacheStream = stream;
    cache = multiplex(parts.map((p) => p.stream(stream)));
    return cache;
  };

  const box = ([[x0, y0], [x1, y1]], x, y, k) => [[x + x0 * k + EPSILON, y + y0 * k + EPSILON], [x + x1 * k - EPSILON, y + y1 * k - EPSILON]];

  projection.translate = (t) => {
    if (t === undefined) return lower48.translate();
    const k = lower48.scale();
    const [x, y] = t;
    lower48.translate(t).clipExtent([[x - 0.455 * k, y - 0.238 * k], [x + 0.455 * k, y + 0.238 * k]]);
    alaska.translate([x - 0.307 * k, y + 0.201 * k]).clipExtent(box(INSETS.alaska, x, y, k));
    hawaii.translate([x - 0.205 * k, y + 0.212 * k]).clipExtent(box(INSETS.hawaii, x, y, k));
    caribbean.translate([x + 0.370 * k, y + 0.187 * k]).clipExtent(box(INSETS.caribbean, x, y, k));
    pointStreams = parts.map((p) => p.stream(pointStream));
    cache = null;
    return projection;
  };

  projection.scale = (k) => {
    if (k === undefined) return lower48.scale();
    lower48.scale(k);
    alaska.scale(k * 0.35);
    hawaii.scale(k);
    caribbean.scale(k * 1.5);
    return projection.translate(lower48.translate());
  };

  // fit the whole map, insets included, inside width x height, centred
  projection.fitSize = ([w, h], margin = 8) => {
    projection.scale(Math.max(1, Math.min((w - 2 * margin) / WIDTH, (h - 2 * margin) / HEIGHT)));
    return projection.translate([w / 2, h / 2]);
  };

  // the insets' frames in pixels, for outlining them
  projection.insetFrames = () => {
    const k = lower48.scale();
    const [x, y] = lower48.translate();
    return Object.values(INSETS).map((b) => box(b, x, y, k));
  };

  return projection.scale(1070);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test static/globe/test/usamap.test.js 2>&1 | grep -E "^# (pass|fail)"`
Expected: `# pass 5`, `# fail 0`.

- [ ] **Step 6: Commit**

```bash
git add static/globe/src/usamap.js static/globe/test/d3.js static/globe/test/usamap.test.js static/globe/vendor/states-10m.json static/globe/vendor/README.md
git commit -m "A US map projection with Alaska, Hawaii and Puerto Rico insets, and the us-atlas outline

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0191mnN3iPgFXTdJ7jQemcY1"
```

---

### Task 5: The airports map on the front page

**Files:**
- Create: `static/home/src/map.js`, `static/home/test/map.test.js`, `static/home/main.js`
- Modify: `package.json` (test glob)

**Interfaces:**
- Consumes:
  - `geoAlbersUsaTerritories` (Task 4);
  - the element ids from Task 3: `usa-map`, `map-box`, `map-tip`, `map-status`;
  - `indexAirports` and `placePoints` from `static/globe/src/adapter.js`;
  - `queryUrl` and `fetchRows` from `static/globe/src/api.js`;
  - `THEMES` and `resolveTheme` from `static/globe/src/themes.js`;
  - `colourFor` from `static/globe/src/scale.js`.
- Produces:
  - `radiusFor(passengers, max) -> px`, from 2.5 to 12, proportional by area;
  - `placeOnMap(points, proj) -> {placed: [{...point, x, y, r}], dropped: [code]}`;
  - `hitTest(placed, x, y, slop = 4) -> index | -1`, which prefers the smallest dot that contains the cursor;
  - `drawMap(ctx, scene)`;
  - `MAP_LABELS = 10`;
  - in `main.js`, a `chartHeight()` helper and a `drawCharts` hook that Task 6 fills in.

- [ ] **Step 1: Write the failing tests**

`static/home/test/map.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { radiusFor, placeOnMap, hitTest } from '../src/map.js';

test('radiusFor grows with the square root of passengers between 2.5 and 12px', () => {
  assert.equal(radiusFor(100, 100), 12);
  assert.equal(radiusFor(25, 100), 2.5 + 9.5 * 0.5);
  assert.equal(radiusFor(0, 100), 2.5);
  assert.equal(radiusFor(50, 0), 2.5);
  assert.equal(radiusFor(null, 100), 2.5);
});

test('placeOnMap drops points the projection cannot place', () => {
  const proj = ([lon]) => (lon > 0 ? null : [-lon, 10]);
  const pts = [{ code: 'ATL', pos: [-84, 33], passengers: 100 }, { code: 'GUM', pos: [144, 13], passengers: 50 }];
  const { placed, dropped } = placeOnMap(pts, proj);
  assert.deepEqual(placed.map((p) => [p.code, p.x, p.y, p.r]), [['ATL', 84, 10, 12]]);
  assert.deepEqual(dropped, ['GUM']);
});

test('hitTest picks the smallest dot under the cursor, or -1', () => {
  const placed = [{ x: 0, y: 0, r: 12 }, { x: 5, y: 0, r: 3 }];
  assert.equal(hitTest(placed, 5, 1), 1);
  assert.equal(hitTest(placed, -8, 0), 0);
  assert.equal(hitTest(placed, 40, 40), -1);
});
```

In `package.json`, add `static/home/test/*.test.js` to the end of the `test` script's file list.

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test static/home/test/map.test.js 2>&1 | tail -3`
Expected: it fails with `Cannot find module …/static/home/src/map.js`.

- [ ] **Step 3: Implement `static/home/src/map.js`**

```js
import { colourFor } from '../../globe/src/scale.js';

export const MAP_LABELS = 10;
const R_MIN = 2.5;
const R_MAX = 12;

// dot area in proportion to passengers
export function radiusFor(passengers, max) {
  const v = Math.max(0, Number(passengers) || 0);
  if (!(max > 0)) return R_MIN;
  return R_MIN + (R_MAX - R_MIN) * Math.sqrt(Math.min(1, v / max));
}

// screen positions for points ({code, pos: [lon, lat], passengers}); those the projection can't place are listed by code
export function placeOnMap(points, proj) {
  const max = Math.max(0, ...points.map((p) => Number(p.passengers) || 0));
  const placed = [];
  const dropped = [];
  for (const p of points) {
    const xy = proj(p.pos);
    if (!xy) { dropped.push(p.code); continue; }
    placed.push({ ...p, x: xy[0], y: xy[1], r: radiusFor(p.passengers, max) });
  }
  return { placed, dropped };
}

// the smallest dot within `slop` px of (x, y), so a small airport next to a big one can still be picked
export function hitTest(placed, x, y, slop = 4) {
  let best = -1;
  for (let i = 0; i < placed.length; i++) {
    const p = placed[i];
    if (Math.hypot(p.x - x, p.y - y) <= p.r + slop && (best < 0 || p.r < placed[best].r)) best = i;
  }
  return best;
}

// scene: {w, h, path (d3.geoPath on the context), frames, nation, borders, placed, theme, highlight}
export function drawMap(ctx, { w, h, path, frames, nation, borders, placed, theme: t, highlight = -1 }) {
  ctx.clearRect(0, 0, w, h);
  ctx.beginPath();
  path(nation);
  ctx.fillStyle = t.land;
  ctx.fill();
  ctx.beginPath();
  path(borders);
  ctx.lineWidth = 0.5;
  ctx.strokeStyle = t.coast;
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = t.coast;
  for (const [[x0, y0], [x1, y1]] of frames) ctx.strokeRect(Math.round(x0) + 0.5, Math.round(y0) + 0.5, Math.round(x1 - x0), Math.round(y1 - y0));

  // big dots first so small ones stay visible on top
  const order = placed.map((p, i) => i).sort((a, b) => placed[b].r - placed[a].r);
  for (const i of order) {
    const p = placed[i];
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + (i === highlight ? 1.5 : 0), 0, Math.PI * 2);
    ctx.fillStyle = i === highlight ? t.ui.fg : colourFor('international');
    ctx.globalAlpha = i === highlight ? 1 : 0.75;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;
    ctx.strokeStyle = t.bg;
    ctx.stroke();
  }

  // the busiest airports (placed is busiest first) and the hovered one get their codes
  ctx.font = '600 11px -apple-system, system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = t.ui.fg;
  ctx.lineWidth = 3;
  ctx.strokeStyle = t.bg;
  placed.forEach((p, i) => {
    if (i >= MAP_LABELS && i !== highlight) return;
    ctx.strokeText(p.code, p.x + p.r + 3, p.y);
    ctx.fillText(p.code, p.x + p.r + 3, p.y);
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test static/home/test/map.test.js 2>&1 | grep -E "^# (pass|fail)"`
Expected: `# pass 3`, `# fail 0`.

- [ ] **Step 5: Write `static/home/main.js`**

```js
import { queryUrl, fetchRows } from '/static/globe/src/api.js';
import { indexAirports, placePoints } from '/static/globe/src/adapter.js';
import { THEMES, resolveTheme } from '/static/globe/src/themes.js';
import { geoAlbersUsaTerritories } from '/static/globe/src/usamap.js';
import { placeOnMap, hitTest, drawMap } from './src/map.js';

const $ = (id) => document.getElementById(id);
const minYear = Number(document.body.dataset.minYear);
const maxYear = Number(document.body.dataset.maxYear);
const fmt = (n) => Number(n || 0).toLocaleString('en-US');
// charts leave room on screen for the next section to show
const chartHeight = () => Math.round(Math.min(380, window.innerHeight * 0.66));

function storedTheme() {
  try { return localStorage.getItem('t100-theme'); } catch (e) { return null; }
}
let theme = THEMES[resolveTheme(location.search, storedTheme(), matchMedia('(prefers-color-scheme: dark)').matches)];

function failed(box, what, err) {
  console.error(err);
  box.replaceChildren(Object.assign(document.createElement('p'), { className: 'graphic-status', textContent: `Couldn't load this ${what}.` }));
}

async function loadOutline() {
  const res = await fetch('/static/globe/vendor/states-10m.json');
  if (!res.ok) throw new Error(`Request failed (${res.status}): states-10m.json`);
  const topo = await res.json();
  return {
    nation: window.topojson.feature(topo, topo.objects.nation),
    borders: window.topojson.mesh(topo, topo.objects.states, (a, b) => a !== b),
  };
}

async function showMap() {
  const box = $('map-box');
  const canvas = $('usa-map');
  const tip = $('map-tip');
  const [outline, airportRes, busyRes] = await Promise.all([
    loadOutline(), fetchRows(queryUrl('airports')), fetchRows(queryUrl('busiest_airports', { year: maxYear })),
  ]);
  const points = placePoints(busyRes.rows, indexAirports(airportRes.rows));
  const proj = geoAlbersUsaTerritories(window.d3);
  const ctx = canvas.getContext('2d');
  const path = window.d3.geoPath(proj, ctx);
  let placed = [];
  let highlight = -1;
  let w = 1;
  let h = 1;

  const draw = () => drawMap(ctx, { w, h, path, frames: proj.insetFrames(), ...outline, placed, theme, highlight });
  function layout() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = Math.max(1, r.width);
    h = Math.max(1, r.height);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    proj.fitSize([w, h]);
    ({ placed } = placeOnMap(points, proj));
    highlight = -1;
    draw();
  }

  function pointAt(e) {
    const r = canvas.getBoundingClientRect();
    return hitTest(placed, e.clientX - r.left, e.clientY - r.top);
  }
  canvas.addEventListener('pointermove', (e) => {
    const i = pointAt(e);
    if (i === highlight) return;
    highlight = i;
    canvas.classList.toggle('pointing', i >= 0);
    if (i >= 0) {
      const p = placed[i];
      tip.textContent = `${p.code} · ${p.city} · ${fmt(p.passengers)} passengers`;
      tip.style.left = `${Math.min(p.x + p.r + 6, w - 220)}px`;
      tip.style.top = `${Math.max(0, p.y - 30)}px`;
    }
    tip.hidden = i < 0;
    draw();
  });
  canvas.addEventListener('pointerleave', () => { highlight = -1; tip.hidden = true; canvas.classList.remove('pointing'); draw(); });
  canvas.addEventListener('click', (e) => {
    const i = pointAt(e);
    if (i >= 0) location.href = `/airports/${encodeURIComponent(placed[i].code)}`;
  });
  document.addEventListener('t100:theme', (e) => { theme = THEMES[e.detail.id] || theme; draw(); });
  new ResizeObserver(layout).observe(box);
  $('map-status').remove();
}

// the two charts; filled in by the next task
async function drawCharts() {}

showMap().catch((err) => failed($('map-box'), 'map', err));
drawCharts();
```

- [ ] **Step 6: Run the JS suite and look at the page**

Run: `npm test 2>&1 | grep -E "^# (pass|fail)"`
Expected: `# fail 0`.

Start a fresh server, because Datasette caches static ETags per process. Run this in the background:

`uv run datasette serve t100.db --config datasette.yml --plugins-dir plugins --template-dir templates --static static:static --port 8811`

Take a 1280×900 screenshot of `http://localhost:8811/` with headless Playwright. Use the scratchpad's `shots.py` pattern: `uv run --no-project --with playwright python <script>`.

Expected:
- the map shows the lower 48 with Alaska, Hawaii and a Puerto Rico/Virgin Islands box at the lower right;
- the dots are sized by passengers;
- ATL, DFW, ORD and others are labelled;
- the map is no taller than 500px;
- there are no console errors.

Stop the server afterwards.

- [ ] **Step 7: Commit**

```bash
git add static/home/src/map.js static/home/test/map.test.js static/home/main.js package.json
git commit -m "Front page: a map of the busiest US airports, Puerto Rico inset included

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0191mnN3iPgFXTdJ7jQemcY1"
```

---

### Task 6: The engine and concentration charts

**Files:**
- Create: `static/home/src/concentration.js`, `static/home/test/concentration.test.js`
- Modify: `static/home/main.js` (replace the empty `drawCharts`)

**Interfaces:**
- Consumes:
  - `buildEngineShares`, `ENGINE_SERIES` and `ENGINE_COLORS` from `static/charts/src/rollup.js`;
  - `Plot` from `/static/charts/vendor/plot.js`;
  - `carrier_concentration` (Task 1);
  - `chartHeight` and `failed` from Task 5's `main.js`.
- Produces: `concentrationPoints(rows) -> [{year, series, share}]` and `CONCENTRATION_SERIES = ['Top 4 airlines', 'Top 10 airlines']`.

- [ ] **Step 1: Write the failing test**

`static/home/test/concentration.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { concentrationPoints, CONCENTRATION_SERIES } from '../src/concentration.js';

test('concentrationPoints gives a top-4 and a top-10 point per year, in year order', () => {
  const rows = [{ year: 2025, top4: 0.587, top10: 0.775, carriers: 295 }, { year: '1990', top4: '0.506', top10: 0.823, carriers: 218 }];
  assert.deepEqual(concentrationPoints(rows), [
    { year: 1990, series: CONCENTRATION_SERIES[0], share: 0.506 },
    { year: 1990, series: CONCENTRATION_SERIES[1], share: 0.823 },
    { year: 2025, series: CONCENTRATION_SERIES[0], share: 0.587 },
    { year: 2025, series: CONCENTRATION_SERIES[1], share: 0.775 },
  ]);
});

test('concentrationPoints skips rows without numbers', () => {
  assert.deepEqual(concentrationPoints([{ year: 2000, top4: null, top10: 0.5 }]), [{ year: 2000, series: 'Top 10 airlines', share: 0.5 }]);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test static/home/test/concentration.test.js 2>&1 | tail -3`
Expected: it fails with `Cannot find module …/static/home/src/concentration.js`.

- [ ] **Step 3: Implement `static/home/src/concentration.js`**

```js
export const CONCENTRATION_SERIES = ['Top 4 airlines', 'Top 10 airlines'];

// carrier_concentration rows -> one point per year and series, for a line chart
export function concentrationPoints(rows) {
  const out = [];
  for (const r of rows) {
    const year = Number(r.year);
    for (const [series, key] of [[CONCENTRATION_SERIES[0], 'top4'], [CONCENTRATION_SERIES[1], 'top10']]) {
      if (r[key] === null || r[key] === undefined || r[key] === '') continue;
      out.push({ year, series, share: Number(r[key]) });
    }
  }
  return out.sort((a, b) => a.year - b.year || CONCENTRATION_SERIES.indexOf(a.series) - CONCENTRATION_SERIES.indexOf(b.series));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test static/home/test/concentration.test.js 2>&1 | grep -E "^# (pass|fail)"`
Expected: `# pass 2`, `# fail 0`.

- [ ] **Step 5: Draw the charts in `static/home/main.js`**

Add the imports at the top:

```js
import * as Plot from '/static/charts/vendor/plot.js';
import { buildEngineShares, ENGINE_SERIES, ENGINE_COLORS } from '/static/charts/src/rollup.js';
import { concentrationPoints, CONCENTRATION_SERIES } from './src/concentration.js';
```

Replace `async function drawCharts() {}` with:

```js
const pct = (v) => `${(v * 100).toFixed(1)}%`;
const width = (box) => Math.min(box.clientWidth || 900, 1100);

// the long-haul cut the /aircraft/engines page opens with
const ENGINE_STATE = { measure: 'deps', kind: 'passenger', band: '3000' };

async function showEngines() {
  const box = $('engine-chart');
  const rows = (await fetchRows(queryUrl('engines_by_year'))).rows;
  const res = buildEngineShares(rows, ENGINE_STATE);
  if (!res.points.length) { box.replaceChildren(); return; }
  const data = res.points.map((p) => ({ ...p, title: `${p.series}, ${p.year}\n${pct(p.share)} of long-haul flights` }));
  box.replaceChildren(Plot.plot({
    width: width(box),
    height: chartHeight(),
    marginLeft: 48,
    style: { background: 'transparent', fontSize: '12px' },
    x: { label: null, tickFormat: 'd', domain: [minYear, maxYear] },
    y: { label: 'Share of flights of 3,000 miles or more', tickFormat: '.0%', domain: [0, 1] },
    color: { domain: ENGINE_SERIES, range: ENGINE_COLORS, legend: true },
    marks: [
      Plot.areaY(data, { x: 'year', y: 'share', fill: 'series', order: ENGINE_SERIES, title: 'title', tip: true }),
      Plot.ruleY([0]),
    ],
  }));
}

async function showConcentration() {
  const box = $('concentration-chart');
  const data = concentrationPoints((await fetchRows(queryUrl('carrier_concentration'))).rows);
  if (!data.length) { box.replaceChildren(); return; }
  const [top4, top10] = CONCENTRATION_SERIES;
  const line = (series, opts) => Plot.lineY(data.filter((d) => d.series === series), { x: 'year', y: 'share', stroke: 'currentColor', ...opts });
  box.replaceChildren(Plot.plot({
    width: width(box),
    height: chartHeight(),
    marginLeft: 48,
    marginRight: 110,
    style: { background: 'transparent', fontSize: '12px' },
    x: { label: null, tickFormat: 'd', domain: [minYear, maxYear] },
    y: { label: 'Share of all passengers', tickFormat: '.0%', domain: [0, 1], grid: true },
    marks: [
      Plot.ruleY([0]),
      line(top10, { strokeWidth: 1.5, strokeOpacity: 0.45 }),
      line(top4, { strokeWidth: 2.5 }),
      Plot.text(data, Plot.selectLast({ x: 'year', y: 'share', z: 'series', text: 'series', textAnchor: 'start', dx: 6, fill: 'currentColor' })),
      Plot.tip(data, Plot.pointerX({ x: 'year', y: 'share', title: (d) => `${d.series}, ${d.year}: ${pct(d.share)}` })),
    ],
  }));
}

async function drawCharts() {
  showEngines().catch((err) => failed($('engine-chart'), 'chart', err));
  showConcentration().catch((err) => failed($('concentration-chart'), 'chart', err));
}
```

Charts are drawn once at load, at the container's width then. This matches the engines page.

- [ ] **Step 6: Run the suites and look at the page**

Run: `npm test 2>&1 | grep -E "^# (pass|fail)"` and `uv run pytest -q 2>&1 | tail -2`
Expected: no failures.

Restart the port-8811 server from Task 5 Step 6. Take Playwright screenshots of `/` at 1280×900 and at 390×844 (phone), each in the `paper` and `?theme=night` themes.

Expected:
- three sections, each with a rule above its heading;
- the engine chart is a stacked area with the blue twin-jet band rising to about 94%;
- the airline chart has a solid top-four line (about 51% → 42% → 59%) and a fainter top-ten line, both labelled at the right;
- no graphic is taller than 500px or 66% of the viewport;
- at phone width nothing scrolls sideways;
- no console errors.

Also check that `/?year=2019` lands on `/airports?year=2019` with that year selected, and that `/globe` lands on `/airports/globe`.

- [ ] **Step 7: Commit**

```bash
git add static/home/src/concentration.js static/home/test/concentration.test.js static/home/main.js
git commit -m "Front page: the long-haul engine chart and the airline concentration chart

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0191mnN3iPgFXTdJ7jQemcY1"
```

---

### Task 7: README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the page list and file notes**

In `README.md`:
- replace the "landing page" bullet (line 6) with two bullets:
  - a **front page** at `/` (Datasette's own index is at `/-/`): an introduction and three short stories with a graphic each:
    - a map of the busiest US airports (Alaska, Hawaii and Puerto Rico in insets);
    - long-haul flights moving to twin-engined jets;
    - how much of the market the biggest airlines carry.

    Its numbers come from the `busiest_airports`, `engines_by_year`, `carrier_concentration` and `top_carriers` queries when the page is rendered. Old links to `/?year=…&sort=…` redirect to `/airports`.
  - the **busiest airports** table at `/airports`: the year range comes from `plugins: t100_globe: min_year / max_year` in `datasette.yml`. Update `max_year` when a new year of data is loaded; the front page's stories follow it.
- in the airport network map bullet, change "`/globe` is the same map with an airport chooser" to "`/airports/globe` is the same map with an airport chooser (`/globe` redirects there)";
- in the `plugins/` note, change "`/airports/...` and `/globe` pages" to "front page, `/airports/...` pages";
- in the `airports, routes_by_year, routes_by_month` query note, change "the `/globe` page" to "the map pages";
- add a query note: **`busiest_airports`**, **`carrier_concentration`**, **`top_carriers`**: the front page. `carrier_concentration` ranks operating carriers by passengers each year, so regional airlines flying for the big brands count on their own;
- add `static/home/` to the file notes: the front page's graphics. It uses `static/globe/src/usamap.js`, a d3 Albers USA projection with a third inset for Puerto Rico and the Virgin Islands, drawn over the vendored us-atlas `states-10m.json`.

- [ ] **Step 2: Check for leftover `/globe` links**

Run: `grep -rn '"/globe\|(/globe\|`/globe`' README.md templates static --include=*.html --include=*.js --include=*.md | grep -v "airports/globe\|/static/globe\|vendor"`
Expected: no output, or only the README's mention that `/globe` redirects.

- [ ] **Step 3: Run the full suites and commit**

Run: `uv run pytest -q 2>&1 | tail -2 && npm test 2>&1 | grep -E "^# (pass|fail)"`
Expected: no failures.

```bash
git add README.md
git commit -m "README: the front page, /airports and /airports/globe

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0191mnN3iPgFXTdJ7jQemcY1"
```
