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

- **Placement:** the line of related links under the breadcrumb (`<p class="related">`) is written separately in each template, so what it offers is ad hoc. The busiest-airports page and the front page have none, which is why "Airports" never appears in it.
- **Questions:**
  - Should it stay a subhead, move to a footer, or become a dropdown from the breadcrumb?
  - Should it tell children (an aircraft page's engine story) apart from siblings (Aircraft → Airlines)?

### 4. Views: maps lead to maps, tables to tables

Each subject has some of the same few kinds of view. A view should link to the same kind of view for related subjects: an airport's map to the maps of the airlines flying there, a table to the matching table. Today most links go to a subject's default page, whatever kind of view the reader was in.

What exists now:

| Subject | Table | Map | Chart over time | Heat map |
|---|---|---|---|---|
| All airports | `/airports` (busiest) | `/airports/globe` | | |
| One airport | | `/airports/SFO/globe` | | `/airports/SFO` (destinations × years) |
| One route | `/airports/SFO/LHR` (airlines × aircraft) | only as a line on the airport and airline maps | `/airports/SFO/LHR` (stacked bars; one year by month) | |
| All aircraft | | | `/aircraft/engines` | `/aircraft` (families × years) |
| One aircraft family | | | `/aircraft/boeing-737` | |
| All airlines | | | front page airline chart | `/airlines` (airlines × years) |
| One airline | `/airlines/delta` ("What changed" routes) | `/airlines/delta/globe` | `/airlines/delta` (size, airport pairs) | |

Questions:
- **Cross-links:** which links between views should exist? For example, map → map for the same year and service, table → table, heat map cell → the route or the airline.
- **Heat maps:** how do they fit in? They're part table, part chart. Should they be the standard "over time" view for any list of things (airports, aircraft, airlines, routes), with a shared look and the same row-ranking and colour-scale controls? And should an airline or a family get a heat map of its routes or versions too?
- **Narrowing down, or back to the top?** Should views keep refining, such as `/airports/ATL/JFK?airline=Delta`, a route as one airline flies it? Or do links go back to the top-level page after a point, so a route links to Delta's own page? A filter is easy to build, because the route's rows carry the airline. Delta's "What changed" table already links to its routes but drops the airline on the way. Undecided.
- **Gaps:** which empty cells in the grid matter? For example, a map for an aircraft family (where it flies), or a table of all airlines.

### 5. Colour: done (merged, branch `colour`)

- **One palette:** `static/common/palette.js` holds every data colour by role, light and dark (spec `docs/superpowers/specs/2026-10-21-colour-design.md`).
- **The colours:**
  - Ember (deep red to sand) for stacked series, spread across the ramp when there are fewer than eight;
  - teal and ember for domestic and international;
  - Ember jets in the engine charts;
  - ember for the accent.
- **Kept as they were:** heat maps on YlOrRd, and the front page's liveries.
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
- **What follows** is the original description of the problem:


The scrolling pages and the full-window maps have grown separate layout rules. The navigation work lined up their headers; the rest still differs:

- **Titles:** 32px on the scrolling pages, 28px on the maps, and 22px on a phone map.
- **The map's header block** (title, stats, picker) floats over the globe with its own spacing.
- **Two pages scroll sideways on phones** because of wide tables: `/airports` (637px at 390) and an airline's "What changed" table (849px).
- **The theme colours are defined twice:** fallbacks in `static/landing/style.css` and `static/globe/style.css` before the script runs, and `static/nav/main.js` for every page after.

A shared set of base styles for both kinds of page could hold the column, the type sizes and the colour fallbacks in one place.
