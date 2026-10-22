# Views, part 3b: a table of an airline's routes

## Purpose

This is the second of the four new views in sub-project 3 of bucket 4 in `docs/site-coherence.md`. An airline's pages show its size over time, what changed between two years, and a map. Nothing yet lists every route it flies, ranked, for one year or for all of them. This view does, as a table like the airlines and aircraft tables. It replaces the roadmap's "routes heat map": the owner chose a table.

## The page

| View | Path | Shows |
|---|---|---|
| Over time (default) | `/airlines/{airline}` | unchanged |
| **Routes** | `/airlines/{airline}/routes` | the new table |
| Changes | `/airlines/{airline}/changes` | unchanged |
| Map | `/airlines/{airline}/globe` | unchanged |

- **`{airline}`** is a group (`delta`) or one member of a merged group (`19386`, Northwest), resolved as the other airline pages resolve it. An unknown airline is a 404.
- **The views line** on all four pages is **Over time · Routes · Changes · Map**. The Map entry keeps its id, `map-link`.
- **The breadcrumb** is the airline's, as on the Changes page, with a final "routes" step.
- **Carrying settings.** The airline's views already pass their whole query string to each other (`carryQuery` in `static/charts/airline.js`), and each page reads what it understands. The Routes page does the same.
  - Its `year` means the same on the map (`/globe?year=`), so it carries over usefully.
  - Changes reads `from` and `to` instead, and the Over time page keeps its measure out of the URL, so neither picks anything up from Routes.
  - Making the Over time page's measure part of the URL is out of scope.

## The data

There's a new canned query, `carrier_route_table`, which follows the other airline queries:
- **It takes:**
  - `:group`, a merged group's id or an airline's own;
  - `:airline`, `''` for the whole group, or one member;
  - `:year`, a year or `all`.
- **It reads** `carrier_route_year`, joined to `carrier_group` for member names, as `carrier_routes_year` is.
- **It returns one row per origin, destination and member airline:**
  - `origin`, `dest`, `airline_id`;
  - `airline`: the member's name, or "Unknown carrier", as `carrier_routes_year` names it;
  - `first_year` and `last_year`: the first and last years that member flew the route, over every year;
  - `domestic`: 1 when at least half the route's departures over every year are domestic. Only 3 rows in the data mix the two;
  - `deps`, `seats`, `passengers` and `freight`, for the chosen year or for all years.
- **It drops rows** with no departures in the chosen year.

**Size.** Delta has about 3,300 such rows in 2025, and 15,800 over every year, under the `max_returned_rows` of 50,000.

Place names come from the existing `airports` query (`code` → `place`), as the Changes table gets them.

## The table

**Rows.**
- **One row per direction,** such as ATL → MCO, because the site treats each direction as a route of its own.
- **The route cell** is a link, written as `ATL → MCO`, to `/airports/ATL/MCO?split=carrier&highlight=airline:{group}`. `{group}` is the page's group, even on a member's page, as in the Changes table. The two places follow in small type: "Atlanta – Orlando".
- **On a merged group's page,** a route flown by more than one member opens to show each member, with its own "Flew", value and share. It uses the same disclosure control as the airlines table. A route flown by one member has no disclosure.
- **Member rows** aren't links: the route row above already links to the route.
- **On a member's page,** the table holds only that member's routes, and nothing opens.

**Columns.** These sort as on the airlines table: clicking the sorted column again reverses it.

| Column | What it shows | First click |
|---|---|---|
| Route | the codes and places | A to Z, by origin then destination |
| Flew | the first and last years with departures, such as "1990–2025" (one year alone if they're the same) | by the first year, newest first |
| The chosen measure | its total | largest first (the default sort) |
| Share | of the chosen measure's total across the rows that pass the filter | not sortable |

**Controls.** Every control is held in the query string:
- `measure`: passengers, departures, seats or freight (`HEAT_MEASURES`). The default is passengers. Freight is divided from pounds into short tons, as on the other tables.
- `year`: the latest year the airline flew (the default), any year it flew, or "all years". The menu runs over the airline's own years, as the Changes page's menus do.
- `service`: `all` (the default), `domestic` or `international`.
- `limit`: the generalised limit from `static/charts/src/aircraft.js`, worded for routes ("the top 20 routes", "every route"). The default is the top 20. It's set aside while searching.
- `q`: a search box. It matches either airport's code (`hnl`) or place name (`honolulu`), case-insensitively.
- `sort` and `dir`.

**The status line** works as the airlines table's does: "Showing 20 of 3,012 routes, 18.4% of the 162 million passengers in 2025."

**Empty results.**
- A search that matches nothing says `Nothing matches "…".`
- When the filter leaves nothing, the page says "No {measure} for this selection."
- When the airline didn't fly in the chosen year, it can't happen through the menu, because the menu only offers the airline's years.

## Pieces

- **`datasette.yml`:** the `carrier_route_table` query.
- **`plugins/t100_globe.py`:**
  - the route `^/airlines/{slug}/routes$`, served by `airline_view("airline_routes.html", (("routes", None),))`;
  - in `views_for`, the airline case gains `["routes"]` and the Routes entry.
- **`templates/airline_routes.html`,** modelled on `airline_changes.html` (for the airline's name, members and data attributes) and on `airline_table.html` (for the controls): `#route-measure`, `#route-year`, `#route-service`, `#route-limit`, `#route-q`, `#route-status` and `#routes-table`.
- **`static/charts/src/routes.js`:** pure functions, tested on their own:
  - `groupRoutes(rows, places, { measure, service, q }) → { routes, total }`. Each route is `{ key, origin, dest, from, to, firstYear, lastYear, value, share, members: [{ id, name, firstYear, lastYear, value, share }] }`, where `key` is `"ATL-MCO"` and `from` and `to` are place names.
  - `sortRoutes(routes, key, dir)`, where `key` is `route`, `firstYear` or `value`, and members are sorted too.
- **`static/charts/airlineroutes.js`:** the page script. It reads the state, fetches the query and the airport places, draws the table, keeps the URL in step, and points the views line at the current query, as `carryQuery` does.
- **`static/charts/style.css`:** the table styles gain `#routes-table`.
- **`scripts/smoke_check.sh`:** `/airlines/delta/routes`, expecting `routes-table`.

## Out of scope

- A heat map of an airline's routes.
- Putting the Over time page's measure in the URL.
- Grouping both directions of a route into one row.
- Linking member rows to anything.
- The other two new views.

## Testing

**Python (pytest):**
- `carrier_route_table`, with a merged group seeded as two members flying one route in 2005, and one member flying it in 2019:
  - for 2005, both members' rows come back, with their years over every year;
  - for 2019, one;
  - for `all`, the sums over every year;
  - with `:airline` set, only that member's rows;
  - `domestic` follows the departures.
- `/airlines/delta/routes` gives 200, with:
  - `routes-table`;
  - the views line Over time · Routes · Changes · Map, with Routes current;
  - the breadcrumb's last step, "routes".
- `/airlines/19386/routes` gives 200 for a member.
- `/airlines/nope/routes` gives 404.
- `views_for` for each of the four airline paths.

**JavaScript (`node --test`):**
- `groupRoutes`:
  - sums members into a route;
  - filters by service;
  - takes "Flew" from the members;
  - matches `q` against codes and places;
  - leaves out routes with nothing in the measure;
  - gives shares of the filtered total.
- `sortRoutes`: by route, first year and value, in both directions, with members sorted too.
- The limit's menu reads "the top 20 routes" and "every route".

**In a browser (headless Playwright):**
- `/airlines/delta/routes` fills the table with 20 routes, sorted by passengers.
- With `year=2005`, a route flown by both Delta and Northwest (ABE → LGA) opens to show both.
- A route's link opens `/airports/{o}/{d}?split=carrier&highlight=airline:delta`.
- Searching "honolulu" finds HNL routes.
- With `year=2019`, the views line's "Map" link carries `year=2019`.
- `/airlines/19386/routes?year=2005` has no disclosures.
- There are no page errors.
