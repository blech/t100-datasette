# Aircraft Table and Manufacturer Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/aircraft/table` (families ranked by a chosen measure and year, each opening into its types) and `/aircraft/makers` (stacked chart of departures etc. by manufacturer), backed by a new `type_year` rollup.

**Architecture:** One new derived table, `type_year` (one row per aircraft type, year, domestic flag and service class), built in `build_database.py` like the other rollups. Two new canned queries in `datasette.yml` read it joined to `aircraft_types` (`maker`, `kind`) and `aircraft_family`. Two new plugin routes render two templates; each page has a small script and a pure-function module in `static/charts/src/` that the tests cover. The maker chart reuses `buildFamilySeries` with a new `maker` split.

**Tech Stack:** Python 3 / SQLite / Datasette canned queries, ES-module JS (no build step), Observable Plot (vendored), `pytest` and `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-20-aircraft-table-and-makers-design.md`

## Global Constraints

- Tests: `../t100-datasette/.venv/bin/python -m pytest tests -q` and `npm test` (the "Unexpected value in sys.prefix" warning is harmless). This worktree has no `t100.db`; tests build their own tiny database.
- Queries must work on SQLite 3.50.4 (Datasette's venv) as well as newer: no correlated subqueries that reference an outer alias inside a nested select.
- Freight is stored in pounds and shown in short tons (divide by 2,000).
- `schema.sql` must match `build_database.py` exactly (a test enforces this); a new table also needs `schema.sql` updated, and production needs the table loaded before the deploy (the smoke check calls `/-/derived`).
- Page text is rendered with `textContent`, never `innerHTML`, because type and maker names come from the data.
- No em dashes or marketing wording in page copy. Commit trailers: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01YRUDWbEF5PpwWHC7VAoc8P`.
- Pages cannot be checked visually here; say so in the final report.

## Review Focus

- A type whose `maker` is NULL (the six float/land types) must show as "Unknown maker", not "null" or a blank series (Task 2 query test, Task 3 JS test).
- A segment with no aircraft type, or a type id missing from `aircraft_types`, must stay in the totals (Task 1 test, Task 2 query test).
- A family with zero in the chosen year must be hidden, unless the search matches it (Task 3).
- A search that matches only some of a family's types must show just those types, and the family's total stays the family's total (Task 3).
- Total of zero must not produce NaN shares (Task 3).
- The route `/aircraft/table` and `/aircraft/makers` must not be swallowed by the `/aircraft/<slug>` family route (Task 4 test).
- Freight must be shown in short tons in the table and the chart (Task 3).
- Names containing `<` or `&` must not become markup (Task 4: rendering uses `textContent`; JS test checks the builder returns the raw string only).

## File Structure

| File | Responsibility |
|---|---|
| `build_database.py`, `schema.sql` | `type_year` table, `rebuild_type_year`, wired into `rebuild_derived_tables` |
| `datasette.yml` | queries `type_table`, `maker_by_year` |
| `static/charts/src/aircraft.js` (new) | pure functions: `KIND_OPTIONS`, `kindMatches`, `groupFamilies`, `sortFamilies` |
| `static/charts/src/rollup.js` | `buildFamilySeries` learns `split: 'maker'` and an `aircraftKind` filter |
| `static/charts/aircrafttable.js` (new) | page script for the table |
| `static/charts/makers.js` (new) | page script for the maker chart |
| `templates/aircraft_table.html`, `templates/aircraft_makers.html` (new) | the two pages |
| `plugins/t100_globe.py` | two routes, two views |
| `templates/rollup.html`, `templates/about.html` | links in; one grouping paragraph |
| `static/charts/style.css` | table styles |
| `scripts/smoke_check.sh` | checks for both pages and queries |
| `setup_database.md` | mention `type_year` in the derived-table list |
| tests | `tests/test_rollups.py`, `tests/test_rollup_queries.py`, `tests/test_rollup_pages.py`, `static/charts/test/aircraft.test.js`, `static/charts/test/rollup.test.js` |

---

### Task 1: The `type_year` table

**Files:**
- Modify: `build_database.py` (table DDL in `_LOOKUP_TABLES`, new `rebuild_type_year`, `rebuild_derived_tables`)
- Modify: `schema.sql`
- Test: `tests/test_rollups.py`

**Interfaces:**
- Produces: table `type_year(year, aircraft_type, domestic, service_class, deps, seats, passengers, freight)`; `build_database.rebuild_type_year(conn) -> int` (row count); key `"type_year"` in the dict returned by `rebuild_derived_tables`.

- [ ] **Step 1: Write the failing tests**

Add the import `rebuild_type_year` to the first line of `tests/test_rollups.py` (it already imports `rebuild_derived_tables, rebuild_aircraft_family, rebuild_aircraft_type_labels, rebuild_carrier_groups`), then append:

```python
def test_type_year_adds_up_to_the_segments_and_keeps_unknown_types(db_path):
    add_types(db_path, ("614", "6", "Boeing 737-800"))
    add_segments(db_path, "t100_domestic", [
        flight(aircraft_type="614", **{"class": "F"}, deps=10, pax=800, seats=1000),
        flight(aircraft_type="614", **{"class": "F"}, deps=5, pax=400, seats=500, month=2),
        flight(aircraft_type="999", **{"class": "F"}, deps=3),   # a type id BTS never defined
        flight(aircraft_type=None, **{"class": "G"}, deps=2, freight=4000),  # no type at all
    ])
    add_segments(db_path, "t100_international", [flight(aircraft_type="614", **{"class": "F"}, deps=1)])
    rows = query(db_path, "SELECT aircraft_type, domestic, service_class, deps, freight FROM type_year ORDER BY aircraft_type, domestic",
                 rebuild=rebuild_type_year)
    assert rows == [("614", 0, "F", 1, 0), ("614", 1, "F", 15, 0), ("999", 1, "F", 3, 0), ("unknown", 1, "G", 2, 4000)]
    total = query(db_path, "SELECT SUM(deps) FROM type_year", rebuild=rebuild_type_year)[0][0]
    assert total == 21


def test_type_year_is_part_of_the_full_rebuild(db_path):
    add_types(db_path, *TYPES)
    add_segments(db_path, "t100_domestic", [flight(aircraft_type="614", **{"class": "F"})])
    conn = sqlite3.connect(db_path)
    assert rebuild_derived_tables(conn)["type_year"] == 1
```

- [ ] **Step 2: Run to verify they fail**

Run: `../t100-datasette/.venv/bin/python -m pytest tests/test_rollups.py -q -k type_year`
Expected: FAIL (ImportError for `rebuild_type_year`).

- [ ] **Step 3: Implement**

In `build_database.py`, inside `_LOOKUP_TABLES`, after the `family_year` table block, add:

```sql
-- Yearly totals per aircraft type (service_class is the BTS class: F/L passenger, G/P cargo), by rebuild_type_year()
CREATE TABLE IF NOT EXISTS "type_year" (
   [year] INTEGER, [aircraft_type] TEXT, [domestic] INTEGER, [service_class] TEXT,
   [deps] INTEGER, [seats] INTEGER, [passengers] INTEGER, [freight] INTEGER,
   PRIMARY KEY ([year], [aircraft_type], [domestic], [service_class])
) WITHOUT ROWID;
```

After `rebuild_family_year`, add:

```python
def rebuild_type_year(conn: sqlite3.Connection) -> int:
    """Recompute type_year from the segment tables. Segments with no aircraft type are kept under 'unknown'."""
    create_schema(conn)
    with conn:
        conn.execute("DELETE FROM type_year")
        conn.execute(
            """
            INSERT INTO type_year
            SELECT year, COALESCE(NULLIF(aircraft_type, ''), 'unknown'), domestic, COALESCE(class, ''),
                   SUM(departures_performed), SUM(seats), SUM(passengers), SUM(freight)
            FROM t100
            WHERE year IS NOT NULL
            GROUP BY year, COALESCE(NULLIF(aircraft_type, ''), 'unknown'), domestic, COALESCE(class, '')
            """
        )
    return conn.execute("SELECT COUNT(*) FROM type_year").fetchone()[0]
```

In `rebuild_derived_tables`, add `"type_year": rebuild_type_year(conn),` after the `"family_year"` line.

In `schema.sql`, add after the `CREATE TABLE "t100_international" (...) ;` block and before the first `CREATE INDEX`:

```sql
CREATE TABLE "type_year" (
   [year] INTEGER, [aircraft_type] TEXT, [domestic] INTEGER, [service_class] TEXT,
   [deps] INTEGER, [seats] INTEGER, [passengers] INTEGER, [freight] INTEGER,
   PRIMARY KEY ([year], [aircraft_type], [domestic], [service_class])
) WITHOUT ROWID;

```

- [ ] **Step 4: Run the whole Python suite**

Run: `../t100-datasette/.venv/bin/python -m pytest tests -q`
Expected: all pass, including `test_schema_sql_matches_what_build_database_creates` (if it fails, the `schema.sql` text differs from the DDL; copy it exactly).

- [ ] **Step 5: Commit**

```bash
git add build_database.py schema.sql tests/test_rollups.py
git commit -m "Add the type_year rollup: yearly totals per aircraft type

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YRUDWbEF5PpwWHC7VAoc8P"
```

---

### Task 2: Queries `type_table` and `maker_by_year`

**Files:**
- Modify: `datasette.yml` (after `family_detail`)
- Test: `tests/test_rollup_queries.py`

**Interfaces:**
- Consumes: `type_year`, `aircraft_types(ac_typeid, name, maker, kind)`, `aircraft_family(aircraft_type, family, aircraft_class)`.
- Produces: `/t100/type_table.json?year=YYYY` rows `{type_id, name, family, maker, aircraft_kind, first_year, last_year, deps, seats, passengers, freight}` (the last four are the chosen year's totals, 0 if none); `/t100/maker_by_year.json` rows `{year, maker, aircraft_kind, service, kind, deps, seats, passengers, freight}` with `service` "domestic"/"international" and `kind` "passenger"/"freight".

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_rollup_queries.py`:

```python
def ty(year, aircraft_type, domestic, service_class, deps):
    return dict(year=year, aircraft_type=aircraft_type, domestic=domestic, service_class=service_class,
                deps=deps, seats=deps * 100, passengers=deps * 80, freight=deps * 1000)


def test_type_table_gives_each_type_its_year_and_its_span(ds, db_path):
    put(db_path, "aircraft_types", [dict(ac_typeid="614", ac_group="6", name="Boeing 737-800", maker="Boeing", kind="Jet, twin-engine"),
                                    dict(ac_typeid="091", ac_group="0", name="Float/Amphib Turbine", maker=None, kind="Piston, single-engine")])
    put(db_path, "aircraft_family", [dict(aircraft_type="614", name="Boeing 737-800", family="Boeing 737", subfamily="737 NG", aircraft_class="Narrowbody jet", fallback=0)])
    put(db_path, "type_year", [ty(2001, "614", 1, "F", 4), ty(2019, "614", 1, "F", 10), ty(2019, "614", 0, "G", 2),
                               ty(2019, "091", 1, "F", 1), ty(2019, "999", 1, "F", 3), ty(2019, "unknown", 1, "F", 5)])
    rows = {r["type_id"]: r for r in get_json(ds, "/t100/type_table.json?_shape=objects&year=2019")["rows"]}
    assert rows["614"]["deps"] == 12 and rows["614"]["family"] == "Boeing 737" and rows["614"]["maker"] == "Boeing"
    assert (rows["614"]["first_year"], rows["614"]["last_year"]) == (2001, 2019)
    assert rows["091"]["maker"] == "Unknown maker" and rows["091"]["family"] == "Unknown"
    assert rows["999"]["name"] == "Type 999" and rows["unknown"]["name"] == "Type not reported"
    assert sum(r["deps"] for r in rows.values()) == 21
    other = {r["type_id"]: r for r in get_json(ds, "/t100/type_table.json?_shape=objects&year=2001")["rows"]}
    assert other["614"]["deps"] == 4 and other["091"]["deps"] == 0


def test_maker_by_year_labels_service_and_kind_and_names_unknown_makers(ds, db_path):
    put(db_path, "aircraft_types", [dict(ac_typeid="614", ac_group="6", name="Boeing 737-800", maker="Boeing", kind="Jet, twin-engine"),
                                    dict(ac_typeid="091", ac_group="0", name="Float/Amphib Turbine", maker=None, kind="Piston, single-engine")])
    put(db_path, "type_year", [ty(2019, "614", 1, "F", 10), ty(2019, "614", 1, "L", 5), ty(2019, "614", 0, "G", 2), ty(2019, "091", 1, "F", 1)])
    rows = get_json(ds, "/t100/maker_by_year.json?_shape=objects")["rows"]
    got = {(r["maker"], r["service"], r["kind"]): r["deps"] for r in rows}
    assert got == {("Boeing", "domestic", "passenger"): 15, ("Boeing", "international", "freight"): 2, ("Unknown maker", "domestic", "passenger"): 1}
    assert {r["aircraft_kind"] for r in rows} == {"Jet, twin-engine", "Piston, single-engine"}
```

- [ ] **Step 2: Run to verify they fail**

Run: `../t100-datasette/.venv/bin/python -m pytest tests/test_rollup_queries.py -q -k "type_table or maker_by_year"`
Expected: FAIL (404, no such query).

- [ ] **Step 3: Implement**

In `datasette.yml`, after the `family_detail` query block (before the `# what the airline search offers` comment), add:

```yaml
      type_table:
        sql: |
          SELECT
            y.aircraft_type AS type_id,
            COALESCE(t.name, CASE y.aircraft_type WHEN 'unknown' THEN 'Type not reported' ELSE 'Type ' || y.aircraft_type END) AS name,
            COALESCE(f.family, 'Unknown') AS family,
            COALESCE(t.maker, 'Unknown maker') AS maker,
            COALESCE(t.kind, 'Unknown') AS aircraft_kind,
            MIN(CASE WHEN y.deps > 0 THEN y.year END) AS first_year,
            MAX(CASE WHEN y.deps > 0 THEN y.year END) AS last_year,
            SUM(CASE WHEN y.year = CAST(:year AS INTEGER) THEN y.deps ELSE 0 END) AS deps,
            SUM(CASE WHEN y.year = CAST(:year AS INTEGER) THEN y.seats ELSE 0 END) AS seats,
            SUM(CASE WHEN y.year = CAST(:year AS INTEGER) THEN y.passengers ELSE 0 END) AS passengers,
            SUM(CASE WHEN y.year = CAST(:year AS INTEGER) THEN y.freight ELSE 0 END) AS freight
          FROM type_year y
            LEFT JOIN aircraft_types t ON t.ac_typeid = y.aircraft_type
            LEFT JOIN aircraft_family f ON f.aircraft_type = y.aircraft_type
          GROUP BY y.aircraft_type
          ORDER BY y.aircraft_type

      maker_by_year:
        sql: |
          SELECT
            y.year,
            COALESCE(t.maker, 'Unknown maker') AS maker,
            COALESCE(t.kind, 'Unknown') AS aircraft_kind,
            CASE WHEN y.domestic = 1 THEN 'domestic' ELSE 'international' END AS service,
            CASE WHEN y.service_class IN ('G', 'P') THEN 'freight' ELSE 'passenger' END AS kind,
            SUM(y.deps) AS deps, SUM(y.seats) AS seats, SUM(y.passengers) AS passengers, SUM(y.freight) AS freight
          FROM type_year y LEFT JOIN aircraft_types t ON t.ac_typeid = y.aircraft_type
          GROUP BY y.year, maker, aircraft_kind, service, kind
          ORDER BY y.year, maker
```

- [ ] **Step 4: Run to verify they pass**

Run: `../t100-datasette/.venv/bin/python -m pytest tests -q`
Expected: all pass. (`:year` is a named parameter; Datasette shows an input form for it, and the JSON endpoint takes `?year=`.)

- [ ] **Step 5: Commit**

```bash
git add datasette.yml tests/test_rollup_queries.py
git commit -m "Add the type_table and maker_by_year queries

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YRUDWbEF5PpwWHC7VAoc8P"
```

---

### Task 3: Pure JavaScript for the table and the maker series

**Files:**
- Create: `static/charts/src/aircraft.js`
- Modify: `static/charts/src/rollup.js` (`SPLIT_LABEL`, `buildFamilySeries`)
- Test: `static/charts/test/aircraft.test.js` (new), `static/charts/test/rollup.test.js`

**Interfaces:**
- Consumes: rows from `type_table` (Task 2) and `maker_by_year` (Task 2); `slugify` from `rollup.js`.
- Produces:
  - `KIND_OPTIONS = [{ value, label }]` with values `'all'`, `'Jet'`, `'Turboprop'`, `'Piston'`, `'Helicopter'`.
  - `kindMatches(aircraftKind: string, value: string) -> boolean` (`'all'` matches everything; otherwise prefix match).
  - `groupFamilies(rows, { measure, kind = 'all', maker = 'all', q = '' }) -> { families, total }` where each family is `{ family, slug, maker, aircraftKind, firstYear, lastYear, value, share, types: [{ typeId, name, maker, aircraftKind, firstYear, lastYear, value, share }], matched }`, `value` in display units (freight in short tons), `share` = value / total (0 when total is 0), `types` sorted by value desc, `matched` true when the search matched this family only through some of its types.
  - `sortFamilies(families, key, dir)` where `key` is one of `'family' | 'maker' | 'aircraftKind' | 'firstYear' | 'lastYear' | 'value'` and `dir` is `'asc' | 'desc'`; returns a new array.
  - `buildFamilySeries(rows, { ..., split: 'maker', aircraftKind: 'all' })`.

- [ ] **Step 1: Write the failing tests**

Create `static/charts/test/aircraft.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { KIND_OPTIONS, kindMatches, groupFamilies, sortFamilies } from '../src/aircraft.js';

const t = (type_id, name, family, maker, aircraft_kind, deps, extra = {}) => ({
  type_id, name, family, maker, aircraft_kind, first_year: 1990, last_year: 2025, deps, seats: deps * 100, passengers: deps * 80, freight: deps * 2000, ...extra,
});
const rows = [
  t('614', 'Boeing 737-800', 'Boeing 737', 'Boeing', 'Jet, twin-engine', 60),
  t('619', 'Boeing 737-300', 'Boeing 737', 'Boeing', 'Jet, twin-engine', 30, { first_year: 1990, last_year: 2018 }),
  t('694', 'Airbus Industrie A320-100/200', 'Airbus A320 family', 'Airbus', 'Jet, twin-engine', 100),
  t('479', 'Pilatus PC-12', 'Other turboprop', 'Pilatus', 'Turboprop, one or two engines', 10),
  t('091', 'Float/Amphib Turbine', 'Unknown', 'Unknown maker', 'Piston, single-engine', 0),
];

test('families add up their types and rank by the chosen measure, with shares of the total', () => {
  const { families, total } = groupFamilies(rows, { measure: 'deps' });
  assert.deepEqual(families.map((f) => [f.family, f.value]), [['Airbus A320 family', 100], ['Boeing 737', 90], ['Other turboprop', 10]]);
  assert.equal(total, 200);
  assert.equal(families[1].share, 0.45);
  assert.deepEqual(families[1].types.map((x) => x.typeId), ['614', '619']);
  assert.equal(families[1].lastYear, 2025);
  assert.equal(families[1].slug, 'boeing-737');
});

test('a family with nothing in the year is hidden, and shares do not divide by zero', () => {
  const none = rows.map((r) => ({ ...r, deps: 0 }));
  const { families, total } = groupFamilies(none, { measure: 'deps' });
  assert.deepEqual(families, []);
  assert.equal(total, 0);
});

test('freight is shown in short tons', () => {
  const { families } = groupFamilies([t('1', 'Boeing 747-400F', 'Boeing 747', 'Boeing', 'Jet, four-engine', 3)], { measure: 'freight' });
  assert.equal(families[0].value, 3);  // 3 deps x 2,000 lb = 6,000 lb = 3 short tons
});

test('a family takes the maker and kind of its busiest type', () => {
  const mixed = [t('1', 'Canadair RJ-200', 'Regional jets', 'Canadair', 'Jet, twin-engine', 5), t('2', 'Bombardier CRJ 900', 'Regional jets', 'Bombardier', 'Jet, twin-engine', 9)];
  assert.equal(groupFamilies(mixed, { measure: 'deps' }).families[0].maker, 'Bombardier');
});

test('the kind and maker filters narrow the types, and the total follows', () => {
  const jets = groupFamilies(rows, { measure: 'deps', kind: 'Jet' });
  assert.deepEqual(jets.families.map((f) => f.family), ['Airbus A320 family', 'Boeing 737']);
  assert.equal(jets.total, 190);
  const boeing = groupFamilies(rows, { measure: 'deps', maker: 'Boeing' });
  assert.deepEqual(boeing.families.map((f) => f.family), ['Boeing 737']);
  assert.equal(boeing.families[0].share, 1);
});

test('a search matching a family name keeps all its types; one matching a type keeps only that type', () => {
  const byFamily = groupFamilies(rows, { measure: 'deps', q: 'boeing 737' }).families;
  assert.deepEqual(byFamily.map((f) => [f.family, f.types.length, f.matched]), [['Boeing 737', 2, false]]);
  const byType = groupFamilies(rows, { measure: 'deps', q: '737-300' }).families;
  assert.deepEqual(byType.map((f) => [f.family, f.types.map((x) => x.typeId), f.matched, f.value]), [['Boeing 737', ['619'], true, 90]]);
});

test('a search finds a family with nothing in the year', () => {
  const found = groupFamilies(rows, { measure: 'deps', q: 'float' }).families;
  assert.deepEqual(found.map((f) => f.family), ['Unknown']);
});

test('sortFamilies orders by any key in either direction without changing its input', () => {
  const { families } = groupFamilies(rows, { measure: 'deps' });
  assert.deepEqual(sortFamilies(families, 'family', 'asc').map((f) => f.family), ['Airbus A320 family', 'Boeing 737', 'Other turboprop']);
  assert.deepEqual(sortFamilies(families, 'value', 'asc').map((f) => f.family), ['Other turboprop', 'Boeing 737', 'Airbus A320 family']);
  assert.deepEqual(families.map((f) => f.family), ['Airbus A320 family', 'Boeing 737', 'Other turboprop']);
});

test('kindMatches takes the first word of the BTS kind', () => {
  assert.ok(kindMatches('Jet, four-engine', 'Jet') && kindMatches('Turboprop, four-engine', 'Turboprop') && kindMatches('x', 'all'));
  assert.ok(!kindMatches('Jet, twin-engine', 'Turboprop'));
  assert.deepEqual(KIND_OPTIONS.map((k) => k.value), ['all', 'Jet', 'Turboprop', 'Piston', 'Helicopter']);
});

test('names with markup characters come through as plain strings', () => {
  const { families } = groupFamilies([t('1', '<b>x</b> & y', 'Fam <i>', 'M&M', 'Jet, twin-engine', 1)], { measure: 'deps' });
  assert.equal(families[0].types[0].name, '<b>x</b> & y');
});
```

Append to `static/charts/test/rollup.test.js` (add `buildFamilySeries` to its import from `'../src/rollup.js'` if not already imported):

```js
const m = (year, maker, deps, extra = {}) => ({ year, maker, aircraft_kind: 'Jet, twin-engine', service: 'domestic', kind: 'passenger', deps, seats: 0, passengers: 0, freight: 0, ...extra });

test('buildFamilySeries can split by maker, keeping the biggest and folding the rest into Other', () => {
  const rows = [m(2019, 'Boeing', 50), m(2019, 'Airbus', 30), m(2019, 'Embraer', 5), m(2019, 'Cessna', 1), m(2020, 'Boeing', 40)];
  const res = buildFamilySeries(rows, { measure: 'deps', split: 'maker', top: 2 });
  assert.deepEqual(res.series, ['Boeing', 'Airbus', 'Other']);
  assert.equal(res.points.find((p) => p.year === 2019 && p.series === 'Other').value, 6);
});

test('buildFamilySeries filters by aircraft kind and still takes the other filters', () => {
  const rows = [m(2019, 'Boeing', 50), m(2019, 'Pilatus', 7, { aircraft_kind: 'Turboprop, one or two engines' }), m(2019, 'Boeing', 9, { service: 'international' })];
  const res = buildFamilySeries(rows, { measure: 'deps', split: 'maker', aircraftKind: 'Turboprop' });
  assert.deepEqual(res.series, ['Pilatus']);
  assert.deepEqual(buildFamilySeries(rows, { measure: 'deps', split: 'maker', service: 'domestic', aircraftKind: 'Jet' }).points.map((p) => p.value), [50]);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test`
Expected: FAIL (cannot find `../src/aircraft.js`; maker split undefined).

- [ ] **Step 3: Implement**

Create `static/charts/src/aircraft.js`:

```js
import { slugify } from './rollup.js';

const LB_PER_SHORT_TON = 2000;

// The aircraft kinds the pages offer; BTS's kind text starts with one of these words ("Jet, four-engine")
export const KIND_OPTIONS = [
  { value: 'all', label: 'all aircraft' },
  { value: 'Jet', label: 'jets' },
  { value: 'Turboprop', label: 'turboprops' },
  { value: 'Piston', label: 'piston aircraft' },
  { value: 'Helicopter', label: 'helicopters' },
];

export const kindMatches = (aircraftKind, value) => value === 'all' || String(aircraftKind || '').startsWith(value);

const amount = (row, measure) => (Number(row[measure]) || 0) / (measure === 'freight' ? LB_PER_SHORT_TON : 1);

// Rows from type_table (one per aircraft type, with the chosen year's totals) -> families, each with its types.
// Types are filtered by kind and maker; a family's maker and kind are those of its busiest type. Families with
// nothing in the year are left out unless the search `q` names them (or one of their types).
export function groupFamilies(rows, { measure = 'passengers', kind = 'all', maker = 'all', q = '' } = {}) {
  const needle = String(q).trim().toLowerCase();
  const byFamily = new Map();
  for (const r of rows) {
    if (!kindMatches(r.aircraft_kind, kind)) continue;
    if (maker !== 'all' && r.maker !== maker) continue;
    const fam = byFamily.get(r.family) || { family: r.family, slug: slugify(r.family), types: [] };
    byFamily.set(r.family, fam);
    fam.types.push({
      typeId: r.type_id, name: r.name, maker: r.maker, aircraftKind: r.aircraft_kind,
      firstYear: Number(r.first_year) || null, lastYear: Number(r.last_year) || null, value: amount(r, measure), share: 0,
    });
  }
  const families = [];
  for (const fam of byFamily.values()) {
    const value = fam.types.reduce((s, x) => s + x.value, 0);
    const nameHit = fam.family.toLowerCase().includes(needle);
    const typeHits = needle ? fam.types.filter((x) => x.name.toLowerCase().includes(needle)) : fam.types;
    if (needle && !nameHit && !typeHits.length) continue;
    if (value <= 0 && !needle) continue;
    const busiest = [...fam.types].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))[0];
    families.push({
      family: fam.family, slug: fam.slug, maker: busiest.maker, aircraftKind: busiest.aircraftKind,
      firstYear: Math.min(...fam.types.map((x) => x.firstYear ?? Infinity)), lastYear: Math.max(...fam.types.map((x) => x.lastYear ?? 0)),
      value, share: 0, matched: Boolean(needle) && !nameHit,
      types: (nameHit ? fam.types : typeHits).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name)),
    });
  }
  // shares are of everything the filters leave, not of what the search shows
  const everything = [...byFamily.values()].reduce((s, f) => s + f.types.reduce((a, x) => a + x.value, 0), 0);
  for (const f of families) {
    f.share = everything > 0 ? f.value / everything : 0;
    for (const x of f.types) x.share = everything > 0 ? x.value / everything : 0;
    if (!Number.isFinite(f.firstYear)) f.firstYear = null;
  }
  families.sort((a, b) => b.value - a.value || a.family.localeCompare(b.family));
  return { families, total: everything };
}

const TEXT_KEYS = new Set(['family', 'maker', 'aircraftKind']);

export function sortFamilies(families, key, dir = 'desc') {
  const sign = dir === 'asc' ? 1 : -1;
  return [...families].sort((a, b) => {
    const x = a[key], y = b[key];
    const c = TEXT_KEYS.has(key) ? String(x).localeCompare(String(y)) : (x ?? -Infinity) - (y ?? -Infinity);
    return sign * c || a.family.localeCompare(b.family);
  });
}
```

Note: in the "nothing in the year" test the expected `total` is `0`, and in the filter test the expected total is `190`; both follow from `everything` above. In the "search finds a family with nothing" test `total` is not asserted.

In `static/charts/src/rollup.js`, change `SPLIT_LABEL` and `buildFamilySeries`:

```js
const SPLIT_LABEL = {
  subfamily: (r) => r.subfamily || 'All variants',
  airline: (r) => r.group_name || 'Unknown carrier',
  maker: (r) => r.maker || 'Unknown maker',
  service: (r) => SERVICE_LABELS[r.service] || r.service,
};
```

In the signature `buildFamilySeries(rows, { measure = 'passengers', kind = 'all', service = 'all', split = 'subfamily', top = 8 } = {})` add `aircraftKind = 'all'`; as the first line inside the `for (const r of rows)` loop add:

```js
    if (aircraftKind !== 'all' && !String(r.aircraft_kind || '').startsWith(aircraftKind)) continue;
```

and change `const folded = split === 'airline' && order.length > top;` to `const folded = (split === 'airline' || split === 'maker') && order.length > top;`. The sort branch `else order.sort((a, b) => totals.get(b) - ...)` already orders makers by total.

- [ ] **Step 4: Run to verify they pass**

Run: `npm test`
Expected: all pass (existing 191 plus the new ones).

- [ ] **Step 5: Commit**

```bash
git add static/charts/src/aircraft.js static/charts/src/rollup.js static/charts/test/aircraft.test.js static/charts/test/rollup.test.js
git commit -m "Aircraft helpers: group types into families, and split a series by maker

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YRUDWbEF5PpwWHC7VAoc8P"
```

---

### Task 4: The two pages

**Files:**
- Modify: `plugins/t100_globe.py` (routes, two views)
- Create: `templates/aircraft_table.html`, `templates/aircraft_makers.html`, `static/charts/aircrafttable.js`, `static/charts/makers.js`
- Modify: `static/charts/style.css`, `templates/rollup.html`, `templates/about.html`
- Test: `tests/test_rollup_pages.py`

**Interfaces:**
- Consumes: Task 2 queries; Task 3 `groupFamilies`, `sortFamilies`, `KIND_OPTIONS`, `buildFamilySeries`.
- Produces: pages `GET /aircraft/table` (element ids `aircraft-table`, `at-measure`, `at-year`, `at-kind`, `at-maker`, `at-q`) and `GET /aircraft/makers` (ids `maker-chart`, `mk-measure`, `mk-kind`, `mk-service`, `mk-aircraft`).

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_rollup_pages.py`:

```python
def test_table_and_maker_pages_render_with_their_assets_and_controls(ds):
    table = get(ds, "/aircraft/table")
    assert table.status_code == 200
    for id_ in ["aircraft-table", "at-measure", "at-year", "at-kind", "at-maker", "at-q"]:
        assert f'id="{id_}"' in table.text
    assert "/static/charts/aircrafttable.js" in table.text
    makers = get(ds, "/aircraft/makers")
    assert makers.status_code == 200
    for id_ in ["maker-chart", "mk-measure", "mk-kind", "mk-service", "mk-aircraft"]:
        assert f'id="{id_}"' in makers.text
    assert "/static/charts/makers.js" in makers.text and "How makers are counted" in makers.text


def test_the_new_pages_are_not_mistaken_for_families_and_are_linked_from_aircraft(ds, db_path):
    put(db_path, "family_year", [fam(2019, "Table", 1, "F", 1)])  # a family slugged "table" must not capture the table page
    assert 'id="aircraft-table"' in get(ds, "/aircraft/table").text
    aircraft = get(ds, "/aircraft").text
    assert 'href="/aircraft/table"' in aircraft and 'href="/aircraft/makers"' in aircraft
    assert 'aria-current="page">table<' in get(ds, "/aircraft/table").text
    assert 'aria-current="page">makers<' in get(ds, "/aircraft/makers").text
```

(`put`, `fam` are already imported at the top of that file from `tests.test_rollup_queries`.)

- [ ] **Step 2: Run to verify they fail**

Run: `../t100-datasette/.venv/bin/python -m pytest tests/test_rollup_pages.py -q`
Expected: FAIL (404s).

- [ ] **Step 3: Implement the plugin routes**

In `plugins/t100_globe.py`, add the two routes immediately after the `/aircraft/engines` route (before `/aircraft/<slug>`):

```python
        (r"^/aircraft/table$", aircraft_table_page),
        (r"^/aircraft/makers$", aircraft_makers_page),
```

and, after `engines_page`, the views:

```python
def aircraft_view(template, crumb):
    async def view(datasette, request):
        html = await datasette.render_template(
            template,
            {
                "latest_year": (datasette.plugin_config("t100_globe") or {}).get("max_year", 2025),
                "crumbs": trail(datasette, ("aircraft", "/aircraft"), (crumb, None)),
            },
            request=request,
        )
        return Response.html(html)

    return view


aircraft_table_page = aircraft_view("aircraft_table.html", "table")
aircraft_makers_page = aircraft_view("aircraft_makers.html", "makers")
```

Python resolves the names at module load, and `register_routes` runs later, so defining the two views after `register_routes` is fine.

- [ ] **Step 4: Implement the templates**

`templates/aircraft_table.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Aircraft table · T-100</title>
  <link rel="stylesheet" href="/static/landing/style.css">
  <link rel="stylesheet" href="/static/charts/style.css">
  <link rel="stylesheet" href="/static/nav/style.css">
  <script type="module" src="/static/nav/main.js"></script>
</head>
<body data-latest-year="{{ latest_year }}">
  <main>
    {% include "_nav.html" %}
    <p class="related"><a href="/aircraft">All aircraft families</a> · <a href="/aircraft/makers">Aircraft by maker</a></p>
    <h1>Aircraft table</h1>
    <p class="intro">Every aircraft family, ranked. Open a family to see its types, or search for a type by name.</p>
    <p class="chart-sentence">
      Show <select id="at-measure" aria-label="Measure"></select>
      in <select id="at-year" aria-label="Year"></select>
      for <select id="at-kind" aria-label="Kind of aircraft"></select>
      made by <select id="at-maker" aria-label="Maker"><option value="all">any maker</option></select>.
    </p>
    <p><label>Search <input id="at-q" type="search" placeholder="Name, such as 737 or Cessna" autocomplete="off"></label></p>
    <div id="aircraft-table" aria-live="polite">Loading table…</div>
    <p class="note">Families group BTS's aircraft types (a 737-300 and a 737-800 are both Boeing 737s). A family's maker and kind are those of its busiest type. The share is of the total for the chosen year, kind and maker. Freight is in short tons (2,000 lb), and includes cargo in the holds of passenger aircraft. More on <a href="/about#groupings">how things are grouped</a>.</p>
  </main>
  <script type="module" src="/static/charts/aircrafttable.js"></script>
</body>
</html>
```

`templates/aircraft_makers.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Aircraft by maker · T-100</title>
  <link rel="stylesheet" href="/static/landing/style.css">
  <link rel="stylesheet" href="/static/charts/style.css">
  <link rel="stylesheet" href="/static/nav/style.css">
  <script type="module" src="/static/nav/main.js"></script>
</head>
<body>
  <main>
    {% include "_nav.html" %}
    <p class="related"><a href="/aircraft">All aircraft families</a> · <a href="/aircraft/table">Aircraft table</a></p>
    <h1>Aircraft by maker</h1>
    <p class="intro">Who built the aircraft that flew, year by year.</p>
    <p class="chart-sentence">
      Show <select id="mk-measure" aria-label="Measure"></select>
      for <select id="mk-kind" aria-label="Kind of flight"><option value="passenger">passenger flights</option><option value="freight">freight flights</option><option value="all">all flights</option></select>
      on <select id="mk-service" aria-label="Routes"><option value="all">all routes</option><option value="domestic">domestic routes</option><option value="international">international routes</option></select>
      by <select id="mk-aircraft" aria-label="Kind of aircraft"></select>.
    </p>
    <div id="maker-chart" aria-live="polite">Loading chart…</div>
    <details class="note">
      <summary>How makers are counted</summary>
      <ul>
        <li>The maker is read from the aircraft's name in the BTS data. Spelling variants are merged (Beech and Beechcraft, Gulfstream and Gulfstream Aerospace) and obvious typos corrected.</li>
        <li>Takeovers are not followed. McDonnell Douglas, Boeing, Canadair and Bombardier, and Raytheon Beechcraft and Beechcraft, are separate makers. A DC-9 and an MD-11 share a maker; a DC-9 and a 737 do not.</li>
        <li>A few generic float and land aircraft name no maker and are counted as "Unknown maker".</li>
        <li>More on <a href="/about#groupings">how things are grouped</a>.</li>
      </ul>
    </details>
    <p class="note">Each bar is one year. The eight biggest makers for the chosen flights are shown, the rest as Other. Freight is in short tons (2,000 lb).</p>
  </main>
  <script type="module" src="/static/charts/makers.js"></script>
</body>
</html>
```

In `templates/rollup.html`, change the aircraft branch of the `related` line to:

```html
{% if kind == "aircraft" %}<a href="/airlines">Airlines</a> · <a href="/aircraft/table">Aircraft table</a> · <a href="/aircraft/makers">Aircraft by maker</a> · <a href="/aircraft/engines">Twin jets took over the long haul</a>
```

(keeping the existing `{% else %}…{% endif %}` unchanged).

In `templates/about.html`, add as a new `<li>` after the "Aircraft families." item in `#groupings`:

```html
      <li><strong>Aircraft makers.</strong> Each type's maker is read from its name (BTS's own manufacturer field is spelled inconsistently), using the rules in <code>data/aircraft_makers.csv</code>. Takeovers are not followed: McDonnell Douglas and Boeing, or Canadair and Bombardier, are counted as separate makers, so a DC-9 and an MD-11 share a maker but a DC-9 and a 737 do not.</li>
```

- [ ] **Step 5: Implement the scripts**

`static/charts/aircrafttable.js`:

```js
import { HEAT_MEASURES } from '/static/charts/src/heatmap.js';
import { groupFamilies, sortFamilies, KIND_OPTIONS } from '/static/charts/src/aircraft.js';
import { queryUrl, fetchRows } from '/static/globe/src/api.js';
import { replaceSearch } from '/static/nav/src/state.js';

const $ = (id) => document.getElementById(id);
const latest = Number(document.body.dataset.latestYear);
const params = new URLSearchParams(location.search);
const pick = (key, allowed, fallback) => (allowed.includes(params.get(key)) ? params.get(key) : fallback);
const years = Array.from({ length: latest - 1990 + 1 }, (_, i) => String(latest - i));
const state = {
  measure: pick('measure', Object.keys(HEAT_MEASURES), 'passengers'),
  year: pick('year', years, String(latest)),
  kind: pick('kind', KIND_OPTIONS.map((k) => k.value), 'all'),
  maker: params.get('maker') || 'all',
  q: params.get('q') || '',
  sort: pick('sort', ['family', 'maker', 'aircraftKind', 'firstYear', 'lastYear', 'value'], 'value'),
  dir: pick('dir', ['asc', 'desc'], 'desc'),
};
const open = new Set();
let rows = [];

const fmt = (v) => Math.round(v).toLocaleString('en-US');
const pct = (v) => `${(v * 100).toFixed(v > 0 && v < 0.001 ? 2 : 1)}%`;
const span = (a, b) => (a ? (a === b ? String(a) : `${a}–${b}`) : '');
const unit = () => HEAT_MEASURES[state.measure].toLowerCase();

function pushState() {
  const q = new URLSearchParams();
  const defaults = { measure: 'passengers', year: String(latest), kind: 'all', maker: 'all', q: '', sort: 'value', dir: 'desc' };
  for (const [k, v] of Object.entries(state)) if (v !== defaults[k]) q.set(k, v);
  history.replaceState(null, '', `${location.pathname}${replaceSearch(location.search, Object.keys(defaults), `?${q}`)}`);
}

const cell = (text, cls) => { const td = document.createElement('td'); td.textContent = text; if (cls) td.className = cls; return td; };

function headerCell(key, label, cls) {
  const th = document.createElement('th');
  if (cls) th.className = cls;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'sort';
  b.textContent = label + (state.sort === key ? (state.dir === 'asc' ? ' ▲' : ' ▼') : '');
  b.addEventListener('click', () => {
    state.dir = state.sort === key && state.dir === 'desc' ? 'asc' : 'desc';
    if (state.sort !== key) state.dir = key === 'value' || key === 'lastYear' ? 'desc' : 'asc';
    state.sort = key;
    pushState(); draw();
  });
  th.append(b);
  return th;
}

function typeRow(x) {
  const tr = document.createElement('tr');
  tr.className = 'type-row';
  tr.append(cell(x.name, 'left type-name'), cell(x.maker, 'left'), cell(x.aircraftKind, 'left'), cell(span(x.firstYear, x.lastYear)), cell(fmt(x.value)), cell(pct(x.share)));
  return tr;
}

function draw() {
  const box = $('aircraft-table');
  const { families, total } = groupFamilies(rows, state);
  box.replaceChildren();
  if (!families.length) { box.textContent = state.q ? `Nothing matches "${state.q}".` : `No ${unit()} for this selection.`; return; }
  const sorted = sortFamilies(families, state.sort, state.dir);
  const table = document.createElement('table');
  const head = document.createElement('tr');
  head.append(headerCell('family', 'Family', 'left'), headerCell('maker', 'Maker', 'left'), headerCell('aircraftKind', 'Kind', 'left'),
    headerCell('lastYear', 'Flew'), headerCell('value', HEAT_MEASURES[state.measure]), document.createElement('th'));
  head.lastChild.textContent = 'Share';
  const thead = document.createElement('thead');
  thead.append(head);
  const tbody = document.createElement('tbody');
  for (const f of sorted) {
    const tr = document.createElement('tr');
    const first = document.createElement('td');
    first.className = 'left';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'twist';
    const isOpen = open.has(f.family) || f.matched;
    toggle.textContent = isOpen ? '▾' : '▸';
    toggle.setAttribute('aria-expanded', String(isOpen));
    toggle.setAttribute('aria-label', `${isOpen ? 'Hide' : 'Show'} the types in ${f.family}`);
    toggle.addEventListener('click', () => { if (open.has(f.family)) open.delete(f.family); else open.add(f.family); draw(); });
    const link = document.createElement('a');
    link.href = `/aircraft/${f.slug}`;
    link.textContent = f.family;
    first.append(toggle, ' ', link);
    tr.append(first, cell(f.maker, 'left'), cell(f.aircraftKind, 'left'), cell(span(f.firstYear, f.lastYear)), cell(fmt(f.value)), cell(pct(f.share)));
    tbody.append(tr);
    if (isOpen) for (const x of f.types) tbody.append(typeRow(x));
  }
  table.append(thead, tbody);
  box.append(table);
  const note = document.createElement('p');
  note.className = 'note';
  note.textContent = `${families.length} families, ${fmt(total)} ${unit()} in ${state.year}.`;
  box.append(note);
}

async function load() {
  $('aircraft-table').textContent = 'Loading table…';
  try {
    rows = (await fetchRows(queryUrl('type_table', { year: state.year }))).rows;
  } catch (err) {
    console.error(err);
    $('aircraft-table').textContent = 'Could not load the table.';
    return;
  }
  const makers = [...new Set(rows.map((r) => r.maker))].sort((a, b) => a.localeCompare(b));
  const sel = $('at-maker');
  sel.replaceChildren(new Option('any maker', 'all'), ...makers.map((m) => new Option(m, m)));
  if (state.maker !== 'all' && !makers.includes(state.maker)) state.maker = 'all';
  sel.value = state.maker;
  draw();
}

function main() {
  for (const [k, label] of Object.entries(HEAT_MEASURES)) $('at-measure').append(new Option(label.toLowerCase(), k));
  for (const y of years) $('at-year').append(new Option(y, y));
  for (const k of KIND_OPTIONS) $('at-kind').append(new Option(k.label, k.value));
  $('at-measure').value = state.measure;
  $('at-year').value = state.year;
  $('at-kind').value = state.kind;
  $('at-q').value = state.q;
  $('at-measure').addEventListener('change', (e) => { state.measure = e.target.value; pushState(); draw(); });
  $('at-kind').addEventListener('change', (e) => { state.kind = e.target.value; pushState(); draw(); });
  $('at-maker').addEventListener('change', (e) => { state.maker = e.target.value; pushState(); draw(); });
  $('at-q').addEventListener('input', (e) => { state.q = e.target.value; pushState(); draw(); });
  $('at-year').addEventListener('change', (e) => { state.year = e.target.value; pushState(); load(); });
  load();
}

main();
```

`static/charts/makers.js`:

```js
import * as Plot from '/static/charts/vendor/plot.js';
import { HEAT_MEASURES } from '/static/charts/src/heatmap.js';
import { buildFamilySeries, SERIES_COLORS, OTHER_COLOR } from '/static/charts/src/rollup.js';
import { KIND_OPTIONS } from '/static/charts/src/aircraft.js';
import { queryUrl, fetchRows } from '/static/globe/src/api.js';
import { replaceSearch } from '/static/nav/src/state.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const pick = (key, allowed, fallback) => (allowed.includes(params.get(key)) ? params.get(key) : fallback);
const state = {
  measure: pick('measure', Object.keys(HEAT_MEASURES), 'passengers'),
  kind: pick('flights', ['passenger', 'freight', 'all'], 'passenger'),
  service: pick('service', ['all', 'domestic', 'international'], 'all'),
  aircraftKind: pick('aircraft', KIND_OPTIONS.map((k) => k.value), 'all'),
};
let rows = [];

const unit = () => HEAT_MEASURES[state.measure].toLowerCase().replace(/ \(.*/, '');
const fmt = (v) => Math.round(v).toLocaleString('en-US');

function pushState() {
  const q = new URLSearchParams();
  if (state.measure !== 'passengers') q.set('measure', state.measure);
  if (state.kind !== 'passenger') q.set('flights', state.kind);
  if (state.service !== 'all') q.set('service', state.service);
  if (state.aircraftKind !== 'all') q.set('aircraft', state.aircraftKind);
  history.replaceState(null, '', `${location.pathname}${replaceSearch(location.search, ['measure', 'flights', 'service', 'aircraft'], `?${q}`)}`);
}

function draw() {
  const box = $('maker-chart');
  box.replaceChildren();
  const res = buildFamilySeries(rows, { ...state, split: 'maker' });
  if (!res.points.length) { box.textContent = `No ${unit()} for this selection.`; return; }
  const years = res.years.map(String);
  const labelEvery = years.length <= 15 ? 1 : 5;
  const data = res.points.map((p) => ({ ...p, year: String(p.year), title: `${p.series}, ${p.year}\n${fmt(p.value)} ${unit()}` }));
  const colors = { domain: res.series, range: res.series.map((s, i) => (s === 'Other' ? OTHER_COLOR : SERIES_COLORS[i % SERIES_COLORS.length])), legend: true };
  box.append(Plot.plot({
    width: Math.min(box.clientWidth || 900, 1100),
    height: 420,
    marginLeft: 64,
    style: { background: 'transparent', fontSize: '12px' },
    x: { type: 'band', domain: years, label: null, tickFormat: (d) => (Number(d) % labelEvery === 0 ? d : '') },
    y: { label: HEAT_MEASURES[state.measure], tickFormat: '~s', grid: true },
    color: colors,
    marks: [
      Plot.barY(data, { x: 'year', y: 'value', fill: 'series', order: res.series, title: 'title', tip: true }),
      Plot.ruleY([0]),
    ],
  }));
}

async function main() {
  for (const [k, label] of Object.entries(HEAT_MEASURES)) $('mk-measure').append(new Option(label.toLowerCase(), k));
  for (const k of KIND_OPTIONS) $('mk-aircraft').append(new Option(k.label, k.value));
  try {
    rows = (await fetchRows(queryUrl('maker_by_year'))).rows;
  } catch (err) {
    console.error(err);
    $('maker-chart').textContent = 'Could not load the chart data.';
    return;
  }
  $('mk-measure').value = state.measure;
  $('mk-kind').value = state.kind;
  $('mk-service').value = state.service;
  $('mk-aircraft').value = state.aircraftKind;
  for (const [id, field] of [['mk-measure', 'measure'], ['mk-kind', 'kind'], ['mk-service', 'service'], ['mk-aircraft', 'aircraftKind']]) {
    $(id).addEventListener('change', (e) => { state[field] = e.target.value; pushState(); draw(); });
  }
  draw();
}

main();
```

Append to `static/charts/style.css`:

```css
#aircraft-table { overflow-x: auto; }
#aircraft-table td.left, #aircraft-table th.left { text-align: left; }
#aircraft-table button.sort { all: unset; cursor: pointer; font-weight: 600; }
#aircraft-table button.sort:focus-visible, #aircraft-table button.twist:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
#aircraft-table button.twist { all: unset; cursor: pointer; display: inline-block; width: 1.2em; color: var(--muted, #777); }
#aircraft-table tr.type-row td { color: var(--muted, #777); font-size: 14px; }
#aircraft-table td.type-name { padding-left: 2em; }
#at-q { min-width: 16em; }
details.note summary { cursor: pointer; }
```

- [ ] **Step 6: Run to verify the tests pass**

Run: `../t100-datasette/.venv/bin/python -m pytest tests -q && npm test`
Expected: all pass.

- [ ] **Step 7: Smoke-test the pages against a real server**

Without `t100.db` in this worktree, use the main checkout's database (read-only) with this worktree's code, after loading `type_year` into a scratch copy is not possible without writing to it. Instead build the table in a scratch database from the real one:

```bash
S=/private/tmp/claude-501/-Users-paulmison-Documents-code-t100/b4cfa419-7167-451a-a067-d825f6bd8db9/scratchpad
../t100-datasette/.venv/bin/python - <<'E'
import sqlite3, sys
sys.path.insert(0, '.')
import build_database as b
c = sqlite3.connect('/Users/paulmison/Documents/code/t100-datasette/t100.db')
print(b.rebuild_type_year(c))
E
```

That writes only the new derived table into the local database, which is the normal workflow here (the plan's Task 5 does it for real). Then start the server and fetch both pages and queries:

```bash
(../t100-datasette/.venv/bin/datasette --immutable ../t100-datasette/t100.db --config datasette.yml --plugins-dir plugins --template-dir templates --static static:static --port 8896 >/tmp/ds8896.log 2>&1 &)
until curl -s -o /dev/null localhost:8896/-/versions.json; do sleep 2; done
for p in /aircraft/table /aircraft/makers "/t100/type_table.json?year=2019&_shape=objects&_size=3" "/t100/maker_by_year.json?_shape=objects&_size=3"; do curl -s -o /dev/null -w "$p %{http_code}\n" "localhost:8896$p"; done
pkill -f "datasette.*8896"
```

Expected: four 200s. Also compare totals: `SELECT SUM(deps) FROM type_year` must equal 350650414.

- [ ] **Step 8: Commit**

```bash
git add plugins/t100_globe.py templates static/charts tests/test_rollup_pages.py
git commit -m "Add the aircraft table and manufacturer chart pages

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YRUDWbEF5PpwWHC7VAoc8P"
```

---

### Task 5: Smoke checks, docs, and getting `type_year` into the databases

**Files:**
- Modify: `scripts/smoke_check.sh`, `setup_database.md`
- Operations: local `t100.db` (main checkout) and the Fly volume

**Interfaces:**
- Consumes: Tasks 1 to 4.

- [ ] **Step 1: Add smoke checks**

In `scripts/smoke_check.sh`, after the `/aircraft/engines` check add:

```sh
check 200 /aircraft/table                                           "aircraft-table"
check 200 /aircraft/makers                                          "maker-chart"
```

and after the `family_detail` query check add:

```sh
check 200 "/t100/type_table.json?year=2019&_shape=objects"          '"Boeing 737'
check 200 "/t100/maker_by_year.json?_shape=objects"                 '"maker": "Boeing"'
```

- [ ] **Step 2: Document the table**

In `setup_database.md`, in the long "Finally, build the derived tables" paragraph, add `type_year` (each aircraft type's yearly totals, for the aircraft table and maker chart) to the list, before "A table that gained a column…".

- [ ] **Step 3: Run all tests and commit**

Run: `../t100-datasette/.venv/bin/python -m pytest tests -q && npm test`
Expected: all pass.

```bash
git add scripts/smoke_check.sh setup_database.md
git commit -m "Smoke-check the aircraft table and maker pages; document type_year

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YRUDWbEF5PpwWHC7VAoc8P"
```

- [ ] **Step 4: Build `type_year` in the local database**

(Done already if Task 4 Step 7 ran.) Check: `sqlite3 ../t100-datasette/t100.db "SELECT COUNT(*), SUM(deps) FROM type_year"` returns a count of about 15,000 and 350650414. Do not make a backup copy of `t100.db`.

- [ ] **Step 5: Load it onto the Fly volume, before merging**

Follow "Updating the Fly volume" in `setup_database.md` with `type_year` in place of `route_year_totals`: snapshot, `.mode insert` dump of the table gzipped, a loader that creates the table from `schema.sql` and replaces the rows in one transaction, upload both files, run, compare the count and `SUM(deps)` with the local table, delete the temporary files, restart the machine. Do this only when the user asks for the production update.

- [ ] **Step 6: Merge and deploy (only when the user asks)**

Merge `feature/aircraft-table-makers` into `main` and push; CI runs the tests, deploys, and the smoke check confirms `/-/derived` is ok and both new pages respond.

---

## Self-review

- **Spec coverage:** `type_year` (Task 1); `type_table`/`maker_by_year` (Task 2); family grouping, maker-of-busiest-type, search behaviour, shares, freight units (Task 3); table page with sentence controls, URL state, sortable headers, openable rows (Task 4); maker chart with top eight and Other, controls, disclosure and about paragraph (Task 4); links from `/aircraft` and breadcrumbs (Task 4); route ordering (Task 4 test); smoke checks and production load (Task 5). The spec's "nav page detection" line was dropped from the spec because the nav reads the URL generically.
- **Placeholders:** none; all code is given.
- **Names:** `groupFamilies`, `sortFamilies`, `KIND_OPTIONS`, `kindMatches`, `buildFamilySeries(..., aircraftKind)`, element ids and query names match across tasks.
- **Known judgement calls for the reviewer:** the "Flew" column shows the span of years with departures (first to last); the family `share` is of the filtered total, not of the searched subset; `kind` values are shown as stored.
