# Airlines Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/airlines` becomes a sortable table of airline groups, like the aircraft table. The airlines heat map moves to `/airlines/over-time`, and the views line "Airlines · Over time" joins the two.

**Architecture:** The pieces, in the order they're built:
1. **A canned query,** `airline_table`, returns one row per member airline, service and kind for a chosen year.
2. **Pure functions** in `static/charts/src/airlines.js` turn those rows into groups with members, sort them, and pick out the settings both pages share. The limit and its menu come from `static/charts/src/aircraft.js`, which is generalised for this rather than copied.
3. **The plugin** routes `/airlines` to the new page (or 301s heat-map-only links to the heat map) and `/airlines/over-time` to the heat map, and gives both the views line.
4. **A page script,** `static/charts/airlinetable.js`, mirrors `static/charts/aircrafttable.js`.

**Tech Stack:** a Datasette plugin (Python, Jinja), canned SQL in `datasette.yml`, plain ES modules, `node --test`, pytest, and headless Playwright.

**Spec:** `docs/superpowers/specs/2026-10-22-airlines-table-design.md`

## Global Constraints

- **Paths:**
  - the table at `/airlines`;
  - the heat map at `/airlines/over-time`;
  - the views line on both reads **Airlines · Over time**.
- **Redirect:** `/airlines` with any of `n`, `rank` or `scale` gives a 301 to `/airlines/over-time`, keeping the query string. `flights`, `service`, `measure` and `year` alone don't redirect.
- **Shared settings:** `measure`, `flights` and `service` are carried by the views line in both directions. Nothing else is carried.
- **Settings and defaults:**
  - `measure`: `passengers`, from `HEAT_MEASURES`;
  - `year`: the latest year;
  - `flights`: `passenger`;
  - `service`: `all`;
  - `limit`: `top20`;
  - `sort`: `value`, with `dir` set to `desc`.
- **Columns:** Airline · Flew · {measure} · Share.
  - "Flew" sorts by `firstYear`, newest first on its first click, as the aircraft table's does.
  - "Airline" sorts A to Z first.
  - "Share" doesn't sort.
- **Search boxes:** the "find an airline" box (`_airline_search.html`) stays on the heat map and on airline pages, not on the table.
- **Freight** is divided by 2,000 into short tons, as the aircraft table does.
- **Staging:** stage files by name. `templates/` holds the user's untracked `query-t100-*.html` files.
- **Commit trailer:** every commit ends with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_0191mnN3iPgFXTdJ7jQemcY1
  ```
- **Git:** don't push or merge.

## Review Focus

1. **A one-airline group** (Southwest, say) shows no disclosure. If a search matches only through its member's legal name, the row shows that member opened, rather than hiding why it matched.
2. **A freight-only airline** (FedEx), with the default `flights=passenger`, is left out, not listed at zero. With `flights=freight`, it's listed.
3. **"All years"** gives each group the sum over every year, and the "Flew" span over every year.
4. **A heat map with `measure=seats`** links "Airlines" to `/airlines?measure=seats`, and back again. A theme or other unrelated setting isn't carried by these links.
5. **The aircraft table** is unchanged by the generalised limit: the same labels ("the top 20 families", "every family") and the same tie order.

---

### Task 1: The `airline_table` query

**Files:**
- Modify: `datasette.yml` (after `type_table`, before `maker_by_year`)
- Test: `tests/test_rollup_queries.py`

**Interfaces:**
- Produces: `/t100/airline_table.json?year=<YYYY|all>`, with rows `{group_id, group_name, airline_id, airline_name, service, kind, first_year, last_year, deps, seats, passengers, freight}`. There's one row per (airline, service, kind) that has departures in the chosen year. `first_year` and `last_year` cover every year for that slice.

- [ ] **Step 1: Write the failing tests.** Append them to `tests/test_rollup_queries.py`; `put` and `get_json` are already imported there.

```python
def cg(year, airline, group, name, deps, domestic=1, service_class="F"):
    return dict(year=year, airline_id=airline, group_id=group, group_name=name, domestic=domestic, service_class=service_class,
                deps=deps, seats=deps * 100, passengers=deps * 80, freight=deps * 1000)


def seed_delta(db_path):
    put(db_path, "carrier_group", [dict(airline_id="19790", group_id="delta", group_name="Delta (incl. Northwest)", airline_name="Delta Air Lines Inc."),
                                   dict(airline_id="19386", group_id="delta", group_name="Delta (incl. Northwest)", airline_name="Northwest Airlines Inc.")])
    put(db_path, "carrier_group_year", [cg(2005, "19790", "delta", "Delta (incl. Northwest)", 50), cg(2005, "19386", "delta", "Delta (incl. Northwest)", 20),
                                        cg(2005, "19386", "delta", "Delta (incl. Northwest)", 3, domestic=0, service_class="G"),
                                        cg(2019, "19790", "delta", "Delta (incl. Northwest)", 60),
                                        cg(2019, "19393", "southwest", "Southwest", 70)])


def test_airline_table_gives_each_member_its_year_by_service_and_kind(ds, db_path):
    seed_delta(db_path)
    rows = get_json(ds, "/t100/airline_table.json?_shape=objects&year=2005")["rows"]
    got = {(r["airline_id"], r["service"], r["kind"]): r["deps"] for r in rows}
    assert got == {("19790", "domestic", "passenger"): 50, ("19386", "domestic", "passenger"): 20, ("19386", "international", "freight"): 3}
    nw = next(r for r in rows if r["airline_id"] == "19386" and r["kind"] == "passenger")
    assert (nw["group_id"], nw["group_name"], nw["airline_name"]) == ("delta", "Delta (incl. Northwest)", "Northwest Airlines Inc.")
    later = get_json(ds, "/t100/airline_table.json?_shape=objects&year=2019")["rows"]
    assert sorted(r["airline_id"] for r in later) == ["19393", "19790"]  # Northwest flew nothing in 2019
    sw = next(r for r in later if r["airline_id"] == "19393")
    assert sw["airline_name"] == "Southwest"  # no carrier_group row: the group's name stands in


def test_airline_table_can_add_up_every_year_and_spans_every_year(ds, db_path):
    seed_delta(db_path)
    rows = get_json(ds, "/t100/airline_table.json?_shape=objects&year=all")["rows"]
    dl = next(r for r in rows if r["airline_id"] == "19790")
    assert (dl["deps"], dl["passengers"], dl["first_year"], dl["last_year"]) == (110, 8800, 2005, 2019)
    one = next(r for r in get_json(ds, "/t100/airline_table.json?_shape=objects&year=2019")["rows"] if r["airline_id"] == "19790")
    assert (one["deps"], one["first_year"], one["last_year"]) == (60, 2005, 2019)
```

- [ ] **Step 2: Run the tests to watch them fail.**

Run: `uv run pytest tests/test_rollup_queries.py -k airline_table -q`
Expected: 2 failures, with a 404 or a "No canned query" error for `airline_table`.

- [ ] **Step 3: Add the query** to `datasette.yml`, directly after `type_table`'s `ORDER BY y.aircraft_type` line, at the same indentation as `type_table:`:

```yaml
      # the airlines table: each member airline's chosen year (or every year) by service and kind, with the years it flew
      airline_table:
        sql: |
          SELECT
            d.group_id,
            d.group_name,
            d.airline_id,
            COALESCE(g.airline_name, d.group_name) AS airline_name,
            CASE WHEN d.domestic = 1 THEN 'domestic' ELSE 'international' END AS service,
            CASE WHEN d.service_class IN ('G', 'P') THEN 'freight' ELSE 'passenger' END AS kind,
            MIN(CASE WHEN d.deps > 0 THEN d.year END) AS first_year,
            MAX(CASE WHEN d.deps > 0 THEN d.year END) AS last_year,
            SUM(CASE WHEN (:year = 'all' OR d.year = CAST(:year AS INTEGER)) THEN d.deps ELSE 0 END) AS deps,
            SUM(CASE WHEN (:year = 'all' OR d.year = CAST(:year AS INTEGER)) THEN d.seats ELSE 0 END) AS seats,
            SUM(CASE WHEN (:year = 'all' OR d.year = CAST(:year AS INTEGER)) THEN d.passengers ELSE 0 END) AS passengers,
            SUM(CASE WHEN (:year = 'all' OR d.year = CAST(:year AS INTEGER)) THEN d.freight ELSE 0 END) AS freight
          FROM carrier_group_year d
            LEFT JOIN carrier_group g ON g.airline_id = d.airline_id
          GROUP BY d.group_id, d.group_name, d.airline_id, airline_name, service, kind
          HAVING SUM(CASE WHEN (:year = 'all' OR d.year = CAST(:year AS INTEGER)) THEN d.deps ELSE 0 END) > 0
          ORDER BY d.group_id, d.airline_id
```

- [ ] **Step 4: Run the tests to watch them pass.**

Run: `uv run pytest tests/test_rollup_queries.py -q`
Expected: all of them pass.

- [ ] **Step 5: Check the size against the real database.** Datasette's `max_returned_rows` is 50000.

Run: `sqlite3 t100.db "select count(*) from (select airline_id, domestic, service_class in ('G','P') from carrier_group_year group by 1,2,3)"`
Expected: about 1,370, far under the limit, so `year=all` isn't truncated.

- [ ] **Step 6: Commit.**

```bash
git add datasette.yml tests/test_rollup_queries.py
git commit -m "airline_table query: each member airline's year by service and kind, with the years it flew

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0191mnN3iPgFXTdJ7jQemcY1"
```

---

### Task 2: Pure functions for the table

**Files:**
- Modify: `static/charts/src/aircraft.js` (`LIMIT_OPTIONS`, `limitFamilies`)
- Create: `static/charts/src/airlines.js`
- Test: `static/charts/test/airlines.test.js` (new), `static/charts/test/aircraft.test.js` (one new test)

**Interfaces:**
- Consumes: the row shape from Task 1.
- Produces:
  - from `aircraft.js`:
    - `limitOptions(plural, singular) → [{value, label}]`;
    - `LIMIT_OPTIONS` (unchanged values and labels);
    - `DEFAULT_LIMIT`;
    - `limitFamilies(items, limit, {searching})`, which now accepts items with `name` in place of `family`;
  - from `airlines.js`:
    - `groupAirlines(rows, {measure, flights, service, q}) → {groups, total}`, where each group is `{id, name, firstYear, lastYear, value, share, matched, members: [{id, name, firstYear, lastYear, value, share}]}`;
    - `sortAirlines(groups, key, dir) → groups` (`key` is `name`, `firstYear` or `value`; members are sorted too);
    - `sharedQuery(search) → '' | '?…'`.

- [ ] **Step 1: Write the failing tests.**

Create `static/charts/test/airlines.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { groupAirlines, sortAirlines, sharedQuery } from '../src/airlines.js';
import { limitFamilies, limitOptions } from '../src/aircraft.js';

const r = (group_id, group_name, airline_id, airline_name, deps, extra = {}) => ({
  group_id, group_name, airline_id, airline_name, service: 'domestic', kind: 'passenger', first_year: 1990, last_year: 2025,
  deps, seats: deps * 100, passengers: deps * 80, freight: deps * 2000, ...extra,
});
const rows = [
  r('delta', 'Delta (incl. Northwest)', '19790', 'Delta Air Lines Inc.', 60),
  r('delta', 'Delta (incl. Northwest)', '19790', 'Delta Air Lines Inc.', 10, { service: 'international', first_year: 1991 }),
  r('delta', 'Delta (incl. Northwest)', '19386', 'Northwest Airlines Inc.', 30, { first_year: 1990, last_year: 2009 }),
  r('southwest', 'Southwest', '19393', 'Southwest Airlines Co.', 80, { first_year: 1995 }),
  r('fedex', 'FedEx', '20107', 'Federal Express Corporation', 20, { kind: 'freight', service: 'international', first_year: 2003 }),
];

test('a group adds up its members, ranked by the chosen measure, with shares of the total', () => {
  const { groups, total } = groupAirlines(rows, { measure: 'deps' });
  assert.deepEqual(groups.map((g) => [g.id, g.value]), [['delta', 100], ['southwest', 80]]);
  assert.equal(total, 180);
  assert.ok(Math.abs(groups[0].share - 100 / 180) < 1e-9);
  assert.deepEqual(groups[0].members.map((m) => [m.id, m.name, m.value]), [['19790', 'Delta Air Lines Inc.', 70], ['19386', 'Northwest Airlines Inc.', 30]]);
  assert.deepEqual([groups[0].firstYear, groups[0].lastYear], [1990, 2025]);
  assert.equal(groups[0].name, 'Delta (incl. Northwest)');
});

test('flights and service filter the rows, and the years come from what is left', () => {
  assert.deepEqual(groupAirlines(rows, { measure: 'deps', flights: 'freight' }).groups.map((g) => g.id), ['fedex']);
  assert.deepEqual(groupAirlines(rows, { measure: 'deps', flights: 'all' }).groups.map((g) => g.id), ['delta', 'southwest', 'fedex']);
  const intl = groupAirlines(rows, { measure: 'deps', service: 'international' }).groups;
  assert.deepEqual(intl.map((g) => [g.id, g.value, g.firstYear]), [['delta', 10, 1991]]);
  assert.deepEqual(intl[0].members.map((m) => m.id), ['19790']);
});

test('freight is in short tons', () => {
  const { groups } = groupAirlines(rows, { measure: 'freight', flights: 'freight' });
  assert.equal(groups[0].value, 20);
});

test('a search matches a group or one of its members, and opens a group found through a member', () => {
  const byGroup = groupAirlines(rows, { measure: 'deps', q: 'delta' }).groups;
  assert.deepEqual(byGroup.map((g) => [g.id, g.matched, g.members.length]), [['delta', false, 2]]);
  const byMember = groupAirlines(rows, { measure: 'deps', q: 'northwest airlines' }).groups;
  assert.deepEqual(byMember.map((g) => [g.id, g.matched, g.members.map((m) => m.id)]), [['delta', true, ['19386']]]);  // the group's name has "Northwest" but not "Northwest Airlines"
  const legal = groupAirlines(rows, { measure: 'deps', q: 'airlines co' }).groups;
  assert.deepEqual(legal.map((g) => [g.id, g.matched, g.members.map((m) => m.id)]), [['southwest', true, ['19393']]]);
  assert.deepEqual(groupAirlines(rows, { measure: 'deps', q: 'nothing like it' }).groups, []);
  assert.equal(groupAirlines(rows, { measure: 'deps', q: 'airlines co' }).total, 180);  // shares stay of everything the filters leave
});

test('a group with nothing in the selection is left out, and shares do not divide by zero', () => {
  const none = rows.map((x) => ({ ...x, deps: 0 }));
  assert.deepEqual(groupAirlines(none, { measure: 'deps' }), { groups: [], total: 0 });
});

test('sortAirlines sorts groups and their members by name, first year or value, either way', () => {
  const { groups } = groupAirlines(rows, { measure: 'deps', flights: 'all' });
  assert.deepEqual(sortAirlines(groups, 'name', 'asc').map((g) => g.id), ['delta', 'fedex', 'southwest']);
  assert.deepEqual(sortAirlines(groups, 'firstYear', 'desc').map((g) => g.id), ['fedex', 'southwest', 'delta']);
  assert.deepEqual(sortAirlines(groups, 'value', 'asc').map((g) => g.id), ['fedex', 'southwest', 'delta']);
  const delta = sortAirlines(groups, 'value', 'asc').at(-1);
  assert.deepEqual(delta.members.map((m) => m.id), ['19386', '19790']);
  assert.deepEqual(groups.map((g) => g.id), ['delta', 'southwest', 'fedex']);  // the input is left alone
});

test('sharedQuery keeps only the settings both airline pages read', () => {
  assert.equal(sharedQuery('?measure=seats&flights=all&service=domestic&n=25&scale=busiest&theme=night&year=2019'), '?measure=seats&flights=all&service=domestic');
  assert.equal(sharedQuery('?n=25'), '');
  assert.equal(sharedQuery(''), '');
});

test('the limit works on airline groups and names them in its menu', () => {
  const { groups } = groupAirlines(rows, { measure: 'deps', flights: 'all' });
  assert.deepEqual(limitFamilies(groups, 'top2').shown.map((g) => g.id), ['delta', 'southwest']);
  assert.deepEqual(limitOptions('airlines', 'airline').map((o) => o.label),
    ['the top 15 airlines', 'the top 20 airlines', 'the top 50 airlines', 'every airline', 'airlines with at least 1%', 'airlines with at least 0.1%']);
});
```

Append to `static/charts/test/aircraft.test.js`, adding `LIMIT_OPTIONS` to its import from `../src/aircraft.js`:

```js
test('the aircraft limit menu keeps its wording', () => {
  assert.deepEqual(LIMIT_OPTIONS.map((o) => o.label),
    ['the top 15 families', 'the top 20 families', 'the top 50 families', 'every family', 'families with at least 1%', 'families with at least 0.1%']);
});
```

- [ ] **Step 2: Run the tests to watch them fail.**

Run: `node --test static/charts/test/airlines.test.js static/charts/test/aircraft.test.js`
Expected: `airlines.test.js` fails to load (cannot find `../src/airlines.js`). The new aircraft test passes already: it pins today's labels.

- [ ] **Step 3: Generalise the limit in `static/charts/src/aircraft.js`.** Replace the `LIMIT_OPTIONS` constant and the `ranked` line of `limitFamilies`:

```js
// The limit menu, worded for what the table lists
export const limitOptions = (plural, singular) => [
  { value: 'top15', label: `the top 15 ${plural}` },
  { value: 'top20', label: `the top 20 ${plural}` },
  { value: 'top50', label: `the top 50 ${plural}` },
  { value: 'all', label: `every ${singular}` },
  { value: 'min1', label: `${plural} with at least 1%` },
  { value: 'min0.1', label: `${plural} with at least 0.1%` },
];
export const LIMIT_OPTIONS = limitOptions('families', 'family');
```

In `limitFamilies`, change:

```js
  const ranked = [...families].sort((a, b) => b.value - a.value || a.family.localeCompare(b.family));
```

to:

```js
  const nameOf = (x) => x.family ?? x.name;  // an aircraft family or an airline group
  const ranked = [...families].sort((a, b) => b.value - a.value || nameOf(a).localeCompare(nameOf(b)));
```

- [ ] **Step 4: Create `static/charts/src/airlines.js`.**

```js
const LB_PER_SHORT_TON = 2000;
const amount = (row, measure) => (Number(row[measure]) || 0) / (measure === 'freight' ? LB_PER_SHORT_TON : 1);
const byValue = (a, b) => b.value - a.value || a.name.localeCompare(b.name);
const firstOf = (xs) => { const ys = xs.map((x) => x.firstYear).filter(Boolean); return ys.length ? Math.min(...ys) : null; };
const lastOf = (xs) => Math.max(0, ...xs.map((x) => x.lastYear || 0)) || null;

// Rows from airline_table (one per member airline, service and kind) -> airline groups, each with its members.
// Rows are filtered by kind of flight and service; a member's years are those of the rows left. Groups with nothing in
// the selection are left out unless the search `q` names them (or one of their members). Shares are of everything the
// filters leave, not of what the search shows.
export function groupAirlines(rows, { measure = 'passengers', flights = 'passenger', service = 'all', q = '' } = {}) {
  const needle = String(q).trim().toLowerCase();
  const byGroup = new Map();
  for (const r of rows) {
    if (flights !== 'all' && r.kind !== flights) continue;
    if (service !== 'all' && r.service !== service) continue;
    const g = byGroup.get(r.group_id) || { id: r.group_id, name: r.group_name, members: new Map() };
    byGroup.set(r.group_id, g);
    const m = g.members.get(r.airline_id) || { id: r.airline_id, name: r.airline_name, value: 0, firstYear: null, lastYear: null, share: 0 };
    g.members.set(r.airline_id, m);
    m.value += amount(r, measure);
    const first = Number(r.first_year) || null, last = Number(r.last_year) || null;
    if (first && (!m.firstYear || first < m.firstYear)) m.firstYear = first;
    if (last && (!m.lastYear || last > m.lastYear)) m.lastYear = last;
  }
  const sum = (ms) => ms.reduce((s, m) => s + m.value, 0);
  const total = [...byGroup.values()].reduce((s, g) => s + sum([...g.members.values()]), 0);
  const groups = [];
  for (const g of byGroup.values()) {
    const all = [...g.members.values()];
    const value = sum(all);
    const nameHit = g.name.toLowerCase().includes(needle);
    const memberHits = needle ? all.filter((m) => m.name.toLowerCase().includes(needle)) : all;
    if (needle && !nameHit && !memberHits.length) continue;
    if (value <= 0 && !needle) continue;
    const members = (nameHit ? all.filter((m) => m.value > 0) : memberHits).sort(byValue);
    for (const m of members) m.share = total > 0 ? m.value / total : 0;
    groups.push({ id: g.id, name: g.name, firstYear: firstOf(all), lastYear: lastOf(all), value,
      share: total > 0 ? value / total : 0, matched: Boolean(needle) && !nameHit, members });
  }
  groups.sort(byValue);
  return { groups, total };
}

function compare(key, dir) {
  const sign = dir === 'asc' ? 1 : -1;
  return (a, b) => {
    const c = key === 'name' ? a.name.localeCompare(b.name) : (a[key] ?? -Infinity) - (b[key] ?? -Infinity);
    return sign * c || a.name.localeCompare(b.name);
  };
}

// Groups sorted by a column, and each group's members by the same column
export function sortAirlines(groups, key, dir = 'desc') {
  const by = compare(key, dir);
  return [...groups].sort(by).map((g) => ({ ...g, members: [...g.members].sort(by) }));
}

// The settings the airlines table and the airlines heat map both read, to carry between them
const SHARED = ['measure', 'flights', 'service'];
export function sharedQuery(search) {
  const from = new URLSearchParams(search || '');
  const q = new URLSearchParams();
  for (const k of SHARED) if (from.has(k)) q.set(k, from.get(k));
  const s = q.toString();
  return s ? `?${s}` : '';
}
```

- [ ] **Step 5: Run the tests to watch them pass.**

Run: `node --test static/charts/test/airlines.test.js static/charts/test/aircraft.test.js`
Expected: all of them pass.

Run: `npm test 2>&1 | tail -5`
Expected: `fail 0`.

- [ ] **Step 6: Commit.**

```bash
git add static/charts/src/aircraft.js static/charts/src/airlines.js static/charts/test/airlines.test.js static/charts/test/aircraft.test.js
git commit -m "Airlines table: groups with members, sorting, the shared settings, and the aircraft limit worded for either table

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0191mnN3iPgFXTdJ7jQemcY1"
```

---

### Task 3: Routes, views line, redirect and template

**Files:**
- Modify: `plugins/t100_globe.py` (`register_routes`, `views_for`, `rollup_page`, the new `airline_table_page`)
- Create: `templates/airline_table.html`
- Modify: `static/charts/style.css` (the `#aircraft-table` selectors)
- Modify: `scripts/smoke_check.sh`
- Test:
  - `tests/test_navigation.py`, `tests/test_redirects.py` and `tests/test_rollup_pages.py`;
  - `tests/test_page_frame.py` and `tests/test_nav.py`.

**Interfaces:**
- Consumes: nothing from earlier tasks, apart from the script path `/static/charts/airlinetable.js` (written in Task 4).
- Produces: element ids for Task 4:
  - `#airline-measure`, `#airline-year`, `#airline-flights`, `#airline-service` and `#airline-limit` (selects);
  - `#airline-q` (search);
  - `#airline-status`, `#airline-table`;
  - `body[data-latest-year]`.

- [ ] **Step 1: Write the failing tests.**

In `tests/test_navigation.py`, change the `PAGES` entry `"/airlines": ("airlines", []),` to these two lines:

```python
    "/airlines": ("airlines", ["Airlines", "Over time"]),
    "/airlines/over-time": ("airlines", ["Airlines", "Over time"]),
```

Append to `tests/test_navigation.py`:

```python
def test_the_airlines_table_and_heat_map_are_two_views_of_the_section():
    assert [(v["label"], v["href"], v["current"]) for v in views_for("/airlines")] == [
        ("Airlines", "/airlines", True), ("Over time", "/airlines/over-time", False)]
    assert [v["current"] for v in views_for("/airlines/over-time")] == [False, True]
    assert [v["label"] for v in views_for("/airlines/delta")] == ["Over time", "Changes", "Map"]  # an airline is still its own subject
```

In `tests/test_redirects.py`, add these entries to `OLD`:

```python
    ("/airlines?scale=busiest&n=25", "/airlines/over-time?scale=busiest&n=25"),
    ("/airlines?n=10", "/airlines/over-time?n=10"),
    ("/airlines?rank=latest&measure=deps", "/airlines/over-time?rank=latest&measure=deps"),
    ("/airlines?scale=absolute", "/airlines/over-time?scale=absolute"),
```

Append to `tests/test_redirects.py`:

```python
@pytest.mark.parametrize("path", ["/airlines", "/airlines?measure=seats&year=2019", "/airlines?flights=freight&service=domestic"])
def test_the_airlines_table_keeps_the_settings_it_reads(ds, path):
    r = get(ds, path)
    assert r.status_code == 200 and 'id="airline-table"' in r.text
```

In `tests/test_rollup_pages.py`:
- change both `parametrize` lists that hold `"/airlines"` (`test_page_renders_with_its_kind_and_assets` and `test_settings_read_as_one_sentence`) to `"/airlines/over-time"`;
- in `test_airline_search_box_is_on_the_airlines_page_and_each_airline_page`, change `["/airlines", "/airlines/delta"]` to `["/airlines/over-time", "/airlines/delta"]`, and add `assert 'id="airline-search"' not in get(ds, "/airlines").text` after the loop.

Then append:

```python
def test_the_airlines_table_page_has_its_controls_breadcrumb_and_script(ds):
    html = get(ds, "/airlines").text
    sentence = re.search(r'<p class="chart-sentence">(.*?)</p>', html, re.S).group(1)
    assert re.findall(r'<select id="([^"]+)"', sentence) == ["airline-measure", "airline-year", "airline-flights", "airline-service", "airline-limit"]
    for id_ in ["airline-q", "airline-status", "airline-table"]:
        assert f'id="{id_}"' in html
    assert "/static/charts/airlinetable.js" in html and "data-latest-year=" in html
    assert 'aria-current="page">airlines<' in html


def test_the_heat_map_breadcrumb_goes_back_to_the_table(ds):
    html = get(ds, "/airlines/over-time").text
    assert '<a href="/airlines">airlines</a>' in html and 'aria-current="page">over time<' in html
```

In `tests/test_page_frame.py`, add `"airline_table"` to `TEMPLATES`. In `tests/test_nav.py`, add `"/airlines/over-time"` to `SCROLLING`, after `"/airlines"`.

- [ ] **Step 2: Run the tests to watch them fail.**

Run: `uv run pytest tests/test_navigation.py tests/test_redirects.py tests/test_rollup_pages.py tests/test_page_frame.py tests/test_nav.py -q 2>&1 | tail -15`
Expected: failures for:
- the views line on `/airlines` (it's empty today);
- `/airlines/over-time` (404, or the airline page's 404 for an unknown slug);
- the redirects (200 instead of 301);
- `airline-table` being missing;
- `templates/airline_table.html` not existing.

- [ ] **Step 3: Change the plugin.** In `register_routes`, replace `(r"^/airlines$", rollup_page("airlines")),` with these two lines. They must come before the `/airlines/(?P<slug>…)` routes, so that "over-time" isn't read as an airline:

```python
        (r"^/airlines$", airline_table_page),
        (r"^/airlines/over-time$", rollup_page("airlines")),
```

In `views_for`, add this case directly before `case ["airlines", slug, *rest]`:

```python
        case ["airlines"] | ["airlines", "over-time"]:
            return make(("Airlines", "/airlines", None), ("Over time", "/airlines/over-time", None), current=len(parts) - 1)
```

In `rollup_page`'s `view`, change `"crumbs": trail(datasette, (page["crumb"], None)),` to:

```python
                "crumbs": trail(datasette, (page["crumb"], f"/{kind}"), ("over time", None)),
```

After `rollup_page`, add:

```python
HEAT_MAP_ONLY = ("n", "rank", "scale")  # the airlines heat map's settings that mean nothing to the table that took its address


async def airline_table_page(datasette, request):
    """Every airline group, ranked, with its members inside; old links to the heat map that had /airlines go on to it."""
    if any(k in request.args for k in HEAT_MAP_ONLY):
        return Response.redirect(f"/airlines/over-time?{request.query_string}", status=301)
    html = await datasette.render_template(
        "airline_table.html",
        {
            "latest_year": (datasette.plugin_config("t100_globe") or {}).get("max_year", 2025),
            "crumbs": trail(datasette, ("airlines", None)),
        },
        request=request,
    )
    return Response.html(html)
```

- [ ] **Step 4: Create `templates/airline_table.html`.**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Airlines · T-100</title>
  <link rel="stylesheet" href="/static/common/base.css">
  <link rel="stylesheet" href="/static/charts/style.css">
  <link rel="stylesheet" href="/static/nav/style.css">
  <script type="module" src="/static/nav/main.js"></script>
</head>
<body data-latest-year="{{ latest_year }}">
  <main>
    {% include "_nav.html" %}
    <h1>Airlines</h1>
    <p class="intro">Every US and foreign airline in the data, with airlines that merged counted together (Delta includes Northwest, American includes US Airways and TWA, and so on). Open a merged airline to see the airlines it's made of, search for one by name, or open an airline's own page for it over time.</p>
    <p class="chart-sentence">
      Show <select id="airline-measure" aria-label="Measure"></select>
      in <select id="airline-year" aria-label="Year"></select>
      for <select id="airline-flights" aria-label="Kind of flight"><option value="passenger">passenger flights</option><option value="freight">freight flights</option><option value="all">all flights</option></select>
      on <select id="airline-service" aria-label="Routes"><option value="all">all routes</option><option value="domestic">domestic routes</option><option value="international">international routes</option></select>,
      showing <select id="airline-limit" aria-label="How many airlines"></select>.
    </p>
    <p><label>Search <input id="airline-q" type="search" placeholder="Name, such as Delta or Northwest" autocomplete="off"></label></p>
    <p class="note" id="airline-status" aria-live="polite"></p>
    <div id="airline-table">Loading table…</div>
    <p class="note">Airlines that merged are counted together for every year, and a merged airline opens to show the airlines it's made of. Regional airlines flying under a major's name are listed on their own. The share is of the total for the chosen year, flights and routes. Freight is in short tons (2,000 lb). More on <a href="/about#groupings">how things are grouped</a>. Freight before 2003 leaves out most domestic FedEx and UPS flying, so freight figures jump when they appear: see <a href="/about#breaks">known gaps in the data</a>.</p>
    {% include "_footer.html" %}
  </main>
  <script type="module" src="/static/charts/airlinetable.js"></script>
</body>
</html>
```

- [ ] **Step 5: Share the table styles.** In `static/charts/style.css`, replace the six `#aircraft-table …` rules and `#at-q` with:

```css
:is(#aircraft-table, #airline-table) { overflow-x: auto; }
:is(#aircraft-table, #airline-table) :is(td, th).left { text-align: left; }
:is(#aircraft-table, #airline-table) button.sort { all: unset; cursor: pointer; font-weight: 600; }
:is(#aircraft-table, #airline-table) :is(button.sort, button.twist):focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
:is(#aircraft-table, #airline-table) button.twist { all: unset; cursor: pointer; display: inline-block; width: 1.2em; color: var(--muted, #777); }
:is(#aircraft-table, #airline-table) tr.type-row td { color: var(--muted, #777); font-size: 14px; }
:is(#aircraft-table, #airline-table) td.type-name { padding-left: 2em; }
#at-q, #airline-q { min-width: 16em; }
```

- [ ] **Step 6: Update the smoke check.** In `scripts/smoke_check.sh`, replace `check 200 /airlines                                                 "heat-kind"` with:

```sh
check 200 /airlines                                                 "airline-table"
check 200 /airlines/over-time                                       "heat-kind"
check 301 "/airlines?scale=busiest"
```

- [ ] **Step 7: Run the tests to watch them pass.**

Run: `uv run pytest -q 2>&1 | tail -5`
Expected: every test passes. In particular, `test_caveats_link_to_the_matching_section` still passes for `/airlines`, because the table's note links to `#groupings` and `#breaks`.

- [ ] **Step 8: Commit.**

```bash
git add plugins/t100_globe.py templates/airline_table.html static/charts/style.css scripts/smoke_check.sh tests/test_navigation.py tests/test_redirects.py tests/test_rollup_pages.py tests/test_page_frame.py tests/test_nav.py
git commit -m "/airlines is the airlines table; the heat map moves to /airlines/over-time, and its old links follow it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0191mnN3iPgFXTdJ7jQemcY1"
```

---

### Task 4: The page script, and carrying the shared settings

**Files:**
- Create: `static/charts/airlinetable.js`
- Modify: `static/charts/rollup.js` (`pushState`, `main`)
- Test: the Playwright script `airlines_table_check.py`, in the scratchpad

**Interfaces:**
- Consumes:
  - from Task 2: `groupAirlines`, `sortAirlines`, `sharedQuery` (`src/airlines.js`) and `limitFamilies`, `limitOptions`, `DEFAULT_LIMIT` (`src/aircraft.js`);
  - the query from Task 1;
  - the element ids from Task 3.
- Produces: the working page.

- [ ] **Step 1: Write the failing browser check.** First restart the scratch server:

```sh
pkill -f "port 8811"; (nohup uv run datasette serve t100.db --config datasette.yml --plugins-dir plugins --template-dir templates --static static:static --port 8811 >/dev/null 2>&1 &)
```

Then create `airlines_table_check.py` in the scratchpad:

```python
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8811"
fails = []
def check(ok, what):
    print("ok  " if ok else "FAIL", what)
    if not ok: fails.append(what)

with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    pg = b.new_page(viewport={"width": 1280, "height": 900}); pg.on("pageerror", lambda e: errs.append(str(e)))

    pg.goto(BASE + "/airlines"); pg.wait_for_selector("#airline-table table", timeout=15000)
    rows = pg.locator("#airline-table tbody > tr:not(.type-row)")
    check(rows.count() == 20, f"20 groups by default (got {rows.count()})")
    heads = pg.locator("#airline-table thead th").all_inner_texts()
    check(heads[:2] == ["Airline", "Flew"] and heads[2].startswith("Passengers") and heads[3] == "Share", f"columns {heads}")
    vals = pg.evaluate("() => [...document.querySelectorAll('#airline-table tbody > tr:not(.type-row)')].slice(0, 3).map((tr) => tr.children[2].textContent)")
    check(len(vals) == 3, f"first values {vals}")
    check("of the" in pg.inner_text("#airline-status"), "status line: " + pg.inner_text("#airline-status"))

    pg.goto(BASE + "/airlines?year=2005"); pg.wait_for_selector("#airline-table table", timeout=15000)
    delta = pg.locator("#airline-table tbody tr", has=pg.locator('a[href="/airlines/delta"]'))
    delta.locator("button.twist").click()
    members = pg.locator("#airline-table tr.type-row").all_inner_texts()
    check(any("Delta Air Lines" in m for m in members) and any("Northwest" in m for m in members), f"Delta opens to its members: {members}")

    pg.select_option("#airline-year", "2019"); pg.wait_for_timeout(1500)
    check("year=2019" in pg.url, "year in the URL: " + pg.url)

    pg.locator("#airline-table thead button", has_text="Flew").click()
    check("sort=firstYear" in pg.url and "dir=" not in pg.url, "Flew sorts newest first: " + pg.url)

    pg.goto(BASE + "/airlines?measure=seats&flights=all"); pg.wait_for_selector("#airline-table table", timeout=15000)
    href = pg.eval_on_selector("nav.views a", "a => a.pathname + a.search")
    check(href == "/airlines/over-time?measure=seats&flights=all", f"Over time carries the shared settings: {href}")
    pg.click("nav.views a"); pg.wait_for_selector("#heatmap svg", timeout=15000)
    back = pg.eval_on_selector("nav.views a", "a => a.pathname + a.search")
    check(back == "/airlines?measure=seats&flights=all", f"the heat map carries them back: {back}")

    pg.goto(BASE + "/airlines?year=2019"); pg.wait_for_selector("#airline-table table", timeout=15000)
    pg.click('#airline-table a[href="/airlines/delta"]'); pg.wait_for_load_state()
    check(pg.url.endswith("/airlines/delta"), "a group's link opens its page: " + pg.url)

    pg.goto(BASE + "/airlines?scale=busiest"); pg.wait_for_selector("#heatmap svg", timeout=15000)
    check(pg.url.startswith(BASE + "/airlines/over-time"), "an old heat-map link lands on the heat map: " + pg.url)

    pg.goto(BASE + "/airlines?q=zzzz"); pg.wait_for_timeout(3000)
    check(pg.inner_text("#airline-table").startswith("Nothing matches"), "an empty search says so")

    check(not errs, f"no page errors {errs}")
    b.close()
print("FAILURES:", len(fails))
```

Run: `uv run python <scratchpad>/airlines_table_check.py`
Expected: it fails with a timeout waiting for `#airline-table table`, because the script doesn't exist yet.

- [ ] **Step 2: Create `static/charts/airlinetable.js`.**

```js
import { HEAT_MEASURES } from '/static/charts/src/heatmap.js';
import { groupAirlines, sortAirlines, sharedQuery } from '/static/charts/src/airlines.js';
import { limitFamilies, limitOptions, DEFAULT_LIMIT } from '/static/charts/src/aircraft.js';
import { queryUrl, fetchRows } from '/static/globe/src/api.js';
import { formatCount, countLabel } from '/static/common/numbers.js';
import { replaceSearch } from '/static/nav/src/state.js';

const $ = (id) => document.getElementById(id);
const latest = Number(document.body.dataset.latestYear);
const params = new URLSearchParams(location.search);
const pick = (key, allowed, fallback) => (allowed.includes(params.get(key)) ? params.get(key) : fallback);
const years = ['all', ...Array.from({ length: latest - 1990 + 1 }, (_, i) => String(latest - i))];
const LIMITS = limitOptions('airlines', 'airline');
const DEFAULTS = { measure: 'passengers', year: String(latest), flights: 'passenger', service: 'all', limit: DEFAULT_LIMIT, q: '', sort: 'value', dir: 'desc' };
const state = {
  measure: pick('measure', Object.keys(HEAT_MEASURES), DEFAULTS.measure),
  year: pick('year', years, DEFAULTS.year),
  flights: pick('flights', ['passenger', 'freight', 'all'], DEFAULTS.flights),
  service: pick('service', ['all', 'domestic', 'international'], DEFAULTS.service),
  limit: pick('limit', LIMITS.map((o) => o.value), DEFAULTS.limit),
  q: params.get('q') || '',
  sort: pick('sort', ['name', 'firstYear', 'value'], DEFAULTS.sort),
  dir: pick('dir', ['asc', 'desc'], DEFAULTS.dir),
};
const open = new Set();
let rows = [];
let seq = 0;          // the newest year request; an older answer arriving late is ignored
let loading = false;  // while true the rows on hand belong to another year
let focusKey = null;  // the sort header or toggle just used, so keyboard focus survives the redraw

const pct = (v) => `${(v * 100).toFixed(v > 0 && v < 0.001 ? 2 : 1)}%`;
const span = (a, b) => (a ? (a === b ? String(a) : `${a}–${b}`) : '');
const unit = () => HEAT_MEASURES[state.measure].toLowerCase();

// the views line takes the settings the heat map reads too
const carry = () => { for (const a of document.querySelectorAll('nav.views a')) a.search = sharedQuery(location.search); };

function pushState() {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(state)) if (v !== DEFAULTS[k]) q.set(k, v);
  history.replaceState(null, '', `${location.pathname}${replaceSearch(location.search, Object.keys(DEFAULTS), `?${q}`)}`);
  carry();
}

const cell = (text, cls) => { const td = document.createElement('td'); td.textContent = text; if (cls) td.className = cls; return td; };
const link = (href, text) => { const a = document.createElement('a'); a.href = href; a.textContent = text; return a; };

function headerCell(key, label, cls) {
  const th = document.createElement('th');
  if (cls) th.className = cls;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'sort';
  b.dataset.focus = `sort:${key}`;
  b.textContent = label + (state.sort === key ? (state.dir === 'asc' ? ' ▲' : ' ▼') : '');
  b.addEventListener('click', () => {
    state.dir = state.sort === key && state.dir === 'desc' ? 'asc' : 'desc';
    if (state.sort !== key) state.dir = key === 'value' || key === 'firstYear' ? 'desc' : 'asc';
    state.sort = key;
    focusKey = `sort:${key}`;
    pushState(); draw();
  });
  th.append(b);
  return th;
}

function memberRow(m) {
  const tr = document.createElement('tr');
  tr.className = 'type-row';
  const name = cell('', 'left type-name');
  name.append(link(`/airlines/${m.id}`, m.name));
  tr.append(name, cell(span(m.firstYear, m.lastYear)), cell(formatCount(m.value)), cell(pct(m.share)));
  return tr;
}

function draw() {
  if (loading) return;
  const box = $('airline-table');
  const status = $('airline-status');
  const { groups, total } = groupAirlines(rows, state);
  box.replaceChildren();
  status.textContent = '';
  if (!groups.length) { box.textContent = state.q ? `Nothing matches "${state.q}".` : `No ${unit()} for this selection.`; return; }
  const { shown, hidden, shownShare } = limitFamilies(groups, state.limit, { searching: Boolean(state.q.trim()) });
  const sorted = sortAirlines(shown, state.sort, state.dir);
  const table = document.createElement('table');
  const head = document.createElement('tr');
  head.append(headerCell('name', 'Airline', 'left'), headerCell('firstYear', 'Flew'), headerCell('value', HEAT_MEASURES[state.measure]), document.createElement('th'));
  head.lastChild.textContent = 'Share';
  const thead = document.createElement('thead');
  thead.append(head);
  const tbody = document.createElement('tbody');
  for (const g of sorted) {
    const tr = document.createElement('tr');
    const first = document.createElement('td');
    first.className = 'left';
    const isOpen = open.has(g.id) || g.matched;
    if (g.members.length > 1 || g.matched) {
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'twist';
      toggle.dataset.focus = `twist:${g.id}`;
      toggle.textContent = isOpen ? '▾' : '▸';
      toggle.setAttribute('aria-expanded', String(isOpen));
      toggle.setAttribute('aria-label', `${isOpen ? 'Hide' : 'Show'} the airlines in ${g.name}`);
      toggle.addEventListener('click', () => { if (open.has(g.id)) open.delete(g.id); else open.add(g.id); focusKey = `twist:${g.id}`; draw(); });
      first.append(toggle, ' ');
    }
    first.append(link(`/airlines/${g.id}`, g.name));
    tr.append(first, cell(span(g.firstYear, g.lastYear)), cell(formatCount(g.value)), cell(pct(g.share)));
    tbody.append(tr);
    if (isOpen && (g.members.length > 1 || g.matched)) for (const m of g.members) tbody.append(memberRow(m));
  }
  table.append(thead, tbody);
  box.append(table);
  const when = state.year === 'all' ? 'across all years' : `in ${state.year}`;
  status.textContent = hidden
    ? `Showing ${shown.length} of ${groups.length} airlines, ${pct(shownShare)} of the ${countLabel(total)} ${unit()} ${when}.`
    : `${groups.length} airlines, ${countLabel(total)} ${unit()} ${when}.`;
  if (focusKey) {
    box.querySelector(`[data-focus="${CSS.escape(focusKey)}"]`)?.focus();
    focusKey = null;
  }
}

async function load() {
  const id = ++seq;
  loading = true;
  $('airline-table').textContent = 'Loading table…';
  $('airline-status').textContent = '';
  let fetched;
  try {
    fetched = (await fetchRows(queryUrl('airline_table', { year: state.year }))).rows;
  } catch (err) {
    if (id !== seq) return;
    console.error(err);
    $('airline-table').textContent = 'Could not load the table.';
    return;
  }
  if (id !== seq) return;
  rows = fetched;
  loading = false;
  draw();
}

function main() {
  for (const [k, label] of Object.entries(HEAT_MEASURES)) $('airline-measure').append(new Option(label.toLowerCase(), k));
  for (const y of years) $('airline-year').append(new Option(y === 'all' ? 'all years' : y, y));
  for (const o of LIMITS) $('airline-limit').append(new Option(o.label, o.value));
  for (const [id, field] of [['airline-measure', 'measure'], ['airline-year', 'year'], ['airline-flights', 'flights'], ['airline-service', 'service'], ['airline-limit', 'limit']]) {
    $(id).value = state[field];
    $(id).addEventListener('change', (e) => { state[field] = e.target.value; pushState(); if (field === 'year') load(); else draw(); });
  }
  $('airline-q').value = state.q;
  $('airline-q').addEventListener('input', (e) => { state.q = e.target.value; pushState(); draw(); });
  carry();
  load();
}

main();
```

- [ ] **Step 3: Carry the shared settings from the heat map.** In `static/charts/rollup.js`:
- add `import { sharedQuery } from '/static/charts/src/airlines.js';` after the `rollup.js` import;
- add the `carry` function below `pushState`;
- make `pushState` call `carry()` as its last line;
- make `main()` call `carry()` straight after `fillControls();`.

```js
// the views line takes the settings the airlines table reads too
const carry = () => { for (const a of document.querySelectorAll('nav.views a')) a.search = sharedQuery(location.search); };
```

- [ ] **Step 4: Run the browser check to watch it pass.** Restart the scratch server (with the same command as in Step 1), then:

Run: `uv run python <scratchpad>/airlines_table_check.py`
Expected: every line is `ok`, and the output ends with `FAILURES: 0`. If a check fails because the data differs from what's assumed here (for example, 2019's Delta), read the data with `sqlite3` before changing either the check or the code.

- [ ] **Step 5: Run every suite.**

Run: `npm test 2>&1 | tail -4; uv run pytest -q 2>&1 | tail -3`
Expected: `fail 0`, and every pytest test passes.

- [ ] **Step 6: Look at the page at phone width.** Take one 390px-wide screenshot of `/airlines?year=2005` with Delta open, and check that there's no sideways page scroll (`document.documentElement.scrollWidth <= innerWidth`).

- [ ] **Step 7: Commit.**

```bash
git add static/charts/airlinetable.js static/charts/rollup.js
git commit -m "Airlines table page: groups that open to their members, sorting, filters and search; both airline views carry the settings they share

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0191mnN3iPgFXTdJ7jQemcY1"
```

---

### Task 5: The roadmap

**Files:**
- Modify: `docs/site-coherence.md` (the Views bucket, sub-project 3)

- [ ] **Step 1: Mark the airlines table done** in sub-project 3's list in `docs/site-coherence.md`, with its paths:
  - `/airlines` is the table;
  - `/airlines/over-time` is the heat map;
  - `n`, `rank` and `scale` links redirect.

  Add a "Deferred minors" line under it once the final review has run.

- [ ] **Step 2: Check the docs-only change didn't disturb anything.**

Run: `uv run pytest -q 2>&1 | tail -2`
Expected: every test passes.

- [ ] **Step 3: Commit.**

```bash
git add docs/site-coherence.md
git commit -m "Roadmap: the airlines table is done

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0191mnN3iPgFXTdJ7jQemcY1"
```
