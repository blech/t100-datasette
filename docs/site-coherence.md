# Site coherence

The aim is to make the site feel like one piece, in how it looks and in how it works. The pages were built one at a time, each with its own number formatting, colours, links and tooltips. This roadmap groups the work into buckets. Each bucket gets its own spec and plan in `docs/superpowers/` when its turn comes.

## Buckets

### 1. Number precision: done (merged, branch `number-precision`)

- **Rounding:** three significant figures everywhere, through one shared formatter, `static/common/numbers.js`.
- **Forms:** prose says "51.5 million" or "1.11 billion". Tables, tooltips and axes use a single unit, million: "51.5 million", "1,110 million", "(millions)".
- **Docs:** spec `docs/superpowers/specs/2026-10-20-number-precision-design.md`, plan `docs/superpowers/plans/2026-10-21-number-precision.md`.
- **Deferred minors:**
  - Hover titles read "– lb" or "– passengers" when a value is missing.
  - The freight axis label doubles its parentheses: "Freight (short tons) (millions)".
  - Freight tooltips say "… freight" with no "tons".
  - Counts of things in the map summary lines lack thousands separators.
  - The guard test only catches `tickFormat: '~s'` spelled exactly that way.
  - The JS and Python formatters differ above a trillion and for tiny fractions.

### 2. Popovers and chart conventions: done (merged, branch `popovers`)

- **One tooltip for every chart:** move them all to the HTML tooltip the front page's airline chart uses (`attachYearTip`). Numbers are right-aligned, rows follow the stack order, and each row has a colour key. Listing the whole stack also makes segments too thin to see harmless: they show up as rows instead of catching the pointer on their own.
- **No totals needed.** The apparent "total" on a route chart was the topmost segment, an invisible "Other" sliver.
- **Stack order matches the legend (bug):** on the route page, "Other" moves between bottom and top from year to year (e.g. `/airports/ATL/JFK`). The legend is ordered by size, but the bars stack in data order, which `buildSeries` sorts alphabetically. The family chart passes `order: res.series`, and the route page should too. A site-wide convention: biggest at the bottom, "Other" on top, everywhere.
- **Segments too thin to see:** keep charting them, since they're real data and hiding them would change the totals. The stack-wide popover is the fix.
- **The table under a route's chart** is always airlines × aircraft, whatever "split by" says. It should probably follow the split, so the chart and the table show the same breakdown.

### 3. Navigation: done (merged, branch `navigation`)

- **Find and filter: built** (branch `search-box`, no spec). A box that opens a subject's page and a box that narrows a table are kept apart:
  - **Find:** "Find an airline", "Find an airport" or "Find an aircraft" (`templates/_find.html`, `static/charts/find.js`), under the title on each section's pages other than its tables. On the airline map it sits in the controls row, as the airport map's picker does, and opens the airline's map. The lists come from `airline_list`, `airport_list` and `aircraft_list`.
  - **Filter:** the airlines and aircraft tables' own box, labelled "Filter", after their settings and just above the rows. The tables need no find box: filter, then open the name.
  - The airport maps keep their picker; the busiest and most-dedicated airports tables have neither box.

- **Placement:** the line of related links under the breadcrumb (`<p class="related">`) is written separately in each template, so what it offers is ad hoc. The busiest-airports page and the front page have none, which is why "Airports" never appears in it.
- **Questions:**
  - Should it stay a subhead, move to a footer, or become a dropdown from the breadcrumb?
  - Should it tell children (an aircraft page's engine story) apart from siblings (Aircraft → Airlines)?

### 4. Views: maps lead to maps, tables to tables

Each subject has some of the same few kinds of view. A view should link to the same kind of view for related subjects: an airport's map to the maps of the airlines flying there, a table to the matching table. Today most links go to a subject's default page, whatever kind of view the reader was in.

What exists now (updated as views are added):

| Subject | Table | Map | Chart over time | Matrix |
|---|---|---|---|---|
| All airports | `/airports` (busiest) | `/airports/globe` | | `/airports/over-time` (airports × years) |
| One airport | `/airports/SFO/changes` (destinations and airlines gained and lost) | `/airports/SFO/globe` | `/airports/SFO` (size, destinations) | `/airports/SFO/destinations` (destinations × years) |
| One route | `/airports/SFO/LHR/table` (airlines × aircraft) | only as a line on the airport and airline maps | `/airports/SFO/LHR` (stacked bars; one year by month) | |
| All aircraft | `/aircraft` (families and types) | | `/aircraft/makers`, `/aircraft/engines` | `/aircraft/over-time` (families × years, each opening into its aircraft) |
| One aircraft family | | | `/aircraft/boeing-737` | |
| One aircraft | | | `/aircraft/boeing-737/boeing-737-800` | |
| All airlines | `/airlines` (groups and members) | | front page airline chart | `/airlines/over-time` (airlines × years) |
| One airline | `/airlines/delta/changes` ("What changed" routes) | `/airlines/delta/globe` | `/airlines/delta` (size, airport pairs) | `/airlines/delta/routes` (airport pairs × years) |

Questions:
- **Cross-links:** which links between views should exist? For example, map → map for the same year and service, table → table, matrix cell → the route or the airline.
- **Matrices:** how do they fit in? They're part table, part chart. Should they be the standard "over time" view for any list of things (airports, aircraft, airlines, routes), with a shared look and the same row-ranking and colour-scale controls? And should an airline or a family get a matrix of its routes or versions too?
- **Narrowing down, or back to the top? Settled: pages cross, with highlights; data links narrow** (spec `docs/superpowers/specs/2026-10-22-data-links-design.md`).
  - A link between subjects opens the other subject's own page, with what you came from highlighted when that page can show it, and with the settings the two pages share.
  - Every page links, as "This page's data" in its footer (or "This map's data" in a map's controls), to the canned query behind it, with its settings filled in. That's where to narrow: five queries take an optional airline `group` (a route, a route in a year, an aircraft family, and an airport's size and changes), and a highlighted airline fills it in.
  - Still to come: **carrying the year** from the airlines and aircraft tables, and from an airport's Changes rows, to the pages they link to.
  - **Fixed from the data links' final review:** clearing a highlight on a route or family page left its data link narrowed to that airline.
  - **Deferred minors from the data links' final review:**
    - **A route with no flights in the year** (or no data, or a failed load) shows no data link: the page returns before setting it, like the deferred `carryQuery()` minor above.
    - **An airport's map in months mode** draws `routes_by_month` for the year, but links `routes_by_year`.
    - **An airline's map while comparing** links only the later year, not the one compared with.
    - **The all-airports map's link** sits inside the chooser's collapsed list, styled like one of its airport codes.
    - **Big data pages** are heavy on a phone: American's routes are 29,534 rows, 16 MB of HTML, as canned query pages render up to `max_returned_rows` (50,000).
- **Gaps:** which empty cells in the grid matter? For example, a map for an aircraft family (where it flies), or a table of all airlines.

**Part 1 (one kind of view per page): built on branch `views-pages`**, spec `docs/superpowers/specs/2026-10-22-views-pages-design.md`.

- **Deferred minors from its final review:**
  - **A JavaScript error on a route's table page:** if the route data fails to load, `static/charts/routepage.js` writes to `#route-chart-plot`, which only the chart page has, and throws. The "could not load" status still shows.
  - **Links lose their settings on a route with no data, or after a failed load.** `main()` returns before `carryQuery()` runs, so the views-line and reverse-direction links lose the current query. Calling `carryQuery()` at the top of `main()` fixes both.
  - **On the airline map,** the views line (Over time, Changes) doesn't carry the map's settings. Only `#table-link` does, with `from`, `to` and `min`.
  - **On an airline's changes page,** the minimum-flights sentence sits above `<h2 id="changes">`, so a `#changes` jump scrolls past it.
  - **`views_for` accepts any all-digit year** (`/airports/SFO/LHR/20190`). That route 404s, so there's no visible effect.

**Part 2 (carrying a highlight across links): built on branch `highlight`**, spec `docs/superpowers/specs/2026-10-22-highlight-links-design.md`.

- **Deferred minors from its final review:**
  - **Clicking "clear" with a mouse** hides the highlight line, so the chart moves up about 30px under the pointer and highlights whatever is now beneath it until the pointer moves. Blanking the line rather than hiding it would keep its space.
  - **The highlight line uses the airline group's legal name**, unshortened (e.g. "Hyannis Air Service, Inc. dba Cape Air").
  - **With `measure=load_factor`** (lines, not a stack), the line still says "Highlighting …", but nothing is highlighted.
  - **`setPinned` and its WeakMap in `static/common/highlight.js` are unused,** because "clear" redraws instead.
  - **Tests:** the family `keep` test checks "Other"'s total but re-imports `buildFamilySeries`, which is already imported.

**Part 3 (four new views): on branch `new-views`**, one spec and plan each.

- **A table of all airlines: built**, spec `docs/superpowers/specs/2026-10-22-airlines-table-design.md`.
  - `/airlines` is the table: groups that open to their members, sortable, with year, flights, routes, limit and search.
  - The matrix moved to `/airlines/over-time`. The views line is "Airlines · Over time", and it carries `measure`, `flights` and `service` both ways.
  - Old `/airlines` links with `n`, `rank` or `scale` get a 301 to the matrix.
  - **Deferred minors from its final review:**
    - **A disclosure opened by a search can't be closed** while the search matches through a member: the ▾ toggles `open`, but `matched` keeps the group open. The aircraft table has the same pattern.
    - **Freight reads "freight (short tons)" mid-sentence** in the status line and the empty message. The matrix strips the parenthetical; the aircraft table doesn't either.
    - **"Flew" can depend on the chosen year:** the query's `HAVING` drops a member's (service, kind) rows that didn't fly that year, along with their years. One group in 2000 (Air Transport International, 1994–2016 against 1994–2021), none in 2010 or 2025.
    - **The status during a search** pairs the match count with everyone's total ("2 airlines, 900 million passengers"). Inherited from the aircraft table.
    - **The matrix's "airlines" breadcrumb** doesn't carry `measure`, `flights` and `service`, unlike the views line.
    - **The group "Federal Express Corporation"** isn't found by "FedEx".
- **An airline's routes: built as a matrix**, spec `docs/superpowers/specs/2026-10-22-airline-routes-design.md`.
  - `/airlines/{airline}/routes` shows airport pairs (both directions together) by year, with route-years of at least 12 departures, and labels that open the route with the airline highlighted.
  - The views line is Over time · Routes · Changes · Map.
  - A table version was considered and dropped.
  - **Fixed from its final review:** a pair's link opens its alphabetical direction, which the airline may never have flown (57 of FedEx's pairs in 2019). The route page now says "This airline doesn't fly this way; try the other way, …" (or offers the other way under "No flights"), keeping the highlight.
  - **Deferred minors from its final review:**
    - **An airline that never flew a pair 12 times in a year** (94 of 841 groups) gets "Nothing to chart for this selection.", which suggests a setting would help. It could name the reason.
    - **The truncation warning** is set on `#rank-note` before `draw()` rewrites it, so it's never seen. Older than this branch; it affects `/airlines/over-time` too, and doesn't trigger today.
    - **The chart waits for the airports query** (1.3 MB) that only supplies hover text. It could draw first and add places after, or use a slimmer query.
    - **American's routes are 4.2 MB, uncompressed:** worth turning on gzip (datasette-gzip, or at the proxy).
    - **The cell popover** shows codes only ("ATL – LGA · 2019"); the label's hover has the places.
    - **Same-airport pairs** (GCN – GCN, sightseeing) appear as rows.
    - **At phone width** the year labels crowd together, as on the airlines matrix.
    - **A made-up highlight** (`?highlight=airline:nope`) now says "This airline doesn't fly this way" rather than nothing.
- **An airport's views: built**, spec `docs/superpowers/specs/2026-10-22-airport-views-design.md`.
  - `/airports/{code}` is now Over time: how big (split by domestic or international, passenger or freight, or the top 8 airline groups, each linking to its page) and how many destinations each year.
  - The matrix moved to `/airports/{code}/destinations`; old links with `n`, `group`, `rank`, `scale` or `open` get a 301 to it. Its row codes open each airport's matrix.
  - `/airports/{code}/changes` compares two years: destinations or airlines dropped, added or kept.
  - The views line is Over time · Destinations · Changes · Map. Links to the charts carry only `measure`; links to the matrix carry the matrix's settings.
  - Every count is of departures from the airport, unlike the airline pages' airport pairs.
  - **Fixed from its final review:** the matrix's heading went back to "routes over time" once its data loaded; a route page's "routes over time" link opened the charts. The route note now reads "More from SFO: over time · destinations · map".
  - **Deferred minors from its final review:**
    - **An airport with no flights** (`/airports/ZZZ`) says so, but still shows its empty controls ("Show [ ] for…", "Compare [ ] with [ ]").
    - **"First flown here"** for an added airline counts over every year, so it can be decades before the years compared (Condor at SFO: 1990), as on an airline's Changes page. It could be the first month after the earlier year, or be labelled "first ever".
    - **Reversed years** (from after to) give a summary that reads backwards.
    - **Legend links match by short name,** so two top-8 groups that shorten alike would share one link.
    - **The new pages' titles don't name the place,** unlike the matrix's "SFO (San Francisco, CA)".
- **An airports matrix: built** (no spec; a small addition on the airlines matrix's page script).
  - `/airports/over-time` shows US airports by year (those with at least 365 departures in some year), counting departures from each; the views line is Busiest airports · Over time · Map.
  - Its codes open each airport's destinations matrix; the measure and the table's sort carry each way for passengers, departures and freight.
  - No passenger/freight or domestic/international choice: `airport_year_totals` doesn't split either way.
- **City grouping: built** (no spec). The busiest-airports table and the airports matrix show airports or cities (`group=city`, carried between them), from a new derived table, `airport_market` (each code's newest BTS city market).
  - A city adds up its airports (busiest first when opened), counts each destination once, and is named by the city name its airports carry most between them (Washington, DC, not BWI's Baltimore, MD).
  - `top_airports` now gives every US airport of the year with its market, and the table picks its top 20 airports or cities itself.
  - City rows show the market's name only ("Los Angeles, CA"); every city row opens, a one-airport market too, and the airports inside are the links. The ▸ is a column of its own between the names and the cells (a small helper, `disclosureArrows`, shared by the airports matrix, the destinations matrix and the families matrix); for now the name opens and closes the row too.
  - The destinations matrix's city view takes the same labels: no codes beside the name (they're on hover and in the opened rows), and a label column sized to its longest label.
- **Backlog: city pages.** A page for a BTS city market, so a city's name can link somewhere: what an airport has (over time, destinations, changes, map), added up across its airports.
  - Address: `/airports/cities/{market}` (e.g. `/airports/cities/new-york-ny`, keeping it in the Airports section) or a section of its own at `/cities/{market}`.
  - The queries filter by `origin` and can take a market's list of codes instead.
  - Once they exist, a city's name links to its page and the ▸ alone opens the row, as the aircraft table separates a family's name from its disclosure.
  - Further on: city pairs for routes (New York–Miami across LGA, JFK, EWR and MIA, FLL), as `explore/12_market_routes.sql` on the `explore/sql-scripts` branch tried.
- **Still to come:** a family map.
- **Idea: comparing aircraft.** Charting several aircraft together (the AN-225 beside the AN-124 and the 747-8) probably wants to be general: the same picking and overlaying for airlines, airports and routes, not a feature of the aircraft page.
- **The aircraft page** (`docs/superpowers/specs/2026-10-23-aircraft-page-design.md`) is built: `/aircraft/<family>/<aircraft>`, reached from an aircraft's name in the table. Still to come: a "families or aircraft" grouping option on the table, and the types page replacing the long-haul page.
- **The families matrix: built** (no spec; the airports matrix's page script and city grouping reused). `/aircraft/over-time` lists families by year; a ▸ opens a family into its aircraft, the family's name opens its page and an aircraft's name opens that aircraft's page. Data: a new query, `aircraft_by_year` (no new table). The views line is Families · Over time · Makers · Long-haul engines. The matrix's links to a family or an aircraft carry its measure, kind of flight and routes (`measure`, `flights`, `service`, which those pages read too); the views line carries nothing, and the family and aircraft pages don't link back with their settings. Untested in a phone-width browser.

### 5. Colour: done (merged, branch `colour`)

- **One palette:** `static/common/palette.js` holds every data colour by role, light and dark (spec `docs/superpowers/specs/2026-10-21-colour-design.md`).
- **The colours:**
  - Ember (deep red to sand) for stacked series, spread across the ramp when there are fewer than eight;
  - teal and ember for domestic and international;
  - Ember jets in the engine charts;
  - ember for the accent.
- **Kept as they were:** matrices on YlOrRd, and the front page's liveries.
- **Pointing at a series** fades the others.
- **Open:** teal or slate for domestic, to judge on the real site; it's one row in the palette.
- **Deferred minors:**
  - theme switches refetch some chart data (front page, an airline's airport pairs);
  - `/aircraft/engines` listens for theme switches before its data loads;
  - the colour guard misses double-quoted `scheme:` and 3- or 8-digit hex.

### 6. Page frame: done (merged, branch `page-frame`)

- **One base stylesheet:** `static/common/base.css` is loaded first everywhere (spec `docs/superpowers/specs/2026-10-21-page-frame-design.md`).
- **Titles:** 32px on desktop and 26px on phones, on every page.
- **No sideways scroll on phones.**
- **Theme fallbacks** are defined once and held to `themes.js`.
- **Backlog: Datasette's own pages in the site's style, light mode only.** The data pages (the database index, the `t100` table browser, canned query results, rows) keep Datasette's look today.
  - **Templates:** `templates/base.html` extends `default:base.html` and overrides only blocks. In `extra_head` it links a Datasette-only stylesheet, and in `nav` it puts the site header (`_nav.html`) in place of Datasette's. Datasette's page templates are not copied, so upgrades don't need merging. Datasette already uses the name `crumbs` for its macros, so the plugin passes the site's crumbs under another name, through `extra_template_vars`. The footer already comes through.
  - **Styles:** one stylesheet maps the site's tokens onto Datasette's classes: the body font and colours, links, the header and footer, the results table (`.rows-and-columns`) to match the site's tables, the parameter form, buttons, and the table browser's filters and facets. Datasette's `app.css` (about 4,000 lines) stays underneath.
  - **No dark mode there:** the stylesheet gives the light tokens only, with no `prefers-color-scheme` block, so it doesn't link `base.css` as it stands. It sets `color-scheme: light`, and the page doesn't run `static/nav/main.js`'s theme painting. A reader in dark mode gets a light data page, as now, and the footer there already has no theme menu. Dark mode could come later as its own step.
- **What follows** is the original description of the problem:


The scrolling pages and the full-window maps have grown separate layout rules. The navigation work lined up their headers; the rest still differs:

- **Titles:** 32px on the scrolling pages, 28px on the maps, and 22px on a phone map.
- **The map's header block** (title, stats, picker) floats over the globe with its own spacing.
- **Two pages scroll sideways on phones** because of wide tables: `/airports` (637px at 390) and an airline's "What changed" table (849px).
- **The theme colours are defined twice:** fallbacks in `static/landing/style.css` and `static/globe/style.css` before the script runs, and `static/nav/main.js` for every page after.

A shared set of base styles for both kinds of page could hold the column, the type sizes and the colour fallbacks in one place.
- **Extended saved queries (branch `extended_saved_queries`; started).** The saved queries are the site's open data, so the next idea is to make them answer the questions the charts raise.
  - Built so far: `family_detail` takes `year`, `service`, `kind` and `sort` (name, passengers or freight, within each year); a new `family_airlines` gives one row per airline for a family (or one of its aircraft) in a year or all years, summed over service and kind, with the same filters and sort. A bar on the family and aircraft charts opens it for that year (on the aircraft split a bar still opens the aircraft's page; a tooltip can't hold a link, so it is the bar).
  - Still to decide: derived columns (freight per departure, seats per departure, passengers per seat as a load factor; integer division in SQLite needs a `1.0 *`), and which of the other saved queries want the same year, filter and sort parameters.
