# Both directions: routes and airports count flights each way, with a choice of one

## Intent

A visitor can't tell whether a number counts one direction or both, and today the site answers differently on different pages:

- **Airline pages count both directions together.** They read `carrier_route_year`, which `rebuild_carrier_route_year()` keys on `MIN(origin, dest), MAX(origin, dest)`.
- **Airport and route pages count one direction**, flights departing the origin. They read raw `t100` with `WHERE origin = :origin`, or `airport_year_totals` / `route_year_totals`, which are keyed on origin.
- **Network-wide pages have no direction:** aircraft, families, makers, groups, airlines over time. Each flight is counted once either way.

The pages are labelled honestly ("departing *from*", "both directions counted together", `/about#direction`). But an airline's "ATL – LGA" links to a route page that shows a different, one-way figure, and nothing lets a visitor choose. The owner's worry is visitors misreading numbers, and not being able to check quickly which pages do what.

The fix: **route and airport pages count both directions by default, and each offers a choice to narrow to one.** The airline pages gain the same choice. Every page then says which it is showing, in the same words.

## Goals

- Route and airport pages default to both directions.
- Those pages and the airline pages let the visitor pick both, one way or the other.
- The page's words say which direction is shown, with no footnote needed.
- The rollup tables record each direction separately, so any page can show either direction or both without guessing how a table was built.

## Non-goals

- Aircraft, family, maker, group and airlines-over-time pages: unchanged. They have no direction.
- `airport_connecting_year`: a deliberately unsynced work in progress. Leave the table and anything about it alone.
- The older Datasette canned-query pages under `/t100/destinations` and `/t100/top_us_airports`, with their `query-t100-*.html` templates: stay one-way. *(My call: they're the raw query interface, not the site's pages.)* The network globe (`/airports/globe`) is a site page and is in scope; see below.

## Anti-goals

- A page whose words and numbers disagree about direction, even for a moment while it loads, for example a "Flights" heading over departure-only numbers.
- Two different meanings for the same column name in different tables, which is exactly what happens today with `origin` in `carrier_route_year` against `route_year_totals`.
- Slowing an airport page noticeably. Both-ways is the default, so the default page reads arrivals as well as departures, and must still load about as fast as today.
- A window in which the live site is broken or quietly shows wrong numbers while the new data and code roll out.

## What visitors see

### Words

| Counting | The count of flights is called | Passengers, seats, freight |
|---|---|---|
| Both directions | **Flights** | named as now; the sentence says "to and from" / "between" |
| Leaving | **Departures** | "…departing LAX" / "from LAX to LHR" |
| Arriving | **Arrivals** | "…arriving at LAX" / "from LHR to LAX" |

"Movements" is not used; it's airport-industry jargon.

On a route page either one-way choice counts **Departures**, from the airport the heading starts with: LHR → LAX counts departures from LHR, not arrivals at LAX. Arrivals only appear on airport pages.

### Route pages (`/airports/LAX/LHR`, its year and table views)

- **Address order:** stays as the visitor followed it. The route lives under the airport, so someone coming from LAX's page sees LAX first.
- **Default:** both directions, headed **LAX ↔ LHR**.
- **Direction choice:** "LAX ↔ LHR / LAX → LHR / LHR → LAX", a setting beside the existing measure setting.
- **The reverse address:** `/airports/LHR/LAX` shows the same both-ways totals, framed from LHR. That duplicate is accepted.
- **The "the other way is…" link** in `route.html` and `route_table.html`: this changes. In one-way mode it still points to the reverse address. In both-ways mode it is replaced by the direction choice. *(Builder settles the exact wording.)*
- **Load factor:** stays meaningful in every mode, as total passengers over total seats for whatever is counted.

### Airport pages (`/airports/LAX`, `/destinations`, `/changes`, `/globe`)

- **Default:** both directions. LAX's passengers include arriving passengers, and its destinations matrix counts flights each way between LAX and each other airport.
- **Direction choice:** both / departing / arriving.
- **Destinations matrix and globe:** the "other end" is the partner airport in either direction.
- **Changes page:** a destination is "dropped" or "added" on the counts for the chosen direction.

### Airport lists (landing table `/airports`, home map, `/airports/over-time`, `/airports/dedicated`)

These rank airports, so they rank on the chosen direction, defaulting to both.

- **Direction choice:** the landing table and the over-time rollup get the same setting. The home map and the dedicated page use both directions and say so. *(My call: those two are stories, not tools, so they get no setting. The builder may add one if it's trivial.)*
- **Dedicated page:** "Passengers are those boarding there" becomes passengers boarding or leaving there.

### Network globe (`/airports/globe`)

The globe with no airport chosen does two things:
- **Chooser list:** ranks airports with `top_us_airports` (`static/globe/main.js:212`).
- **Hover routes:** draws an airport's routes with `domestic_routes` (`main.js:230`), "as its own map draws them".

Both follow the airport globe's default, so the hover draws both directions with the 24 cut-off. *(My call.)* The chooser moves off `top_us_airports` onto the airport rollup, so the canned query itself stays one-way as above. `domestic_routes` is therefore in use and changes with it.

### Airline pages (`/airlines/X`, `/routes`, `/changes`, `/globe`)

- **Default:** both directions, which is today's meaning. The totals don't change, but the 24 cut-off does apply here too. Pairs flown 12–23 times a year leave the default airline matrix and route counts. *(My call: one rule everywhere.)*
- **Direction choice:** the routes table and changes page get a choice between pairs together (one "ATL ↔ LGA" row, the default) and each direction separately. Separately, that row becomes two, "ATL → LGA" and "LGA → ATL", each with its own numbers, ranked and cut off (at 12) on its own. *(The owner's decision.)* The route-count chart and the airline globe stay both-ways. *(My call: a pair either is or isn't flown, so a one-way count adds little there.)*
- **`highlight.js`:** keeps its handling of a link that lands on a direction the airline never flew. It should only matter now when the visitor has picked one direction.

### Cut-offs

Any fixed cut-off defined in departures doubles when both directions are counted. That keeps its meaning of roughly monthly service each way:

- **12 a year → 24 a year:** routes hidden on the globe and matrices, destinations counted in `top_airports`, the airline pages' "12 times" option.
- **365 departures a year → 730 flights:** the airports rollup.

The owner agreed 24 combined / 12 one-way. For the airline pages' choice lists (once / 12 times / …), the builder applies the same doubling to the non-"once" options in both-ways mode.

### The setting carries between pages

- **Parameter:** the direction is a query parameter, `dir=out` or `dir=in`, with no parameter meaning both.
- **Carrying it:** `static/nav/src/state.js` (`carryParams`) carries it between route and airport pages, the way `measure` and `service` are carried now. The airline pages' choice is a different parameter, `dir=each`, and neither carries across to the other kind of page.
- **What `out` and `in` mean:** on a route page, `out` is the address's first airport to its second (LAX → LHR on `/airports/LAX/LHR`) and `in` is the reverse. On an airport page, `out` is departing and `in` is arriving. Airline pages don't use `out`/`in`.

*(The parameter name and values are my call.)*

### About page

Rewrite `/about#direction`, now headed "Routes are one-way", to explain both directions and the choice. Pages that link `#direction` keep linking it. The section's anchor may stay `direction`.

## How the data changes

### Pair-level tables stay directed

`route_year_totals` already has one row per direction, so "both" is the `(a,b)` row plus the `(b,a)` row.

`carrier_route_year` **stops merging directions.** It becomes one row per airline group, member airline, year, origin and dest, as flown. Airline queries that want both directions add the two together and name the pair with `MIN`/`MAX` at query time.

This removes the one table where `origin`/`dest` means "the alphabetically first/second airport". Its comment in `schema.sql` / `_LOOKUP_TABLES` changes to match.

### Airport-level tables gain arriving columns

`airport_year_totals` and `airport_carrier_year` get explicit pairs: departing and arriving flights, seats, passengers and freight. For example `deps` / `arrs`, `passengers_out` / `passengers_in`; the builder picks the exact names.

- **Explicit pairs only:** don't store a "both" column. Both is the sum, computed in the query.
- **Arriving values:** taken from rows where the airport is `dest`.
- **Naming the airport:** the airport's key column stops being called `origin`. Something like `airport` would do; the builder's call.
- **Airports seen only as a destination** get a row, with zeros on the departing side. Today a destination with no departures, such as a foreign airport only flown to, has no row.

### Queries

Canned queries in `datasette.yml` that read raw `t100` by airport take the direction as a parameter: `route`, `route_year`, `airport_size`, `routes_by_year`, `routes_by_month`, `airport_changes`.

- **Shape:** one shape per query, not three copies. For example, filter `(origin = :a AND :dir IN ('', 'out')) OR (dest = :a AND :dir IN ('', 'in'))` and group by the other end.
- **No new index on the segment tables.** *(My call.)* The production volume had about 1.3GB free on 2026-10-14 (`docs/monthly-updates.md`), and the rollup upload route can't carry an index. The airport pages' arriving data comes from rollups instead:
  - `routes_by_year` comes from `route_year_totals`.
  - `airport_size` comes from `airport_carrier_year`, with its new arriving columns.
  - `airport_changes` comes from the directed `carrier_route_year`, with airlines added up into groups. It already has first and last month.
- **Route pages stay on raw `t100`.** Both directions of a pair hit the existing `origin, dest, year` index.
- **`routes_by_month` (the airport globe's months):** the builder measures the arriving side, which can use the `year, month, origin, dest` index for one year. A full `dest = 'ORD'` scan over all years took 1.1s, against 0.65s for `origin`. If it's too slow, a small monthly pair rollup is acceptable; note its size.

Queries on the rollups (`top_airports`, `busiest_airports`, `airport_by_year`, `dedicated_airports`, `carrier_route_*`) change to the new columns and keys.

**`domestic_routes`:** the network globe's hover uses it (see above). It changes to both directions with the 24 cut-off.

**Domestic or international:** a pair is labelled by majority departures, as now. The sum covers whichever directions are counted.

### Rebuild and schema checks

- **Rebuild:** `rebuild_*` functions in `build_database.py` change as above, writing the new tables.
- **Schema files:** `schema.sql` and `tests/test_schema_check.py` follow.
- **Production:** rollups are shipped as a small separate SQLite file, uploaded and copied in with `ATTACH` (`docs/monthly-updates.md`). CI deploys every push to `main`, and `plugins/t100_schema.py` tolerates extra tables and columns but not missing ones.
- **Rollout:** new rollups go in under **new table names** beside the old ones, so the live code keeps reading the old tables until the new code deploys. *(My call.)* Renaming a key column, or changing what `carrier_route_year` means in place, would break or silently skew the live site.
  - **Order:** ship the new tables, then merge and deploy the code, then drop the old tables in a cleanup step.
  - **Sizes:** today `route_year_totals` is 27MB, `airport_carrier_year` 28MB and `carrier_route_year` 59MB. A directed carrier table should be well under twice that. Note the real sizes in the plan.
  - **The `_ADDED_COLUMNS` question goes away** for tables with new names.

## Working setup

- **Worktree:** a fresh one on a new branch, `bidirectional`. The old `safari-controls` worktree (at `.claude/worktrees/family-any`) is merged and clean, so it can be removed first.
- **Database:** the worktree gets its own `t100.db`, cloned with `cp -c` so it shares disk until the rollups are rebuilt. The main checkout's `t100.db` and the owner's server on port 8808 are untouched.
- **Ports:** don't use 8811 or 8812; other agents use them.

## Tests

- **Existing suites:** the pytest tests in `tests/` and the JS tests under `static/*/test`. Update every one that encodes one-way meaning. Likely ones: `test_route_page`, `test_routes_by_year`, `test_routes_by_month`, `test_top_airports`, `test_rollups`, `test_rollup_queries`, `test_dedicated_airports`, `test_airport_queries`, `test_about_page`, `test_nav`, `static/nav/test/state.test.js`.
- **New tests:**
  - each changed query returns out + in = both on a fixture
  - `carrier_route_year` stays directed
  - `carryParams` carries `dir`
  - a page's direction words match the `dir` it was given

## Left to the builder

- **Data:** the new tables' names and column names, and whether `routes_by_month` needs a rollup.
- **Page detail:** exact wording of the direction choices and sentences, and where the control sits on each page, beside the existing settings.
- **Delivery:** whether to land this as one branch or a short series: data first, then route pages, then airport pages, then airline pages.
