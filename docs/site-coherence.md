# Site coherence

The aim is to make the site feel like one piece, in how it looks and in how it works. The pages were built one at a time, each with its own number formatting, colours, links and tooltips. This roadmap groups the work into buckets. Each bucket gets its own spec and plan in `docs/superpowers/` when its turn comes.

## Buckets

### 1. Number precision: done (branch `number-precision`)

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

### 2. Popovers: next

- **One tooltip for every chart:** move them all to the HTML tooltip the front page's airline chart uses (`attachYearTip`). Numbers are right-aligned, rows follow the stack order, and each row has a colour key.
- **Stacked bars show the whole:** hovering anywhere on a stack, including the empty space above it, should give the stack's total as well as the segment. Today a pointer above a bar picks the topmost segment, often an invisible sliver like "Other: 964", which reads as if it were the total.

### 3. Navigation

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
- **Gaps:** which empty cells in the grid matter? For example, a map for an aircraft family (where it flies), or a table of all airlines.

### 5. Colour

There are six palettes, each chosen where it's used:
- **Heat maps:** YlOrRd, from white through orange to red.
- **The engine chart:** blues, then greys.
- **An airline's page:** two blues.
- **Family charts and the route page:** Plot's tableau10 default. This is the one most in need of change.
- **The front page's airlines:** livery colours.
- **The maps:** orange for international, blue for domestic.

The theme accent is a third blue, #3b82f6. Should they be unified, and how far?
