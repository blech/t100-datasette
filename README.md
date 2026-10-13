# T100 Flight Data Visualizer

This is a [Datasette](https://datasette.io/) project for exploring the BTS T-100 segment data: aggregate monthly flights, seats, passengers and freight between airports, for international and domestic services, 1990-2025.

It has two layers:
- an **airport network map** at `/globe/<AIRPORT>` (for example `/globe/ATL`): pick a US airport, see its routes by year on a globe or flat map (international in orange, domestic in blue), play through the years, and drill down to months. Clicking a route links to the detailed canned queries.
- the standard **Datasette interface** for tables and canned queries, for exploring everything else.

## Prerequisites

- **Python**: `>=3.14`
- **uv**: The project uses `uv` for dependency management (see `pyproject.toml` and `uv.lock`).

### Dependencies
The project relies on the following key packages:
- `datasette`: The core data exploration tool
- `datasette-geojson`: For rendering map visualizations (e.g., flight routes)
- `datasette-plot`: For rendering charts and graphs
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

- **`t100.db`**: SQLite database: `t100_international` and `t100_domestic` segment tables, a `t100` view over both (with a `domestic` 0/1 column), and lookup tables for carriers, aircraft types, airports and airport coordinate overrides. Not committed.
- **`datasette.yml`**: Datasette configuration and canned queries: `top_us_airports`, `destinations`, `destinations_map`, `route`, `route_year`, and the queries behind the map (`airports`, `routes_by_year`, `routes_by_month`).
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

- **`destinations` & `destinations_map`**: aggregate statistics (passengers, seats, freight) for flights from an airport, by month. `destinations_map` includes GeoJSON lines for the Leaflet map.
- **`route`**: a specific route (origin to destination) by year, carrier and aircraft type.
- **`route_year`**: month-by-month data for a route in one year.
- **`airports`, `routes_by_year`, `routes_by_month`**: JSON for the `/globe` page. `routes_by_year` and `routes_by_month` label each destination `domestic` or `international` by whether most of that period's departures were domestic.
