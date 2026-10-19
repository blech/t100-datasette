# New front page

## Purpose

`/` is currently the busiest-airports table. It becomes a front page that explains in a sentence what the data is, then offers three ways in: airports, aircraft and airlines. Each is a short section with one plain-English finding and a small graphic. People who know what they want can go straight through a section's links. People who don't get a reason to click.

The busiest-airports table moves to `/airports`.

## Audience and writing rules

- The page assumes no knowledge of T-100, BTS or aviation terms. Experts lose one sentence; newcomers get a way in.
- Each story is written from the reader's side. It names aircraft people may have flown on, and explains a term in a clause rather than using it bare. For example, write "jets with three or four engines: 747s, DC-10s, TriStars", not "quads and tris".
- Every number in the prose comes from the database when the page is rendered. None are typed into the template.

## URLs

| Path | Before | After |
|---|---|---|
| `/` | busiest-airports table | new front page |
| `/airports` | redirect to `/` | busiest-airports table |
| `/airports/globe` | (none) | the airport map chooser, formerly `/globe` |
| `/globe` | the airport map chooser | 301 to `/airports/globe`, keeping the query string |
| `/routes` | redirect to `/` | redirect to `/airports` |

- `/` with any of the table's parameters (`year`, `sort`) returns a 301 to `/airports` with the same query string, so old bookmarks keep working.
- `/` with other parameters, such as `theme`, stays on the front page.
- `/airports/globe` cannot clash with airport routes, because codes match exactly three characters.
- The globe page's breadcrumb becomes site › airports › globe.
- The nav's `targetOf` treats `/airports/globe` as a globe page. `/globe` is still accepted.
- Every link to `/globe` on the site changes to `/airports/globe`.

## Page structure

1. The nav, as on every page.
2. `h1`: "US air traffic, 1990–{max_year}".
3. The introduction, roughly:
   > Every scheduled and charter flight to, from and within the United States since 1990, as reported by airlines to the Department of Transportation: who flew it, between which airports, on what aircraft, and how many people and how much freight it carried.

   It is followed by a link to `/about` ("What the numbers mean").
4. Three sections, in this order: **Airports**, **Aircraft**, **Airlines**. Each section has:
   - a 1px rule across the top, with the `h2` directly beneath it (the husk.org/labs pattern);
   - one or two sentences carrying the finding and its key numbers;
   - a graphic no taller than `min(500px, 66vh)`, so at least part of the next section is visible on most screens;
   - one or two links to the full pages.
5. A short note covering what the reader needs: the operating-carrier caveat, the Pacific territories left off the map, and links to `/about`.

### The rule

- A new `--rule` colour token, defined for each theme, is darker than the existing pale table lines (`--line`). It follows the husk.org `#999` in the light theme.
- The style goes in `static/nav/style.css`, which every page loads, as a `.section` class: `border-top: 1px solid var(--rule)`, with small top padding before the `h2`.
- Only the front page uses it for now. Other pages can adopt it later.

## Section 1: Airports

**Text**, for example: "Atlanta is the busiest airport in the US: 51.5 million passengers boarded there in 2025, ahead of Dallas/Fort Worth and Chicago O'Hare." The top three airports and their figures come from `top_airports` for `max_year`.

**Map:**
- A flat map of the United States on the existing canvas `Renderer`, using a new projection mode `'usa'` beside `globe` and `flat`.
- The projection combines the lower 48 (Albers), the Alaska and Hawaii insets in the positions `d3.geoAlbersUsa` uses, and a third inset for Puerto Rico and the US Virgin Islands at the lower right. It follows d3's own `geoAlbersUsa` source: one sub-projection per region, each with its own clip extent, plus a `stream` that fans out to all of them and an `invert` that picks a region by point.
- It lives in `static/globe/src/usamap.js` and exports `geoAlbersUsaTerritories()`.
- The map shows land outlines from the existing `land-110m.json`.
- Points are the airports from `top_airports` for `max_year` with `origin_wac` 1–93, drawn as dots sized by passengers. The size scale matches the chooser's.
- The top 10 airports by passengers get code labels.
- Airports the projection can't place (Guam, Saipan, American Samoa) are dropped and named in the page note.
- There is no spinning, dragging or zooming.
- Hovering shows a tooltip with the code and city. Clicking goes to `/airports/{code}`.
- The size follows the container: full width, height `min(500px, 66vh)`, and redrawn on resize. Colours come from the active theme, using the same theme tokens as the globe.

**Links:** "All airports →" (`/airports`) and "Explore the map →" (`/airports/globe`).

## Section 2: Aircraft

**Text**, for example: "In 1990 most flights of 3,000 miles or more were flown by jets with three or four engines: 747s, DC-10s, TriStars. In 2025 twin-engined jets flew 94% of them." The 1990 and `max_year` shares come from `engines_by_year`: passenger flights, departures, 3,000-mile band, the same cut `/aircraft/engines` shows by default.

**Chart:**
- A stacked-area chart in Observable Plot of share of departures by engine group from 1990 to `max_year`.
- It uses `buildEngineShares`, `ENGINE_SERIES` and `ENGINE_COLORS` from `static/charts/src/rollup.js`, with the state fixed at `{measure: 'deps', kind: 'passenger', band: '3000'}`.
- It has a legend and tooltips like the engines page, but no menus.
- Its height is `min(380px, 66vh)`.

**Links:** "The long-haul story →" (`/aircraft/engines`) and "All aircraft →" (`/aircraft`).

## Section 3: Airlines

**Text**, for example: "In 1990 the four biggest airlines carried half of all passengers. As Southwest and other low-cost airlines grew, that fell to 42% by 2005; after a run of mergers it is 59% today." The numbers are:
- the top-four share for `min_year`;
- the lowest top-four share across all years, and its year;
- the top-four share for `max_year`.

"Mergers" is the only claim not computed from the data. It is common knowledge, and the chart doesn't depend on it.

**New canned query `carrier_concentration`:**
- One row per year: `year`, `top4`, `top10` (fractions of 1) and `carriers` (the count of carriers with passengers).
- Passengers come from `carrier_group_year`, summed per `airline_id` and year. That table covers all reporting carriers, domestic and international, US and foreign.
- Carriers are ranked by passengers within each year using `ROW_NUMBER()`, with ties broken by `airline_id`.

**Chart:**
- An Observable Plot line chart from 1990 to `max_year`, with the y axis running from 0 to 100%.
- Top four is a solid line. Top ten is a fainter line.
- Both lines are labelled at their right-hand ends.
- A tooltip shows the year and both shares.
- Below the chart, a line in the text names the `max_year` top four with their shares, for example "Southwest 15.4%, American 15.1%, Delta 15.0%, United 13.2%". It comes from a second small query, `top_carriers` (year → airline name and share, top 4), rendered on the server.

**Note:** "T-100 counts the airline that operates each flight. Regional airlines such as SkyWest fly many flights sold under the big brands' names, so those brands' real reach is larger than this shows."

**Link:** "All airlines →" (`/airlines`).

## Data flow

- The new `home_page` handler in `plugins/t100_globe.py` runs `top_airports`, `engines_by_year`, `carrier_concentration` and `top_carriers` on the `t100` database. It reads their SQL from Datasette's config, so the prose and the charts use identical queries.
- Small pure functions in a new module, `plugins/t100_home.py`, turn rows into the story numbers: `airport_story`, `engine_story` and `concentration_story`. Each returns a dict the template formats.
- The template is `templates/home.html`. It receives those dicts and `min_year`/`max_year`.
- The browser script is `static/home/main.js`. It fetches the same canned queries as JSON (through `queryUrl`/`fetchRows`) and draws the three graphics. The map also fetches the `airports` query for coordinates, as the chooser does.

## Moving the table

- `templates/landing.html` becomes `templates/airports.html`, and `static/landing/` becomes `static/airports/` (moved with `git mv`, tests included).
- The introduction above the table is cut down to what's specific to the table. The general introduction moves to the front page.
- The front-page sort fix (commit 4001923, unpushed) moves along with the table.
- `airports_index` renders the table instead of redirecting.
- The table's breadcrumb is site › airports.

## Failure and no-JavaScript behaviour

- The prose is rendered on the server, so the findings are readable without JavaScript and when a chart fails.
- If one of a story's queries returns no rows, the handler leaves that section's numbers out and shows the section with its links only. The page itself never errors.
- Each graphic's container shows "Loading…" and is replaced by the graphic. If its fetch fails, it shows a short "Couldn't load this chart" message. The other graphics are unaffected.
- The map's container needs a fixed height before it draws, so the page doesn't jump.

## Testing

**Python (pytest), using the existing fixture database:**
- `/` renders the front page: the three section headings, the introduction and the links.
- `/` with `year`/`sort` gives a 301 to `/airports` with the query kept. `/?theme=night` stays at 200.
- `/airports` renders the table. `/routes` redirects to `/airports`.
- `/globe` gives a 301 to `/airports/globe`, keeping the query. `/airports/globe` renders the chooser with the new breadcrumb.
- `carrier_concentration` returns correct shares and ties for a small fixture.
- `top_carriers` returns the top four with names.
- The story functions handle normal rows, a missing year and empty input.
- The existing tests that use `/globe` and `/` are updated to the new paths.

**JavaScript (node --test):**
- `usamap.js`: known points project inside the right inset (ATL in the lower 48, ANC in Alaska, HNL in Hawaii, SJU and STT in the Puerto Rico inset); GUM returns `null`; `invert` round-trips a point in each inset.
- The nav's `targetOf` accepts `/airports/globe`.
- Any pure helpers in `static/home/src/`.

**In a browser:** check headless Playwright screenshots at desktop and phone widths, in light and dark themes, for:
- graphic heights;
- the rule-above-heading pattern;
- the map insets;
- whether the top-ten line looks too busy (the owner may ask for it to be removed).

## Out of scope

- Applying the rule style to other pages.
- A manufacturer grouping for aircraft.
- Merger annotations on the airline chart.
- Any change to `/airports/globe` beyond its path.
