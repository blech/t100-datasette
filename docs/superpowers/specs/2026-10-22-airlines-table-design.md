# Views, part 3a: a table of all airlines

## Purpose

This is the first of the four new views in sub-project 3 of bucket 4 in `docs/site-coherence.md`. Aircraft's default view is a table: families, ranked, with types inside. Airlines get the same, and the section follows the same pattern. The bare section URL is the table, and the heat map becomes a view beside it.

## Pages and URLs

| View | Path | Shows |
|---|---|---|
| **Airlines** (default) | `/airlines` | the new table |
| Over time | `/airlines/over-time` | the heat map that `/airlines` shows today, unchanged |

- **The views line** on both pages is **Airlines · Over time**.
- **Old heat-map links.** Three of the heat map's settings mean nothing to the table: `n`, `rank` and `scale`. A request to `/airlines` carrying any of them gets a 301 to `/airlines/over-time`, with the query string kept. A bare `/airlines`, or one with only settings the table also reads, is the table. An old link with only `flights` or `service` therefore opens the table with the same filter, which means the same thing there.
- **Carrying settings.** `measure`, `flights` and `service` take the same values and mean the same on both pages, so the views line carries them each way. The other settings are each page's own and aren't carried.
- **Finding an airline.** The heat map's "find an airline" box (`_airline_search.html`) stays on the heat map and on each airline's page. The table has its own search, which filters the rows the way the aircraft table's does, so it doesn't also get the jump box.
- **Breadcrumbs:**
  - the table: "airlines";
  - the heat map: "airlines" (linking to `/airlines`), then "over time".

## The data

There's a new canned query, `airline_table`, modelled on `type_table`. It reads `carrier_group_year`, takes `:year` (a year, or `all`), and returns one row per member airline, service and kind:
- `group_id`, `group_name`;
- `airline_id`, and `airline_name` (from `carrier_group`, falling back to `group_name`, as `airline_list` does);
- `service`: `domestic` or `international`;
- `kind`: `passenger` or `freight`, from `service_class` (`G`/`P` is freight), as the other queries decide it;
- `first_year` and `last_year`: the first and last years with departures, over every year;
- `deps`, `seats`, `passengers` and `freight`, for the chosen year or for all years.

An airline's row is part of the table when it has departures in the chosen year.

## The table

**Rows.**
- One row per airline group, named as the group is everywhere else ("Delta (incl. Northwest)"), linking to `/airlines/{group_id}`.
- A group opens to show its members that pass the filters, each linking to `/airlines/{airline_id}`. This works the way a family opens to show its types on the aircraft table, with the same disclosure control.
- A group with only one such member has no disclosure. For example, Delta in 2019 shows Delta Air Lines alone, because Northwest's last year was 2009.

**Columns.** Each one sorts when you click its header, as on the aircraft table:

| Column | What it shows | Default sort |
|---|---|---|
| Airline | the group's name | A to Z first |
| Flew | the first and last years with departures, such as "1990–2025" (one year alone if they're the same) | by the first year, newest first, as the aircraft table's "Flew" sorts |
| The chosen measure | its total | largest first (the table's default sort) |
| Share | of the chosen measure's total across the rows that pass the filters | not sortable, as on the aircraft table |

- Clicking the sorted column again reverses it.
- Members sort the same way inside their group.
- The years in "Flew" cover only the rows that pass the filters. For example, "International" gives the first and last years the airline flew internationally.

**Controls.** Every control is held in the query string:
- `year`: the latest year (the default), any year, or "All years";
- `measure`: passengers, seats, departures, or freight, using the heat maps' measures and labels (`HEAT_MEASURES`);
- `flights`: `passenger` (the default), `freight` or `all`, matching the heat map's name and default;
- `service`: `all` (the default), `domestic` or `international`;
- `limit`: the aircraft table's limits (the top 15, 20 or 50, every airline, or at least 1% or 0.1%), worded for airlines, with the same default of the top 20. The limit is set aside while searching, as on the aircraft table;
- `q`: a search box. It matches a group's name or any of its members' names, case-insensitively. A group that matches only through one member opens to show it.
- `sort` and `dir`.

**Numbers** use `formatCount`, with freight divided from pounds into short tons, as the aircraft table does. Share uses the aircraft table's percentage format.

**The status line** above the table works as the aircraft table's does: "Showing 20 of 236 airlines, 87.1% of the 851 million passengers in 2019." when the limit leaves some out, and "236 airlines, 851 million passengers in 2019." when it doesn't.

**Empty results.** A search that leaves nothing shows `Nothing matches "…".` in the table's place. Filters that leave nothing show "No {measure} for this selection."

## Pieces

- **`datasette.yml`:** the `airline_table` query.
- **`plugins/t100_globe.py`:**
  - `/airlines` serves a new `airline_table_page`, or 301s to `/airlines/over-time` when the query carries `n`, `rank` or `scale`;
  - `/airlines/over-time` serves `rollup_page("airlines")`, with its breadcrumb gaining "over time";
  - a `views_for` case gives Airlines · Over time for both paths.
- **`templates/airline_table.html`**, modelled on `aircraft_table.html`: the title, intro, controls, `#airline-table`, and the note.
- **`static/charts/src/airlines.js`:** pure functions, tested on their own:
  - `groupAirlines(rows, { measure, flights, service, q }) → groups`, each `{ id, name, firstYear, lastYear, value, members: [{ id, name, firstYear, lastYear, value }] }`;
  - `sortAirlines(groups, sort, dir)`, which also sorts members;
  - `sharedQuery(search)`: the `measure`, `flights` and `service` in a query string, for the views line to carry;
  - the limit and its menu come from `static/charts/src/aircraft.js`, generalised there rather than copied. `limitFamilies` ranks by `value` and breaks ties by name, and its menu's labels name the noun ("the top 20 airlines").
- **`static/charts/airlinetable.js`:** the page script. It reads the state, fetches the query, draws the table, keeps the URL in step, and makes the views line carry the shared settings.
- **`static/charts/rollup.js`** (the heat map): the views line carries the shared settings to the table.
- **`templates/rollup.html`:** unchanged, apart from what its new address needs.
- **`scripts/smoke_check.sh`:** `/airlines/over-time` (expecting the heat map's element) and `/airlines` (expecting `airline-table`).
- **The front page:** its "Airlines" heading and "All airlines →" links already point at `/airlines`, which is now the table, so they stay as they are.

## Out of scope

- The other three new views (an airline's routes heat map, an airport over time, a family map).
- Changes to the heat map itself.
- Charts on the table page.

## Testing

**Python (pytest):**
- `views_for("/airlines")` and `views_for("/airlines/over-time")`, with the right view current.
- `/airlines?scale=busiest&n=25` gives a 301 to `/airlines/over-time?scale=busiest&n=25`, and the same for each of `n`, `rank` and `scale` on its own.
- `/airlines`, `/airlines?measure=seats&year=2019` and `/airlines?flights=freight&service=domestic` give 200 with `airline-table` and the views line.
- The "find an airline" box is on `/airlines/over-time` and each airline's page, not on `/airlines`.
- `/airlines/over-time` gives 200 with the heat map and its breadcrumb.
- The `airline_table` query for 2005 returns Delta's group with both its members, and for 2019, Delta Air Lines alone.
- The query for `all` gives totals equal to the sums over every year.

**JavaScript (`node --test`):**
- `groupAirlines`:
  - sums a group's rows into its members and the group;
  - filters by `flights` and `service`;
  - takes the first and last years from the filtered rows only;
  - matches `q` against a member's name, and leaves out a group that doesn't match.
- `sortAirlines`: by value, name and first year in both directions, with members sorted too.
- `sharedQuery`: keeps `measure`, `flights` and `service`, and drops everything else.
- The limit keeps the top 20 by default; the aircraft table's own tests still pass, with its labels unchanged.

**In a browser (headless Playwright):**
- `/airlines` fills the table with 20 groups, sorted by passengers.
- With `year=2005`, opening Delta shows Delta Air Lines and Northwest.
- A group's link opens `/airlines/{id}`.
- Changing the year to 2005 updates the URL and the rows.
- With `measure=seats&flights=all`, "Over time" goes to `/airlines/over-time?measure=seats&flights=all`, and the heat map's "Airlines" link carries them back.
- An old link, `/airlines?scale=busiest`, lands on the heat map.
- There are no page errors.
