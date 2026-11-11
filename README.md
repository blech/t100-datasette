# T100 Flight Data Visualizer

This is a [Datasette](https://datasette.io/) project for exploring the BTS T-100 segment data: aggregate monthly flights, seats, passengers and freight between airports, for international and domestic services, 1990-2025.

It has two layers:
- a **front page** at `/` (Datasette's own index is at `/-/`): an introduction and three short stories with a graphic each: a map of the busiest US airports (Alaska, Hawaii and Puerto Rico in insets), long-haul flights moving to twin-engined jets, and how much of the market the biggest airlines carry. Its numbers come from the `busiest_airports`, `engines_by_year`, `carrier_concentration` and `top_carriers` queries when the page is rendered. Old links to `/?year=…&sort=…` redirect to `/airports`.
- the **busiest airports** table at `/airports`: a sortable table of the busiest US airports for any year, linking to each airport's map and its routes over time. The year range comes from `plugins: t100_globe: min_year / max_year` in `datasette.yml`; update `max_year` when a new year of data is loaded, and the front page's stories follow it.
- a **most dedicated airports** page at `/airports/dedicated`: two server-rendered top-10 tables for one year (`?year=2025`), one for passengers (among the 100 busiest US airports) and one for freight (among the 25 biggest), of the airports where a single airline group carries the largest share. It reads `airport_carrier_dir_year` through the `dedicated_airports` query and is the second view in the airports section's views line.
- a **risers and fallers** page at `/airports/movers`: which US airports' passengers grew faster or slower than the median airport's between two years (`?from=1990&to=2025&min=500000`; `min` is one of 100,000, 500,000, 1 million or 5 million passengers in the first year). Two server-rendered tables of ten (risers and fallers, with growth, growth against the median, and each airport's peak year and how far below it it is now), and two charts drawn by `static/movers/main.js`: growth against size (log axes, the ten furthest from the median labelled) and passengers indexed to the first year for those ten and the median airport. Pointing at an airport's line, its name or its row in a table picks it out in all of them and fades the other lines. An airport with under 1% of its first year's passengers left (probably no longer served: Detroit City, say) is left out of the median, tables and charts and named under the tables. It reads `airport_movers` and `airport_movers_series` and is the fourth view in the airports section's views line. Design: `docs/superpowers/specs/2026-11-11-airport-movers-design.md`.
- a **routes matrix** at `/airports/routes`: the busiest airport pairs flown by any airline, both directions together, by year, for a range of distances (`?from=0&to=500` for under 500 miles), domestic or international. It reads `top_routes_by_year` and is the fourth view in the airports section's views line.
- an **airport network map** at `/airports/<AIRPORT>/globe` (for example `/airports/ATL/globe`; `/airports/globe` is the same map with an airport chooser, where hovering an airport (or tapping it once) shows its domestic routes for the latest year; `/globe` redirects there): pick a US airport, see its routes by year on a globe or flat map (international in orange, domestic in blue), play through the years, and drill down to months. Clicking a route links to its route page.
- a **routes-over-time** page, the main page for an airport, at `/airports/<AIRPORT>`: a destination-by-year matrix (optionally grouped by BTS city market, with rows that open into their airports).
- a **route** page at `/airports/<FROM>/<TO>` (and `/airports/<FROM>/<TO>/<YEAR>` for the months of one year): a stacked chart and a table, each split by carrier, aircraft family, aircraft, carrier and family, or carrier and aircraft. These replace the Datasette `route` and `route_year` pages for browsing; those queries remain as raw data tables.
- the standard **Datasette interface** for tables and canned queries, for exploring everything else.

## Prerequisites

- **Python**: `>=3.14`
- **uv**: The project uses `uv` for dependency management (see `pyproject.toml` and `uv.lock`).

### Dependencies
The project relies on the following key packages:
- `datasette`: The core data exploration tool
- `datasette-geojson`: For rendering map visualizations (e.g., flight routes)
- `sqlite-utils`: For database manipulation

## Getting Started

1. **Install dependencies:**
   If you haven't already, install the project dependencies using `uv`:
   ```bash
   uv sync
   ```

2. **Import data:**
   See `setup_database.md` (schema, segment files, lookup tables and airport coordinates).

3. **Run the Datasette server:**
   Start the application by running the following command from the root of the project directory:
   ```bash
   ./start.sh
   ```
   (that is `uv run datasette --port 8808 --reload .`)
   *Note: you must pass the directory (`.`), not just `t100.db`. Directory mode is what loads `datasette.yml` (canned queries and settings), `plugins/`, `templates/` and `static/`; naming only the database file silently ignores all of them.*

4. **Explore the data:**
   Open your browser and navigate to `http://localhost:8808` to view the interface. You can authenticate as the `root` user using the link in the terminal.

## Project Structure

- **`t100.db`**: SQLite database: `t100_international` and `t100_domestic` segment tables, a `t100` view over both (with a `domestic` 0/1 column), and lookup tables for carriers, aircraft types, airports and airport coordinate overrides, `airport_dir_year` (per-airport yearly totals, departing and arriving kept apart), `airport_carrier_dir_year` (the same by merger-aware airline group, for an airport's carrier mix), `airport_names` (BTS's newest city name per airport code), `airport_market` (BTS's newest city market per airport code), `search_index` (one row per airport, airline, aircraft family and aircraft the header search can open, with the lowercase words it is found by), and rollups by aircraft family, merger-aware carrier group and aircraft group/distance band (`aircraft_family`, `family_year`, `carrier_group`, `carrier_group_year`, `aircraft_group_band_year`, `family_detail_year`, `carrier_pair_year`, `route_year_totals`), each airport pair's distance (`pair_distance`), and the routes matrix's pairs and year totals by distance band (`top_route_year`, `route_band_year`), all derived from the segment tables: rebuild them with `build_database.rebuild_derived_tables` after loading data. Not committed.
- **`datasette.yml`**: Datasette configuration and canned queries: `top_us_airports`, `destinations`, `route`, `route_year`, the queries behind the map (`airports`, `routes_by_year`, `routes_by_month`), and `search` (the header search: up to three typed words matched against `search_index`, six of each kind).
- **`plugins/`**: `t100_globe.py` registers the front page and the `/airports/...` pages (the older `/globe`, `/globe/ATL`, `/routes/ATL` and `/route/A/B` paths redirect); `t100_render_links.py` renders `more_detail` columns as links; `t100_guard.py` refuses `_next` and `_facet` on the two big segment tables and serves `/robots.txt`; `t100_usage.py` writes the anonymous visit log described under Usage statistics. `t100_assets.py` gives `/static/` files a cache lifetime and provides the `script_url()` and `modulepreload()` template functions: the page scripts' bundle from `static/dist/` when `npm run bundle` has built one (the Docker image and CI do; development normally runs the source modules), with `<link rel="modulepreload">` tags so the browser fetches everything a page needs at once.
- **`templates/`**: the site's pages, which all extend `t100_base.html` (head, header and footer; pages fill its blocks, and the maps override `body`), and `base.html`, which dresses Datasette's own pages (database, table, canned query, row) in the site's style: the white header with a `site / data` breadcrumb from `_data_header.html`, and `static/datasette/style.css`, light mode only, with Datasette's compact tables kept.
- **`static/search/`**: the header's search panel (opened by the magnifier right of About, or `/`), which looks up airports (by code, city, name or country), airlines and aircraft as you type. It is the way to jump to a page: the only find box left is on `/airports`, and the airline and aircraft tables filter their own rows.
- **`static/nav/`** and **`templates/_nav.html`**: the header shared by every page (breadcrumb trail, the search icon, and a theme chooser: Auto follows the system's light or dark mode, or pick Light or Dark, both from AirTrail's colours) and the code that keeps `theme`, `measure`, `service` and the matrix settings in in-site links (reading a map's `hide` setting back into `service`). The site name in the trail is `site_name` under `plugins: t100_globe` (default `t100.husk.org`).
- **`static/home/`**: the front page's graphics. The map uses `static/globe/src/usamap.js`, d3's Albers USA projection with a third inset for Puerto Rico and the Virgin Islands, drawn over the vendored us-atlas `states-10m.json`.
- **`static/globe/`**: the map's browser code (plain ES modules, no build step) and vendored d3-geo; served at `/static/globe/` `src/routestyle.js` and `src/compare.js` hold the colouring, filtering and year comparison shared with the airline map (`static/charts/airlineglobe.js`).
- **`build_database.py`**: schema, indexes, the `t100` view and airport override loading (`schema.sql` is generated from it).
- **`data/aircraft_families.csv`** and **`data/carrier_groups.csv`**: the editable rules for the family and merged-carrier rollups (re-run `rebuild_derived_tables` after editing).
- **`data/airport_overrides.csv`**: coordinates for airport codes missing from OpenFlights.
- **`serve_public.sh`**: run command for a locked-down public instance.
- **`tests/`** and **`static/globe/test/`**: pytest and `node --test` suites.
- **`fetch_t100.py`**: script for fetching or updating the raw T100 source data.

## Tests

```bash
uv run pytest   # queries, page route, public mode
npm test        # the map's pure JavaScript modules
```

## Public mode

`./serve_public.sh` serves the database read-only (`--immutable`), with arbitrary SQL and database downloads turned off and responses cacheable for a day. `PORT` (default 8808) and `HOST` (default 127.0.0.1; use 0.0.0.0 in a container) are environment variables. Container and hosting configuration is not included yet.

## Canned queries

- **`destinations`**: aggregate statistics (passengers, seats, freight) for flights from an airport, by month, as a plain table.
- **`route`**: a specific route (origin to destination) by year, carrier and aircraft type.
- **`route_year`**: month-by-month data for a route in one year.
- **`top_airports`**: reads `airport_dir_year`, `airport_carrier_dir_year` and `route_year_totals`. For one year (`year=2025`) or all years, a direction (`dir` empty for both, `out` or `in`) and a service (`service` empty or `all`, `domestic` or `international`), every US airport's flights, seats, passengers, freight and destinations, so the busiest-airports table can show its top 10, 25 or 50 for whichever column is sorted. `region=abroad` lists the airports outside the US instead, ranked by their flights to and from the US (only those are in T-100); for them `dir=out` is flying to the US and `in` is flying from it. A service's totals are the airport's flights in that BTS file; its destinations are the routes most of whose departures are in that file, as the matrices count them. **`airport_by_year`** gives each airport's years the same way, one row per service (`region=abroad` for the airports outside the US, as `top_airports` takes it). **`destinations`** also takes an optional `year`.
- **`busiest_airports`**, **`carrier_concentration`**, **`top_carriers`**: the front page. `carrier_concentration` ranks operating carriers by passengers each year, so regional airlines flying for the big brands count on their own.
- **`airport_movers`**: reads `airport_dir_year`. For a range (`from_year=1990&to_year=2025`) and a minimum size (`min_pax`, passengers both ways in the first year), every US airport's passengers in the two years, the ratio of the two (0 if it had none in the last year), that ratio against the median ratio of the airports listed (`vs_median`: 2 is twice as fast as the median airport, 0.5 half), a `lost` flag for an airport with under 1% of its first year's passengers left (still listed, but not in the median), and its busiest year in the range with the last year's share of that peak (`vs_peak`, which tells an airport that never grew from one that grew and lost it). Fastest growing first. **`airport_movers_series`** gives the same airports (same parameters) one row per year, for the page's lines.
- **`airport_ranks`**: reads `airport_carrier_dir_year`. For one airport (`origin`) and year, per measure (passengers, freight; both directions): its total, its rank among the US airports with any and how many there are, the airline group carrying most of it and its share, and its rank by that share in the pool `dedicated_airports` ranks (empty outside it). The airport page's line under its heading (a sentence of those, for the latest full year, with ranks past `SIZE_RANK_LIMIT` and `DEDICATED_RANK_LIMIT` in `plugins/t100_globe.py` left out).
- **`dedicated_airports`**: reads `airport_carrier_dir_year`, counting both directions. For one year (`year=2025`) and `measure=passengers` or `freight`, the ten airports whose biggest airline group has the largest share of the airport's passengers (pool: the 100 busiest) or freight (pool: the 25 biggest), with the airport's size rank, the airline's and the airport's totals, and the share. Freight is in pounds.
- **`domestic_routes`**: reads `route_year_totals`. Every domestic airport pair in one year (`year=2025`), both directions together, with the same rule for domestic and the same 24-flight cut-off as `routes_by_year`'s default, so hovering an airport on `/airports/globe` shows what its own map shows with international hidden.
- **`top_routes_by_year`**: reads `top_route_year` and `route_band_year`. Every airport pair that could be in the routes matrix's top 50 for its service and distance band by flights, seats, passengers or freight (over all years, or in the last full year), by year with its distance, then rows with `rest = 1` giving every pair's totals for each year, service and band, so the matrix's shares count the routes it doesn't list. The selection is made by `build_database.rebuild_top_route_year`, as doing it live took 2 to 3 seconds.
- **`airports`, `routes_by_year`, `routes_by_month`**: JSON for the map pages. `routes_by_year` and `routes_by_month` label each destination `domestic` or `international` by whether most of that period's departures were domestic. Routes with fewer than 12 departures in the year (one-off charters, diversion legs, positioning flights) are left out of both; pass `min_deps=N` to change the cut-off (`min_deps=0` shows everything). In the month query the cut-off applies to the year's total, so a route shows all its months or none.

## Deployment

Every push to `main` runs `.github/workflows/deploy.yml`: the Python and JavaScript tests, then `flyctl deploy` to the Fly app named in `fly.toml`, then `scripts/smoke_check.sh` against the live site (also usable by hand: `scripts/smoke_check.sh [base-url]`). The deploy needs a Fly deploy token stored as the `FLY_API_TOKEN` repository secret:

    flyctl tokens create deploy -a blech-datasette-t100 | gh secret set FLY_API_TOKEN

The database is not part of the image: it lives on the Fly volume (`/mnt/db/t100.db`) and a code deploy does not change it. If a code change needs a new table or column, load it on the volume first, or the smoke check will fail after the deploy. A deploy restarts the machine, which means a few seconds of downtime.

## Usage statistics

When `T100_USAGE_LOG` names a directory (`fly.toml` sets `/mnt/db/usage`), `plugins/t100_usage.py` appends one tab-separated line per page view to `visits-YYYY-MM.log` there: time, an anonymous visitor token, the page (years replaced by `{year}`, no query string), status, referring host, and `human`, `bot` or `other` (crawler traffic on the data pages). The token is the start of a hash of the client address, User-Agent and a random salt kept in a private file and replaced each UTC day, so it can't be reversed and doesn't link days. No address or User-Agent is stored, and a failure to write never affects a page. The design is in `docs/usage-stats.md`.

Read it with `scripts/usage_report.py` (standard library only; it is in the image):

    flyctl ssh console -a blech-datasette-t100 -C "python3 scripts/usage_report.py /mnt/db/usage --month 2026-10"

`--prune 12` also deletes files older than 12 months. The log is per machine, so it assumes the single machine this app runs on.
