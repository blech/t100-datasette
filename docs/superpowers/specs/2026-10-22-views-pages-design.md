# Views, part 1: one kind of view per page

## Purpose

This is the first of three sub-projects in bucket 4 of `docs/site-coherence.md`:
1. **The page rule and the URLs** (this spec).
2. **Carrying a highlight across links** (`?highlight=`).
3. **Four new views:** an airport over time, an airline's routes over time, where an aircraft family flies, and a table of all airlines.

The owner's rule: **a page shows one kind of view (a chart over time, a heat map, a map or a table) unless a table exactly reproduces its chart.** A subject's views are separate pages, and the views line under the breadcrumb moves between them. The front page is the one exception: it's a set of stories, each a teaser for a section, not a view of one subject.

Two pages break the rule today:
- **A route** (`/airports/SFO/LHR`) has a chart and a table. The table shows totals across the period for five measures; the chart shows one measure by year. So the table isn't a copy of the chart.
- **An airline** (`/airlines/delta`) has two charts (size and airport pairs) and the "What changed" table.

## The convention

- **Paths:** a subject's bare URL is its default view, and its other views hang beneath it as one word: `/globe` (map), `/table`, `/changes`, and later `/destinations` and `/routes`. `globe` stays as the map's name, because it's already in links people have.
- **Labels in the views line say what the view shows:**
  - "Over time" for charts by year;
  - the row kind for heat maps ("Destinations", "Families");
  - "Table" or "Changes" for tables;
  - "Map" for maps.
  - Aircraft keeps its named story pages: "Makers" and "Long-haul engines".
- **Settings carry between a subject's views** where they mean the same thing, through the same query parameters. For example, a route's `measure` and `split` go from its chart to its table.

## Changes in this sub-project

### A route

| View | Path | Shows |
|---|---|---|
| **Over time** (default) | `/airports/{a}/{b}` and `/airports/{a}/{b}/{year}` | the chart (stacked bars, or by month for a year), the years nav and the notes |
| Table | `/airports/{a}/{b}/table` and `/airports/{a}/{b}/{year}/table` | the airlines-and-aircraft table, following `split`, for all years or the one year |

- **The views line** is **Over time · Table**. Both keep the year and the query string.
- **The reverse direction** is a different subject, not a view, so it leaves the views line. It goes into the sentence under the years nav, which becomes: "Each direction is a route of its own; the other way is [LHR → SFO]. More from SFO: [routes over time] · [map]." The reverse link keeps the year and the view (chart or table).
- **The Table page** has the same breadcrumb as the chart plus a final "table" step, the same years nav (linking years' tables), and the same measure and split controls. The measure doesn't change the table's columns, but it's carried so it survives the round trip.
- **The chart page** loses `#route-table`.

### An airline

| View | Path | Shows |
|---|---|---|
| **Over time** (default) | `/airlines/{airline}` | name, members, search, the size chart and the airport-pairs chart |
| Changes | `/airlines/{airline}/changes` | the "What changed" comparison: the year menus, the minimum-flights menu, the summary sentence, the status menu, the table and its note |
| Map | `/airlines/{airline}/globe` | unchanged |

- **The views line** is **Over time · Changes · Map**. "Overview" becomes "Over time".
- **The Changes page** reads `?from=&to=&min=` as the section does today. The airline map's "Routes dropped and added, as a table" link (`#table-link`) points to `/airlines/{airline}/changes?from=…&to=…` instead of `/airlines/{airline}?…#changes`.
- **Old links ending in `#changes`** reach the Over time page. A fragment never reaches the server, so its script sees `#changes` and replaces the location with `/changes`, keeping the query.
- **The minimum-flights menu** today drives both the airport-pairs chart and the changes. Each page now gets its own copy, carried between them as `?min=`.

### Unchanged here

These move in sub-project 3, when their new neighbours exist:
- the airport page (`/airports/{code}` stays the heat map until the over-time chart arrives, and then becomes `/destinations`);
- the airlines and aircraft-family pages.

## Pieces

**`plugins/t100_globe.py`:**
- new routes:
  - `^/airports/{CODE}/{CODE}(?:/{year})?/table$` to `route_table_page`;
  - `^/airlines/{slug}/changes$` to `airline_changes_page`;
- the breadcrumbs gain a final "table" or "changes" step;
- `views_for` gains the rows above, with the route's direction pair removed and the airline's "Overview" renamed.

**Templates:**
- `route.html` is split into `route.html` (chart) and `route_table.html` (table).
- `airline.html` loses its changes section to a new `airline_changes.html`.
- `airline_globe.html`'s `#table-link` gets its new default href.

**Scripts:**
- `static/charts/routepage.js` runs `drawChart` only where `#route-chart` exists and `drawTable` only where `#route-table` exists. Both read the same state.
- `static/charts/airline.js` does the same for the size and pairs charts versus the changes.
- The `#changes` forward goes in `airline.js`.
- `static/charts/airlineglobe.js` builds `#table-link` as `/airlines/{own}/changes?from=&to=`.

**`scripts/smoke_check.sh`** gains `/airports/SFO/LHR/2019/table` (expecting `route-table`) and `/airlines/delta/changes` (expecting `change-table`).

## Out of scope

- `?highlight=` (sub-project 2).
- The new views and the airport, airlines and family URL changes (sub-project 3).

## Testing

**Python (pytest):**
- `views_for` for both route paths with and without a year, both table paths, and the airline's three views. The current view is right in each.
- Each new page renders 200, with:
  - its views line;
  - its breadcrumb's last step;
  - the element it exists for: `route-table`, or `change-table`;
  - and without the moved parts: no `route-table` on the chart page; no `change-table`, `al-a` or `al-b` on the airline's Over time page.
- The route sentence links the reverse direction with the year kept.
- An unknown airline's `/changes` is a 404.

**In a browser (headless Playwright):**
- `/airports/ATL/JFK?measure=seats&split=aircraft`: following "Table" keeps `measure=seats&split=aircraft`, and the table's first column is Aircraft.
- `/airlines/delta/changes?from=2019&to=2025`: the year menus show 2019 and 2025, and the table fills.
- `/airlines/delta#changes` lands on `/airlines/delta/changes`.
- The airline map's table link goes to the Changes page with the map's years.
- No page errors.
