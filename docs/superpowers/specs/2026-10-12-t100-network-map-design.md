# T-100 public airport network map: design

Status: draft for review (2026-10-12)

## Goal

Add a purpose-built, public-facing visualisation to the T-100 Datasette site: pick a US airport, see its routes on a globe (or flat map) for any year from 1990 to 2025, with domestic and international routes visibly distinct, and drill down to months. Datasette remains the exploration and deep-dive layer behind it.

The site is public but not yet announced. Domestic data (added October 2026) is meant to make it more useful. The author also wants freedom over the visualisation itself (projection, animation, styling), which Datasette's query-page templates make awkward.

## Non-goals

- Replacing Datasette, or building a separate app server.
- A pre-built static dataset (considered and rejected; see "Decisions").
- Carrier, aircraft and load-factor analysis in the new page. Those stay in the existing `route` and `route_year` canned queries, linked from the page.
- A whole-network time-lapse, rankings pages, or route-level analysis views. Possible later; not in this spec.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Hero view | Airport network map | Chosen by the author; closest to the current `destinations` page. |
| Architecture | Datasette plugin serving a custom page, calling same-origin JSON from canned queries | Year-level data fits under the 50k row cap for every airport (max 11,190 rows), so no pre-built dataset is needed. Version-controlled, supports URL state, no CDN. |
| Not Datasette Apps | Apps are used for prototyping only | Apps are stored in `internal.db` (not git), run in a sandboxed iframe with no history API (no shareable URLs), and are single-file. |
| Resolution | Year by default, month on demand for one year | ATL by month for all years is 89,702 rows (over the cap); one year by month is ~2,900. |
| Tables | `t100_international` and `t100_domestic`, plus a `t100` view (`UNION ALL`, extra `domestic` 0/1 column) | Already implemented in `t100.db`. The two sources have different column naming and coverage rules, and pairs can appear in both, so they stay separate tables with a combined view on top. |
| Hosting | A managed container platform (Fly, Cloud Run or similar; to be chosen in the plan) | Stated by the author. |

## Data layer

All queries read the `t100` view and return JSON. They are defined in the Datasette config (`datasette.yml`, loaded with `-c`; in the installed 1.0 alphas, `queries` in a `-m` metadata file is ignored).

1. **`airports`**: no parameters, about 4,000 rows. Columns: IATA code, name, city, country, latitude, longitude, US-or-not flag. Fetched once by the page.
2. **`routes_by_year`**: parameter `origin`. One row per destination and year: departures, seats, passengers, freight, and `service` (`domestic` or `international`).
3. **`routes_by_month`**: parameters `origin`, `year`. The same columns by month.
4. Existing queries stay: `top_us_airports` (picker seed), `route` and `route_year` (deep-dive links).

### The `service` rule

An origin, destination and year can appear in both source tables. In the current data 16,128 such combinations exist (for example LAX to SFO in 2018: 286 domestic rows carrying about 2.0M passengers and 59 "international" rows carrying 13). A route in a given year is `domestic` if the majority of its `departures_performed` came from domestic rows, otherwise `international`. Departures are used rather than passengers so freight-only routes still classify. The rule lives in the SQL, once, not in JavaScript.

### Airport coordinates

Of 4,360 distinct codes in the data, 1,634 have no coordinates in `openflights_airports`. They carry about 0.11% of passengers, but include city-wide codes with real traffic (SEL ~27M passengers, OSA ~6.5M, old BER ~1.1M) and small US airfields (IFP, BLD, ILE, WFB and similar).

- Add a small hand-maintained mapping from city-wide codes to coordinates.
- Add the BTS Aviation Support Tables airport table as a second coordinate source. Its coverage has not been checked.
- `data/airport_overrides.csv` (loaded into the `airport_overrides` table, which wins over OpenFlights) holds the largest unplaced codes: SEL, OSA, BER, TQO, IFP, ILE, BLD, XWA. The BTS airport table is not used yet.
- The page drops routes it cannot place and shows a footnote with the number skipped.
- Matches have not been checked for correctness (codes get reused over 35 years); rare mismatches are possible.

## The page

- A plugin in `plugins/` registers a route (for example `/globe/<origin>`) and ships its own static files: d3 modules, TopoJSON, land data, renderers. Nothing loads from a CDN.
- **Reused from flightglobe** (copied, not symlinked, with their tests): `geo.js`, `camera.js`, `interaction.js`, `themes.js` and the vendored d3-geo and TopoJSON libraries. flightglobe's renderers and its timeline and playback code are built around individual flights, so they are not reused; `renderer.js` is new.
- **New:** a data adapter for the three queries, the airport picker, the year slider (with play), the month drill-down, the legend, and the click panel.
- Airport picker: type-ahead over `airports`, seeded by `top_us_airports`.
- Year slider defaults to the latest year. Play steps through years.
- One great-circle arc per destination. Width scales with passengers (or departures); colour comes from `service`.
- Hover shows the destination and year totals. Click opens a panel with a link to the existing `route` and `route_year` pages for that origin and destination.
- Globe and flat map toggle. The flat map uses d3-geo's built-in Equal Earth projection; flightglobe's interrupted homolosine needs two more vendored libraries and a UMD shim, so it is left out for now. Both read the same data.
- Rendering uses HTML canvas. ATL has roughly 400 destinations in a year.
- The URL carries state (`origin`, `year`, projection) so pages are shareable and the back button works.
- The existing Leaflet `destinations` template stays until the new page replaces it.

## Deployment

- One container image: pinned Datasette 1.0 alpha, the repo's plugins, templates and `datasette.yml`, and `t100.db`. Does not include `datasette-agent`, `llm` or related packages.
- The database is opened read-only with `--immutable`.
- Public lock-down: `allow_sql: false`, `allow_download: false`, keep `sql_time_limit_ms: 5000` and `max_returned_rows: 50000`, and a long `default_cache_ttl` (data changes about yearly). A CDN in front is optional.
- Cloud Run bakes the 2.6GB database into the image; Fly uses a volume. The plan chooses based on the platform picked.
- Yearly updates (BTS data arrives about each March): replace the manual `setup_database.md` steps with one repeatable build script (fix headers, load both tables, build indexes, create the view). Data stays out of git.

## Testing

- Python tests (pytest) for the three queries against a small fixture database. They cover the `service` rule (including a pair in both tables), the row cap, and airports with no coordinates.
- `node --test` for the pure JavaScript (projection and camera maths, data adapter).
- Manual browser checks for rendering and interaction.

## Open items and risks

- **Database build script.** Loading segment files, creating indexes and loading overrides is documented in `setup_database.md` as manual commands; a repeatable script is deferred. `build_database.py` currently holds the schema, indexes and the override loader only.
- **Airport coordinates.** Matches were checked for existence, not correctness (codes get reused over 35 years). About 30 to 40 destinations per busy airport (mostly small FAA-coded airfields) still have no coordinates and are listed in the page footnote.
- **Datasette version.** The tested version is the one in `uv.lock` (1.0a41). Datasette Apps and stored-query access are not used.
- **Year-level row cap headroom** is about 4.5x for the largest origin (11,190 of 50,000). The queries return `truncated` and the page warns if it is ever hit.
- **Hosting platform** is not chosen; the container image and platform config are not written.
