# T100 Flight Data Visualizer

This is a [Datasette](https://datasette.io/) project designed to visualize the T100 database, which contains data on international flights departing from the United States since 1990. 

It provides an interactive web interface to explore flight routes, carriers, aircraft types, load factors, and more, leveraging custom SQL queries and data visualizations.

## Prerequisites

- **Python**: `>=3.14`
- **uv**: The project uses `uv` for dependency management (see `pyproject.toml` and `uv.lock`).

### Dependencies
The project relies on the following key packages:
- `datasette`: The core data exploration tool.
- `datasette-geojson`: For rendering map visualizations (e.g., flight routes).
- `datasette-vega`: For rendering charts and graphs.
- `sqlite-utils`: For database manipulation.

## Getting Started

1. **Install dependencies:**
   If you haven't already, install the project dependencies using `uv`:
   ```bash
   uv sync
   ```

2. **Run the Datasette server:**
   Start the application by running the following command from the root of the project directory:
   ```bash
   datasette --root --host 0.0.0.0 --port 8808 --reload .
   ```
   *Note: Using `.` as the target directory tells Datasette to load the databases, `datasette.yml`, and `settings.json` automatically.*

3. **Explore the data:**
   Open your browser and navigate to `http://localhost:8808` to view the interface. You will be authenticated as the `root` user.

## Project Structure

- **`t100.db`**: The core SQLite database containing the T100 flight data, along with supplementary tables for carriers, aircraft types, and airports.
- **`datasette.yml`**: Contains Datasette configuration, including canned SQL queries (`routes`, `routes_map`, `route`, `pairs_drilldown`) which power the main drill-down views and map visualizations.
- **`settings.json`**: Datasette specific settings (e.g., `max_returned_rows` set to `50000` and increased SQL time limits).
- **`fetch_t100.py`**: Script for fetching or updating the raw T100 source data.
- **`templates/`**: Custom HTML templates for overriding default Datasette views.

## Features & Canned Queries

The `datasette.yml` file defines several powerful canned queries that you can access via the Datasette UI:
- **`routes` & `routes_map`**: View aggregate statistics (passengers, seats, freight, load factors) for flights originating from a specific airport. The `routes_map` query includes GeoJSON points for plotting lines on a map.
- **`route`**: Detailed breakdown of a specific route (Origin to Destination) by year, carrier, and aircraft type.
- **`pairs_drilldown`**: Deep dive into the performance of a specific route for a given year and month.
