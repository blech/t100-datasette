# Views, part 3c: an airport over time, and what changed

## Purpose

This is the third of the new views in sub-project 3 of bucket 4 in `docs/site-coherence.md`. An airline has four views: Over time (charts), Routes (a matrix), Changes (a table) and Map. An airport has two: a matrix of its destinations at `/airports/SFO`, and its map. This gives an airport the same four, so the two subjects read alike:
- **Over time** is new: how big the airport is, and how many places it serves, year by year.
- **Destinations** is the existing matrix, at a new address.
- **Changes** is new: the destinations and airlines gained and lost between two years.

## Pages and URLs

| View | Path | Shows |
|---|---|---|
| **Over time** (default) | `/airports/SFO` | two charts (new) |
| Destinations | `/airports/SFO/destinations` | the matrix that `/airports/SFO` shows today, unchanged apart from its address and title |
| Changes | `/airports/SFO/changes` | a table (new) |
| Map | `/airports/SFO/globe` | unchanged |

- **The views line** on all four is **Over time · Destinations · Changes · Map**. The map's view line gains the two new entries.
- **Titles:**
  - Over time: "SFO: over time";
  - Destinations: "SFO: destinations over time" (today's "SFO: routes over time");
  - Changes: "SFO: what changed".
  - The intro line under the title and the foreign-airport note appear on all three.
- **Breadcrumbs:**
  - Over time: "airports" › "SFO";
  - Destinations: "airports" › "SFO" (linking to `/airports/SFO`) › "destinations";
  - Changes: "airports" › "SFO" › "changes".
  - A route's breadcrumb "SFO" keeps linking to `/airports/SFO`, which is now the charts.
- **Old matrix links.** Five of the matrix's settings mean nothing to the charts: `n`, `group`, `rank`, `scale` and `open`. A request to `/airports/SFO` carrying any of them gets a 301 to `/airports/SFO/destinations`, with the query string kept. A bare `/airports/SFO`, or one with only `measure`, `service` or `theme`, is the charts.
- **Carrying settings between pages** (`static/nav/src/state.js`):
  - Today every `/airports/X` link is a "routes" target and is given the matrix's settings. Left as it is, that would send every carried link through the 301.
  - `/airports/X/destinations` becomes the "routes" target, carrying the matrix settings as `/airports/X` does now.
  - `/airports/X` becomes a new "airport" target, carrying `measure` only (and `theme`, as everywhere).
  - `/airports/X/changes` carries `theme` only.
  - `service` isn't carried to the charts, because they split by domestic and international rather than filtering by it.
- **Matrices lead to matrices.** On the matrix, clicking a row's code opens that airport's matrix, `/airports/X/destinations`, not its default page.
- **Everything else** that links to `/airports/X` keeps doing so and so lands on the charts:
  - the front page's map;
  - the busiest-airports table, which already carries its sort as `measure`;
  - the maps;
  - route breadcrumbs;
  - the old `/routes/X` redirect.

## Direction

Every number on these pages counts flights departing from the airport, as the matrix and the busiest-airports table do. A destination is an airport flown to from here. That makes these pages differ from the airline pages, whose routes are airport pairs with both directions counted together.

## Over time

The page follows an airline's Over time page (`templates/airline.html`), with the same chart look, popovers and palette.

**How big.**
- "Show [measure] for [passenger flights / freight flights / all flights], split by [domestic or international / passenger or freight / airline]."
- One stacked bar per year.
- The measures are `MATRIX_MEASURES`. The flights choice is decided from the BTS service class, as everywhere else (`G` and `P` are freight).
- The airline split:
  - shows the 8 airline groups with the most of the measure over all years shown, each its own series, plus "Other" on top, stacked by size, as the site's convention has it;
  - names each group as the group is named everywhere else;
  - in the legend, each airline links to `/airlines/{group_id}`.
- **Settings in the address:** `measure`, `flights` (`passenger` by default, as on the airlines pages; since 28 October, all flights when the measure is freight, because freighters carry most of it, and a freight hub such as ANC or OAK looked nearly empty on passenger flights; `static/charts/src/flights.js`) and `split` (`service` by default), written with defaults left out.

**How many places.**
- "Destinations flown at least [once / 12 times / 52 times / 365 times] each year", with 12 as the default, as on an airline's airport-pairs chart.
- One bar per year, stacked domestic and international.
- A destination's service is decided the way the matrix decides it: domestic when most of its departures that year were domestic.
- **Setting in the address:** `min`.

**Data.**
- A new canned query, `airport_size`, reads `t100` for one `:origin`.
- It returns one row per year, airline group, `domestic` and kind, with `deps`, `seats`, `passengers` and `freight`.
- Airline groups are found the way `carrier_group_year` finds them in `build_database.py`: the carrier entity's `airline_id` from `carriers`, then its group from `carrier_group`, with "Unknown carrier" when there's none. The airline split therefore agrees with the airline pages.
- For ATL, the busiest airport, it takes about 0.6 seconds locally, the same as the matrix's query. It returns about 3,600 rows. The page adds them up for each split.
- The destination counts come from the matrix's own query, `routes_by_year`, called with `min_deps=1`. The page counts the destinations at or above the chosen minimum for each year.

## Changes

The page follows an airline's Changes page (`templates/airline_changes.html`).

**Controls:**
- "Count destinations flown at least [once / 12 / 52 / 365 times]" (`min`, default 12);
- "Compare [year] with [year]" (`from` and `to`): the defaults are the latest year and six years before it (but not before the airport's first year), as on an airline's page;
- "Show [destinations / airlines] that were [dropped / added / kept]" (`show`, default `destinations`; `status`, default `dropped`).
- Every control is held in the address, with defaults left out.

**The summary**, above the table, for destinations: "In 2019 SFO had flights to 120 destinations at least 12 times. By 2025, 104 were still served, 16 were dropped and 9 new ones had been added." When nothing reached the minimum in the first year: "No destinations were flown to 12 times in 2019."

**Destinations.** One row per destination that reached the minimum in either year.
- **Status:**
  - kept if it reached the minimum in both years;
  - dropped if only in the first;
  - added if only in the second.
- **Columns:**
  - the destination's code linking to the route `/airports/SFO/{dest}`, with its place name in small type, as the airline table shows places;
  - departures in each year;
  - the airline groups that flew it in the year that counts (the first year for dropped and kept, the second for added), the busiest first, up to three, then "+ n more";
  - "Last flown" (dropped and kept) or "First flown" (added), as a month and year.
- **Sort:** dropped and kept by the first year's departures, added by the second year's, largest first.

**Airlines.** One row per airline group that flew at least the minimum departures from the airport in either year. The status rule is the one destinations use.
- **Columns:**
  - the group's name linking to `/airlines/{group_id}`;
  - departures from the airport in each year;
  - destinations in the year that counts (at least the minimum, as above);
  - "Last flown here" or "First flown here", as a year.
- **Sort:** as for destinations.

**Empty tables** say "None.", as the airline table does.

**The note** under the table says that:
- every count is of departures from this airport;
- a destination is dropped when flights to it stopped or fell below the minimum, not when a particular flight number ended;
- airlines are counted as groups, with more on [how airlines are grouped](/about#groupings).

**Data.** A new canned query, `airport_changes`, takes `:origin`, `:a` and `:b`. It returns one row per destination and airline group, with:
- departures in each year;
- passengers in the first year (for parity with the airline query, unused for now);
- the first and last year-and-month flown over every year.

The page builds both tables from these rows, so switching between destinations and airlines doesn't fetch again.

## Pieces

- **`datasette.yml`:** `airport_size` and `airport_changes`.
- **`plugins/t100_globe.py`:**
  - routes for `/airports/{code}/destinations` and `/airports/{code}/changes`;
  - `/airports/{code}` serves the new over-time page, or 301s to `/destinations` when the query carries a matrix-only setting;
  - a `views_for` case giving the four views for all four paths;
  - breadcrumbs as above;
  - each page is given the airport's first and last years with departures (from `airport_year_totals`), for the year menus.
- **Templates:**
  - `templates/airport.html` (new: over time);
  - `templates/routes.html` (now the destinations page, with its new title);
  - `templates/airport_changes.html` (new).
- **`static/charts/src/airport.js`:** pure functions, tested on their own:
  - `sizeSeries(rows, { measure, flights, split })` → stacked series, with the airline split's top 8 plus "Other";
  - `placeCounts(rows, { min })` → destinations per year, domestic and international;
  - `classifyChanges(rows, { a, b, min, show })` → the rows with a status, for destinations or airlines;
  - `summariseChanges(rows)` → kept, dropped and added counts.
- **`static/charts/airport.js`:** the script for the over-time and changes pages. It reads the state, fetches, draws and keeps the address in step, as `airline.js` does for an airline's two pages.
- **`static/charts/routes.js`:** a row's code opens `/airports/X/destinations`.
- **`static/nav/src/state.js`:** the new targets, as above.
- **`scripts/smoke_check.sh`:**
  - `/airports/SFO` (expecting `size-chart`);
  - `/airports/SFO/destinations` (expecting `matrix`);
  - `/airports/SFO/changes` (expecting `change-table`);
  - a 301 for `/airports/SFO?n=50`.

## Out of scope

- A highlight on airline links: an airline's page has nothing to pick out.
- Counting airlines over time as a chart.
- Arrivals: everything here counts departures.
- The family map, the last of the new views.

## Testing

**Python (pytest):**
- `views_for` gives the four views, with the right one current, for each of the four paths.
- `/airports/SFO?n=50&scale=year` gives a 301 to `/airports/SFO/destinations?n=50&scale=year`, and the same for each of `n`, `group`, `rank`, `scale` and `open` alone. `/airports/SFO?measure=seats` gives 200, the charts.
- `/airports/SFO`, `/airports/SFO/destinations` and `/airports/SFO/changes` give 200 with their elements, titles, breadcrumbs and views line. A foreign airport shows its note on each.
- An unknown or malformed code gives 404 on the new paths, as it does on the old one.
- `airport_size` for SFO in 2019: the sum of passengers equals `airport_year_totals`' for SFO in 2019. United's group is among the rows.
- `airport_changes` for SFO, 2019 against 2023: each destination's departures in each year equal `routes_by_year`'s for that year.

**JavaScript (`node --test`):**
- `sizeSeries`:
  - sums by service, by kind and by airline;
  - filters by flights;
  - keeps the top 8 airlines and folds the rest into "Other", ordered biggest at the bottom with "Other" on top.
- `placeCounts`: counts destinations at or above the minimum per year, split by service the way the matrix decides it.
- `classifyChanges`:
  - kept, dropped and added at the minimum's edge (a destination with exactly the minimum counts);
  - destinations and airlines both;
  - the airlines column lists the busiest three, then "+ n more".
- `summariseChanges`: the counts.
- `state.js`:
  - `/airports/X` carries `measure` and nothing of the matrix's;
  - `/airports/X/destinations` carries what `/airports/X` carried before;
  - `/airports/X/changes` carries only `theme`.

**In a browser (headless Playwright):**
- `/airports/SFO` draws both charts. Switching to the airline split shows United and "Other"; the legend's United links to its airline page.
- `/airports/SFO?n=50` lands on the matrix with 50 rows.
- On the matrix, clicking a row's code opens that airport's matrix; the breadcrumb "SFO" goes to the charts.
- `/airports/SFO/changes` shows the summary and dropped destinations. Switching to airlines and to added redraws without a fetch, and the address keeps up.
- A carried `measure` from the busiest-airports table (`/airports?sort=freight`) reaches the charts and the matrix.
- There are no page errors.
