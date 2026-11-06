# Changes: the archive

What happened before the hand-written changelog (`templates/changelog.html`) starts on 23 October 2026, reconstructed from git commit messages. It covers 25 May to 22 October 2026, newest first, in the changelog's style. It is a summary, not a complete list: merges, review fixes and spec/plan documents are mostly folded into the feature they belong to.

## 22 October 2026

- **Views part 3: the airlines table, an airline's routes matrix and an airport's views**
  - An airport's page is now over time at `/airports/{code}`, with its destinations matrix moved to `/destinations` and what changed at `/changes`; old addresses redirect
  - Charts for how big by service, kind or airline, how many destinations, and destinations and airlines gained or lost
- **Views part 1 and 2 merged**: one kind of view per page, and a highlighted airline carries across links
- **Every page links to the data behind it**
  - The canned query is built with every parameter set, in the footer or a map's controls
  - A highlighted airline narrows the route's and the family's data to that airline; clearing it widens the link again
  - Datasette's own pages leave out the theme menu and data link, which only work on the site's pages
- **Helicopters grouped by maker**, with their models as versions: Bell, Sikorsky, Airbus (Eurocopter, MBB, Sud), Leonardo (Agusta)
- **Airports matrix at `/airports/over-time`**: US airports by year, codes opening each airport's destinations matrix
- **Airports or cities**: the busiest airports table and the airports matrix can group airports into BTS city markets (new `airport_market` table)
- **Busiest airports: "All years"** at the top of the year menu
- **Hovering a matrix row label shows a popover**: airport names, a city's airports, an airline's full name, a route's places
- Heat maps are now called matrices, in prose and code

## 21 October 2026

A big day for consistency. A roadmap (`docs/site-coherence.md`) was written, and then most of it was done.

- **Number precision**: counts to three significant figures, in words for screen readers, with the exact figure on hover. Later the same day, "× 10⁶" became "51.5 million" and axes read "(millions)"
- **Popovers**: one shared popover for charts, matrices and map tooltips, showing the whole period with the top of the stack first
  - Tap once to show, twice to follow
  - Point at a series to fade the others and bold it in the popover
- **Navigation**: the four sections on every page, a views line under the breadcrumb in place of hand-picked links, and a footer with the theme chooser
- **Colour**: a palette with every data colour by role, built around Ember. Teal for domestic and ember for international routes. A guard test stops pages using colours outside it
- **Page frame**: a base stylesheet for every page, so page stylesheets only keep their own rules
- **Views part 1**
  - A route's table gets its own page (`/airports/{a}/{b}/table`)
  - An airline's changes get their own page (`/airlines/{airline}/changes`)
  - The aircraft table becomes `/aircraft`
- **Views part 2**: `?highlight=airline:{id}` pins an airline in route and family charts, keeping it out of Other
  - Links from an airline to a route, and a route's row to an aircraft family, carry the highlight
- **Airlines table**: `/airlines` is now a table, with groups that open to their members, sorting, filters and search. The heat map moved to `/airlines/over-time`
- **An airline's routes matrix**: `/airlines/{airline}/routes`, airport pairs by year
- A route page whose highlighted airline only flew the other way says so and offers that direction
- Busiest airports table: load factor and destinations in place of seats
- Airport map: Centre turns the globe back to the airport; Fit routes zooms to frame the routes shown
- Front page airlines chart: a legend row on top, with hover highlighting

## 20 October 2026

- **Aircraft table and manufacturer chart**: a table of aircraft types and a chart by maker, backed by a new `type_year` rollup
  - Limit to the top 15, 20 or 50 families, or those above 1% or 0.1%
  - An "all years" choice in the year menu
- **Big aircraft families split into the versions people know**
- **Year span option** on the family, route and airline charts: years flown, or all years
- **Two themes**, Light and Dark, from AirTrail's colours, with Auto following the system
- Front page airlines: passengers carried by today's four biggest airlines, stacked under everyone else
- Engine labels renamed (two jet engines, three, four or more)
- Maps: hovering an airport on the all-airports map shows its domestic routes
- `setup_database.md`: how to load changed tables onto the Fly volume without copying the whole database

## 19 October 2026

- The database is checked against `schema.sql` at startup and at `/-/derived`

## 18 October 2026

- **A new front page** that tells three stories, with a map of the busiest US airports (Alaska, Hawaii and Puerto Rico as insets), a long-haul engine chart and an airline concentration chart. A failing query costs its section, not the page
- The busiest-airports table moves to `/airports` and the map chooser to `/airports/globe`; `/` and `/globe` redirect
- `route_year_totals` and a `domestic_routes` query: every domestic route in a year, matching each airport's own map
- Aircraft types gain maker and kind columns
- Airline map decides domestic by majority of departures, as the airport map does

## 17 October 2026

- **Maps get route styling**: colour by service or change, legend chips that filter, opacity by route count, dashes for dropped or added routes
- **Compare two years on the airport map** as well as the airline map, with a shared year range
- The nav carries a map's hidden service to other pages
- Production deploys are recorded as GitHub deployments, linked to t100.husk.org

## 14 October 2026

- **Aircraft and airline pages arrive**
  - Rollup tables for aircraft family, carrier group and distance band
  - `/aircraft`, `/aircraft/engines`, family pages and `/carriers` (moved to `/airlines` later the same day)
  - An airline page with size, airport pairs served, and routes dropped or added between two years
  - A map of an airline's network, with a year slider, then a two-handle year range, and an airline search box
  - Merged airlines can be split by member, and each member has its own page
  - Short airline names in labels, with the full BTS name on hover
- **Airport URLs put the airport first**: `/airports/SFO`, `/airports/SFO/globe`, `/airports/SFO/LAX`
- **A shared header** with breadcrumb title and theme chooser; Night is the default when the system prefers dark
- An About page, linked from the caveats
- Routes chart: rank destinations by the latest full year; colour by share of each year or relative to the top destination
- Fixes: carriers shown as Unknown on the all-years route view, and route pages counting a segment once per lookup row of its airline entity

## 13 October 2026

- **Deployed to Fly**: a public-mode image serving the database from a volume, with CI to test, deploy and smoke-check on every push to `main`
- **Landing page**: a sortable top-20 airports table, and a chooser page with airports as clickable dots (new `airport_year_totals` table)
- **Route pages**: `/route/<from>/<to>[/<year>]`, with a stacked-bar chart by year, measure and split controls, year drill-down and a carrier table
- **Routes over time**: a destination-by-year heat map per airport, grouped by BTS city market
- Datasette-plot and the Leaflet destinations page were retired in favour of templated charts
- The network map hides routes under 12 departures a year; adds freight to the line width menu and a domestic/international filter, all kept in the URL
- BTS's own city names for airports (new `airport_names` table)

## 12 October 2026

- **The airport network map**: a canvas globe (and flat map) at `/globe` showing an airport's routes, built on a vendored d3-geo and reusing flightglobe's geometry, camera and interaction
- A test harness (pytest), plus `airports`, `routes_by_year` (a route counts as served if a majority of departures say so) and `routes_by_month` queries
- A locked-down public run mode (`serve_public.sh`)
- Datasette updated; the run command documented

## 25–27 May 2026

- **First build**: a Datasette over the BTS T-100 segment data, a data-updating script, and a README
- Canned queries for route-by-year, route-by-month, top airports and top destinations (with a year parameter), moved into `datasette.yml`
- Charts via datasette-plot, replacing datasette-vega
- Database setup commands and schema; then quiet until October
