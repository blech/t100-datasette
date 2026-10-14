# T100 Flight Data Visualizer

This is a [Datasette](https://datasette.io/) project for exploring the BTS T-100 segment data: aggregate monthly flights, seats, passengers and freight between airports, for international and domestic services, 1990-2025.

It has two layers:
- a **landing page** at `/` (Datasette's own index is at `/-/`): a sortable table of the busiest US airports for any year, linking to each airport's map and its routes over time. The year range comes from `plugins: t100_globe: min_year / max_year` in `datasette.yml`; update `max_year` when a new year of data is loaded.
- an **airport network map** at `/globe/<AIRPORT>` (for example `/globe/ATL`): pick a US airport, see its routes by year on a globe or flat map (international in orange, domestic in blue), play through the years, and drill down to months. Clicking a route links to its route page.
- a **routes-over-time** page at `/routes/<AIRPORT>`: a destination-by-year heat map (optionally grouped by BTS city market, with rows that open into their airports).
- a **route** page at `/route/<FROM>/<TO>` (and `/route/<FROM>/<TO>/<YEAR>` for the months of one year): a stacked chart by carrier or aircraft and a carrier-and-aircraft table. These replace the Datasette `route` and `route_year` pages for browsing; those queries remain as raw data tables.
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

- **`t100.db`**: SQLite database: `t100_international` and `t100_domestic` segment tables, a `t100` view over both (with a `domestic` 0/1 column), and lookup tables for carriers, aircraft types, airports and airport coordinate overrides, and `airport_year_totals` (per-airport yearly totals derived from the segment tables; rebuild with `build_database.rebuild_airport_year_totals` after loading data). Not committed.
- **`datasette.yml`**: Datasette configuration and canned queries: `top_us_airports`, `destinations`, `route`, `route_year`, and the queries behind the map (`airports`, `routes_by_year`, `routes_by_month`).
- **`plugins/`**: `t100_globe.py` registers the `/globe` pages; `t100_render_links.py` renders `more_detail` columns as links.
- **`templates/`**: `globe.html` (the map page) and templates for the canned query pages.
- **`static/globe/`**: the map's browser code (plain ES modules, no build step) and vendored d3-geo; served at `/static/globe/`.
- **`build_database.py`**: schema, indexes, the `t100` view and airport override loading (`schema.sql` is generated from it).
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
- **`top_airports`**: reads `airport_year_totals`. For one year (`year=2025`), the airports in the top 20 by passengers, departures, seats or freight, so the landing page can show a top 20 for whichever column is sorted. **`destinations`** also takes an optional `year`.
- **`airports`, `routes_by_year`, `routes_by_month`**: JSON for the `/globe` page. `routes_by_year` and `routes_by_month` label each destination `domestic` or `international` by whether most of that period's departures were domestic. Routes with fewer than 12 departures in the year (one-off charters, diversion legs, positioning flights) are left out of both; pass `min_deps=N` to change the cut-off (`min_deps=0` shows everything). In the month query the cut-off applies to the year's total, so a route shows all its months or none.
