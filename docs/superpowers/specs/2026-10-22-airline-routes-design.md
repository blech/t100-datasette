# Views, part 3b: a heat map of an airline's routes

## Purpose

This is the second of the four new views in sub-project 3 of bucket 4 in `docs/site-coherence.md`. An airline's pages show:
- its size over time;
- what changed between two years;
- a map of one year or a span.

None of them shows how its network shifted year by year: hubs built up or wound down, or a merged airline's routes fading out. A heat map does. Each row is an airport pair, each column a year, and the colour is its size. It's the same kind of view as an airport's destinations and the airlines heat map, and it reuses their code.

(A first draft of this spec made the view a table. The owner chose a heat map instead: a ranked table of thousands of routes mostly repeats the map and the Changes page. A table can come later if a question needs one.)

## The page

| View | Path | Shows |
|---|---|---|
| Over time (default) | `/airlines/{airline}` | unchanged |
| **Routes** | `/airlines/{airline}/routes` | the new heat map |
| Changes | `/airlines/{airline}/changes` | unchanged |
| Map | `/airlines/{airline}/globe` | unchanged |

- **`{airline}`** is a group (`delta`) or one member of a merged group (`19386`, Northwest), resolved as the other airline pages resolve it. An unknown airline is a 404.
- **The views line** on all four pages is **Over time · Routes · Changes · Map**. The Map entry keeps its id, `map-link`.
- **The breadcrumb** is the airline's, as on the Changes page, with a final "routes" step.
- **The heading and intro** name the airline as the Changes page does: its name, and its members when it's a merged group.
- **Carrying settings.**
  - The airline's views already pass their whole query string to each other (`carryQuery` in `static/charts/airline.js`), and each page reads what it understands. The Routes page does the same.
  - Its `measure`, `service`, `n`, `rank` and `scale` are its own; the other pages ignore them.
  - Their `from`, `to`, `min`, `span` and `year` pass through it untouched.

## The data

There's a new canned query, `carrier_route_by_year`, which follows the other airline queries.

**It takes:**
- `:group`: a merged group's id, or an airline's own;
- `:airline`: `''` for the whole group, or one member.

**It reads** `carrier_route_year`, which holds airport pairs, not directions. Each pair's codes are in alphabetical order (`origin` < `dest`), with both directions added together, as the airline's map and Changes table count them. The query returns one row per pair and year, summed over the group's members:
- `origin`, `dest`, `year`;
- `deps`, `seats`, `passengers` and `freight`;
- `service`: `domestic` when more than half that year's departures on the route are domestic, otherwise `international`. This is the rule `routes_by_year` uses.

**It keeps only route-years with at least 12 departures**, the cut-off the airport heat map uses (`routes_by_year`'s default `min_deps`). Without it, American would return about 88,000 rows. With it, the biggest airline (American) comes to about 29,500, under the `max_returned_rows` of 50,000.

`carrier_route_year` has no passenger/freight split, so this heat map has no "flights" control. A route's freight is whatever the airline carried on it.

Place names, for each row's hover text, come from the existing `airports` query (`code` → `place`), as the Changes table gets them.

## The heat map

The page reuses the airlines heat map's script, `static/charts/rollup.js`, with a new page kind, `routes`. It shares `buildHeatmap`, the colour scales, the popover and the notes. What differs from the airlines heat map:

- **Rows are airport pairs,** labelled `ATL – MCO`, with both directions counted together, as on the airline's Changes table and map. The airline data has no other form: it's built that way.
- **The hover text on a label** gives the places: "Atlanta – Orlando".
- **A row's label links to one direction of the route** (the alphabetical one, as the Changes table's links do), with this airline picked out: `/airports/ATL/MCO?split=carrier&highlight=airline:{group}`. `{group}` is the page's group, even on a member's page, as in the Changes table. The route page offers the other direction.
- **The controls** read as one sentence:
  - **measure:** passengers (the default), departures, seats or freight;
  - **routes:** all (the default), domestic or international;
  - **how many:** the top 10, 25 or 50 routes, with 50 as the default;
  - **ranking:** by all years (the default) or by the airline's last year;
  - **colour:** the amount, the share of each year (the default), or compared with the year's biggest.

  These are the airlines heat map's controls, apart from "flights". Their parameter names and defaults are the same: `measure`, `service`, `n`, `rank` and `scale`.
- **"Ranked by {year} only"** uses the airline's own last year, not the data's. For Northwest, that's 2009 rather than 2025, so the option never gives an empty chart.
- **The notes** say:
  - rows are airport pairs this airline flew, in both directions together;
  - a route-year needs 12 departures to appear;
  - a merged airline counts its members together for every year;
  - each label opens the route with the airline highlighted.
- **The years** run over the airline's own years, as `buildHeatmap` gives them from the rows.

**Empty results.** "Nothing to chart for this selection.", as on the airlines heat map. For example, an airline with no international routes, shown international only.

## Pieces

- **`datasette.yml`:** the `carrier_route_by_year` query.
- **`plugins/t100_globe.py`:**
  - the route `^/airlines/{slug}/routes$`, served by `airline_view("airline_routes.html", (("routes", None),))`;
  - in `views_for`, the airline case gains `["routes"]` and the Routes entry, between Over time and Changes.
- **`templates/airline_routes.html`,** modelled on two existing templates:
  - from `airline_changes.html`: the airline's name, members, the search box, and the `data-group`, `data-airline` and year attributes;
  - from `rollup.html`: the heat-map controls (without `#heat-kind`), `#scale-note`, `#heatmap`, `#rank-note` and the about note.

  The body carries `data-kind="routes"` and `data-latest-year="{{ last_year }}"`.
- **`static/charts/rollup.js`:**
  - **The `routes` kind:**
    - the query `carrier_route_by_year`, with `group` and `airline` from the body;
    - rows keyed by `origin – dest`;
    - no flights filter;
    - labels linking to the route with the highlight;
    - hover text from the airport places;
    - the notes above.
  - **The views line:** for `routes` it carries the whole query, as the other airline pages do. The airlines heat map keeps carrying only the shared settings.
- **`static/charts/src/rollup.js` `rollupRows`:** rows with no `kind` column pass any `kind` filter, so the routes rows aren't dropped by the default `passenger`.
- **`scripts/smoke_check.sh`:** `/airlines/delta/routes`, expecting `heatmap`.

## Out of scope

- A table of an airline's routes.
- Splitting a pair into its two directions: the airline data doesn't keep them apart.
- Splitting a merged group's routes by member.
- The other two new views.

## Testing

**Python (pytest):**
- `carrier_route_by_year`, with a merged group seeded as two members flying one route in 2005 and one member in 2019:
  - 2005's row sums both members;
  - `:airline` limits it to one member;
  - a route-year under 12 departures is left out;
  - `service` follows the departures.
- `/airlines/delta/routes` gives 200, with:
  - `heatmap` and `data-kind="routes"`;
  - the views line Over time · Routes · Changes · Map, with Routes current;
  - the breadcrumb's last step, "routes";
  - no `heat-kind`.
- `/airlines/19386/routes` gives 200 for a member, with its last year in `data-latest-year`.
- `/airlines/nope/routes` gives 404.
- `views_for` for each of the four airline paths, Routes included.

**JavaScript (`node --test`):**
- `rollupRows` keeps rows without a `kind` when asked for `passenger`, and still filters rows that have one.
- A pure function, `routeRows(rows)`, turns query rows into rows keyed `ATL – MCO`, keeping the measures and service.

**In a browser (headless Playwright):**
- `/airlines/delta/routes` draws a heat map with 50 rows.
- A label links to `/airports/{o}/{d}?split=carrier&highlight=airline:delta`, and its hover text gives the places.
- `/airlines/19386/routes?rank=latest` draws rows: Northwest's last year is 2009.
- `service=international` and `scale=busiest` survive a reload.
- From the routes page, the views line's "Changes" carries the query, and the Changes page ignores the heat-map settings.
- There are no page errors.
