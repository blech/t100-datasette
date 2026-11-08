# Visualisations

Notes from exploring new ways to draw the data, beyond the existing globe and chart pages. Prototypes live in `scripts/flightmaps/`. Nothing here is on the site yet.

## All flights for a month

The question: what would the airport map look like with *every* domestic flight for one month on it, and is there a way to draw that which isn't a jumbled mess? (US domestic only for now.)

A month is small enough to draw whole. July 2025 has about 40,000 `t100_domestic` rows. Grouped into unordered airport pairs, that's 7,153 pairs and 812,506 departures. Of those, 794,322 departures can be placed: the rest are at airports with no coordinates in `openflights_airports` or `airport_overrides`, mostly Alaska strips.

### What's been tried (July 2025)

- **Plain:** every pair as one great-circle line, all alike. A hairball: hubs just visible, the middle of the country solid ink.
- **Weighted:** width and opacity by departures, busiest drawn last, on a dark ground. Hubs stand out, but the middle is still mush.
- **Density:** every pixel adds the departures of each route crossing it (each route counted once per pixel), log scaled. Hubs become bright stars, with a fine mesh between them. **The preferred look so far.**
- **Bundled:** kernel-density edge bundling (after Hurter et al. 2012). Routes are pulled into shared corridors, like a road map. Striking, but bundling drags flights that pass near a hub into the hub, so a SFO–JFK flight looks as though it lands at Denver. The paths aren't flown tracks.
- **By airline:** small multiples, one panel per operating airline (wholly-owned regionals folded into their parent; SkyWest and Republic get their own panels, since T-100 doesn't say whom they fly for). The most legible view: Southwest's mesh, Delta's Atlanta fan, JetBlue's Northeast spokes and Republic's eastern-only network are each obvious at a glance.
- **Landing vs flying over:** the density map split by a modelled altitude. Below ~18,000 ft (climbing out, descending in) is orange; cruising is blue. Each airport becomes a starburst sized by the traffic that actually lands there; flyovers are blue lines crossing it.
- **Bundled, landing vs flying over:** the aim is bundling that knows the difference. Cruising points are only pulled by other cruising traffic, and low points by low traffic. Nothing below ~18,000 ft moves, so approaches stay straight fans. And only cruise more than ~300 km from either end of its route pulls on anything, otherwise a hub's own departures, just past top of climb, still drag the flyovers in. With all three, Denver is an orange burst and the coast-to-coast corridors pass north and south of it.

### Open

- **The blue layer saturates** in the landing-vs-flying-over density map, even with each colour scaled separately, so busy and quiet cruise corridors look alike.
- **Alaska, Hawaii and Puerto Rico** are off the frame; routes to them run off the edge. They'd need insets, as on the front page's busiest-airports map.
- **Over time:** a month per image makes a flip-book from 1990 to 2025 possible (hubs forming, Southwest spreading, the post-2008 mergers, April 2020). Not tried yet.
- **No labels or hover.**

### Where it could go on the site

- **`/airports/globe` with no airport chosen** could take a year and month and show the whole network: the density view. It's about where traffic goes, so it belongs with airports.
- **`/airlines/globe`** (the empty "All airlines" map cell in `site-coherence.md`) could be the small multiples, each panel linking to that airline's `/airlines/<slug>/globe`.
- **How to draw it:** the density views are rasters of per-pixel totals, and the globe is interactive and orthographic. Simplest is a flat image per month, pre-rendered in Python and served as a static file (all ~430 months is about an hour's batch). Live in the browser, a canvas with additive blending manages ~7,000 lines; the log scale and the altitude split would need WebGL. Bundled paths could be computed in Python and sent as JSON.

## All flights for a year, on the globe

### How many pairs

Airport pairs (unordered) with at least one departure in 2025, and how many survive a minimum number of departures in the year:

| Minimum departures in 2025 | Domestic pairs | Share of domestic departures | International pairs | Share of international departures |
|---|---|---|---|---|
| 1 | 19,427 | 100% | 7,873 | 100% |
| 12 (monthly) | 6,319 | 99.6% | 2,101 | 99.4% |
| 52 (weekly) | 4,969 | 99.3% | 1,812 | 99.0% |
| 365 (daily) | 3,407 | 96.2% | 1,150 | 92.6% |
| 730 (twice daily) | 2,557 | 91.0% | 702 | 78.7% |

- **The long tail is real and safe to drop:** two-thirds of domestic pairs have fewer than 12 departures a year, and together carry 0.4% of departures. Most of them (7,245 of 13,108) are charter-only (service classes L and P), and they're one-off charters and positioning flights, not routes.
- **Twelve a year is a sensible default floor:** about 6,300 domestic pairs, or 8,400 with international. A user-adjustable minimum (the airline map already has `min`) would let people put the tail back.
- **Over time the count grows:** domestic pairs in a year were 5,032 in 1990, 7,161 in 2000 and 16,672 in 2005, and have stayed around 16,000–19,000 since. With the 12-a-year floor: 2,221, 2,764 and 5,599, then 5,200–6,300.

### Is the current globe up to it

The globe (`static/globe/src/renderer.js`) isn't Observable Plot. It's hand-written Canvas 2D, using d3-geo for the projections (orthographic globe, Equal Earth flat map) and d3-array. Every frame it sorts the routes, then for each route: begins a path, has d3-geo project and clip its great circle, sets colour, opacity and width, and strokes. Hit-testing on hover walks every route's 25 sampled points.

Timed in Chrome on the page's own canvas size (2036 × 3210 device pixels), with random routes across the lower 48:

| Routes | d3-geo geometry only (Node) | Full draw, one stroke per route | Same, batched into 8 strokes |
|---|---|---|---|
| 165 (one airport) | 0.1 ms | 4.6 ms | 3.6 ms |
| 2,600 | 1.4 ms | 28 ms | 37 ms |
| 6,300 (domestic, ≥12 a year) | 3.4 ms | 67 ms | 72 ms |
| 19,400 (all domestic) | 10 ms | 204 ms | 388 ms |
| 27,300 (domestic + international) | 14 ms | 287 ms | 618 ms |

- **The cost is in drawing the pixels, not in d3:** about 10 µs per stroked route. Batching strokes doesn't help; long overlapping paths are slower to fill.
- **A still image is fine at any size:** a quarter of a second to draw the whole year once is acceptable.
- **Dragging and play-through-the-years aren't:** smooth needs about 16 ms a frame. Domestic with the floor gets about 15 frames a second; everything gets 3–5.
- **Without WebGL, three steps help:**
  - Draw only the biggest few hundred routes while the globe is moving, then the full set when it stops.
  - Pre-project each route's points once per rotation rather than through `geoPath`.
  - Use a spatial index for hover.

  That's probably enough for ~8,000 routes, but not for a density look: Canvas 2D can't do a log scale over summed light.
- **WebGL is the step change:** deck.gl draws 100,000+ great-circle lines at 60 fps, has a globe view (`_GlobeView`, still experimental) and additive blending, and could draw the density and landing-vs-flyover looks live. The catch is a rewrite of the renderer and hit-testing, and a large dependency for a site that otherwise vendors small d3 modules.

## Bowed arcs for a year's busiest routes

Static images in the site's light colours (teal routes, light land, near-black airport dots sized by passengers boarded), each drawn with and without a basemap. 2025, domestic:

- **Routes with a million or more passengers** (the BTS map's cut-off): 160 routes, 28% of domestic passengers. It reads well. Width separates the trunk routes (LAX–JFK, LGA–ORD, the New York–Florida bundle) from the rest. Bowing keeps routes that lie along the same line, such as ATL–MCO and ATL–MIA, apart.
- **Routes between the 20 busiest airports:** 187 routes, 25% of passengers. The 20 busiest airports are almost completely connected, with 187 of the 190 possible pairs having flights. An airport cut-off therefore simplifies nothing on its own; the map relies entirely on line width, and reads as a dense, even mesh. A passenger cut-off is the better simplifier.
- **Bowing:** each arc is a quadratic curve whose control point is offset by 22% of the route's length, to the left going west to east, so every arc bulges north, as in Patterson's drawing. Long arcs rise a long way; transcontinental ones pass over the Great Lakes.
- **Dot and label layout (the rule):** labels sit next to their own dot without touching it, and overlap no other dot or label; dots move apart until they touch but don't overlap.
  - **Dots:** pushed apart in pixel space, with larger dots moving less (each move is weighted by the other dot's area), and the arcs are drawn to the moved positions. The New York, Washington, Bay Area, Los Angeles and South Florida airports end up as small clusters of touching dots.
  - **Labels:** placed biggest airport first. Each tries 12 positions round its dot (east, then the diagonals, west, north, south), then the same positions a little further out, and takes the first that's clear. That's what moves TPA and SAT to the west, IAD and EWR to the left of their clusters, and the ATL and ORD labels clear of their own dots.
- **Exit labels:**
  - Routes to Hawaii, Alaska and Puerto Rico leave the frame with a "to HNL" label where they cross the edge, as the route-map convention ("To San Juan") does.
- **Basemap or not:** without one the network still reads as the US, as in the artworks, and the arcs are a little clearer. With one, the lower 48 give the long arcs something to measure against. Both work; the plain version suits the site's simple style.

## International routes on world projections

Routes in `t100_international` (every one has a US end) with 400,000 or more passengers in 2025: 148 routes, 38% of the passengers on routes to and from the US, between 76 airports. The 160th route carries about 389,000 passengers, so 400,000 is the round number nearest the domestic map's 160. International traffic is more concentrated than domestic, where 160 routes carry 28%. Arcs are the site's international orange, and dots are sized by each airport's total international passengers.

- **Equirectangular, centred on 100°W:** the most familiar, and it reads well. Asia is on the left across the Pacific, and Europe on the right. Bowing north imitates the real great circles over the North Atlantic and North Pacific. High latitudes are stretched, and there's empty space at the edges and in the south.
- **Azimuthal equidistant, centred on the North Pole:** northern routes come out close to their real great circles, so transpacific and transatlantic flights both look as short as they are. The southern hemisphere is badly stretched at the rim, though: São Paulo, Buenos Aires and Sydney are pulled out and around.
- **Azimuthal equidistant, centred on Kansas:** distance and direction from the middle of the US are true, so the map answers "how far away, and which way" directly. Tokyo and London come out at similar distances; the Gulf is further than Europe; Sydney is far out on its own. The cost is that the US airports crowd the middle, where labels need leader lines. Of the five this is my favourite, with bowed arcs or with great circles, which come out nearly straight from the centre.
- **Orthographic, centred on 45°N 90°W:** the closest to the site's globe, with true great circles that leave over the horizon. Tokyo and Haneda sit on the edge, and India, the Gulf, Singapore and Sydney are hidden. It's a good view to turn interactively, but weak as a single still image.
- **Projection problems solved on the way:**
  - world-atlas land is spherical: rings wind clockwise and jump the antimeridian. `planar()` unwraps, re-winds and cuts it before cartopy sees it, which stops the flat map's bands and the azimuthal maps' rings.
  - Great circles on the orthographic globe are sampled at 96 points and broken where they pass out of view, instead of left to cartopy, which zigzagged.
- **Labels:** the same layout rule as the domestic map. Labels now keep a 5 px gap from each other, so neighbours don't read as one word ("MNLTPE"). A label pushed more than 12 px from its dot gets a thin leader line. Very dense spots, like Havana under Miami, can still collide.

## The routes matrix, and what it raised (November 2026)

`/airports/routes` lists the busiest airport pairs by any airline, by year, for a range of distances, and can be ranked by any full year. Its tables (`pair_distance`, `top_route_year`, `route_band_year`) are described in the README. Two questions came out of looking at it. The figures below are from ad hoc SQL against `route_year_totals` and `pair_distance`; they count pairs flown at least weekly (104 flights a year, both ways) unless they say otherwise.

### The longest routes, and how they grew

The longest weekly pair has barely moved since 2004. Singapore Airlines' EWR–SIN (9,485 mi) on the A340-500 set it then; it was dropped in 2013 and came back in 2018 on the A350-900ULR. In 2025 IAH–SIN (9,838 mi) is the longest, with JFK–SIN and EWR–SIN behind it. Before that: LAX–SYD (7,487) in 1990, JFK–JNB (7,967) in 1995, ATL–JNB (8,433) in 2000.

The long tail is the story, not the record:

| Year | Pairs ≥ 6,000 mi | Pairs ≥ 7,500 mi | Passengers on pairs ≥ 7,500 mi |
|---|---|---|---|
| 1995 | 34 | 2 | 0.1M |
| 2004 | 53 | 10 | 0.8M |
| 2010 | 85 | 21 | 3.0M |
| 2019 | 155 | 42 | 8.0M |
| 2025 | 157 | 50 | 7.8M |

The aircraft on segments of 7,000 miles or more (`t100_international` by `aircraft_family`) show why:
- **1995:** 747s, with a few MD-11s.
- **2005:** mostly 747s, with A340s and 777s.
- **2015:** mostly 777s, then A380s, 747s, the first 787s and A340s.
- **2025:** 777s (20,600 departures), 787s (15,000) and A350s (14,100), with A380s behind; 465 747 departures.

Twin-engined jets, flying under ETOPS rules, made 7,500-mile routes pay between ordinary city pairs.

**Data problem:** the code `LSX` has a nonsense distance (LSX–SBA, 8,786 miles in 1990; LSX–OGG 7,144 in 2001). Leave it out of any longest-routes chart, or fix it with an override.

### Growing airports, shrinking busiest routes

ATL went from 48M to 103M passengers, while LAX–SFO fell from about 3.6M to 2.7M and the busiest pair is now international (JFK–LHR). These fit together: the growth went into more routes and fuller, bigger planes, not into the old busiest routes.

Domestic, both directions together:

| Year | Passengers | Flights | Passengers per flight | Seats per flight | Weekly pairs | Share on top 10 pairs | Top 100 | Top 1,000 |
|---|---|---|---|---|---|---|---|---|
| 1990 | 448M | 6.2M | 72 | 129 | 2,026 | 5.7% | 28.7% | 87.9% |
| 2000 | 622M | 7.9M | 79 | 116 | 2,297 | 4.6% | 25.2% | 85.8% |
| 2005 | 676M | 10.8M | 63 | 87 | 4,032 | 3.5% | 22.3% | 79.8% |
| 2019 | 821M | 9.3M | 88 | 107 | 4,094 | 3.6% | 21.6% | 77.8% |
| 2025 | 848M | 9.0M | 94 | 119 | 4,486 | 2.9% | 19.9% | 74.9% |

- **Spread:** twice as many weekly pairs, and the top 10 pairs' share has halved.
- **Plane size:** regional jets brought seats per flight down to the high 80s by 2005–2010; since then it has gone back up, with fewer, fuller, bigger planes.
- **The 2002 break:** small aircraft and commuter flights only enter the data from October 2002. That inflates flights and pairs and deflates plane size between 2000 and 2005, so a chart across it needs a caveat or a jets-only version.

**LA–Bay Area by BTS city market** (LAX, BUR, LGB, ONT, SNA and smaller fields against SFO, OAK, SJC and smaller ones):

| Year | Whole market | LAX–SFO's share |
|---|---|---|
| 1990 | 10.4M | 35% |
| 1996 | 12.5M | 22% |
| 2005 | 10.0M | 16% |
| 2019 | 12.9M | 27% |
| 2025 | 9.0M | 30% |

In the 1990s the market grew while LAX–SFO shrank: Southwest and Shuttle by United spread it over BUR–OAK, ONT–SJC, SNA–SFO and the like. The fall since 2019 is the whole market's, probably business travel lost since the pandemic, not a move between airports.

**ATL:**

| Year | Passengers | Weekly destinations | Passengers per flight | Seats per flight | Share on its top 10 routes |
|---|---|---|---|---|---|
| 1990 | 48M | 110 | 84 | 146 | 29% |
| 2000 | 80M | 184 | 95 | 134 | 26% |
| 2010 | 87M | 239 | 93 | 115 | 22% |
| 2025 | 103M | 242 | 131 | 159 | 19% |

Up to about 2010 ATL grew by adding destinations; since then, by fuller and bigger planes on fewer flights. Its biggest route, MCO, went only from 1.8M to 2.7M.

**Limit of the data:** T-100 counts passengers per flight segment, so a hub's total includes connecting passengers once per leg. It can't tell more point-to-point travel from more connecting through hubs. BTS's DB1B ticket sample has origin-to-destination journeys, if that question ever matters enough to bring in a second dataset.

### How it could be charted

- **Split the growth into parts:** passengers = pairs × passengers per pair, and passengers per pair = flights per pair × passengers per flight. Plot each part indexed to 1990 = 100, nationally or for one airport, with the 2002 break shaded; whichever line rises shows what carried the growth.
- **A concentration curve per year:** pairs ranked by size against their cumulative share of passengers. It flattens over the years.
- **City-market pairs, as well as airport pairs.** The airports matrix can already group by city market, which shows multi-airport cities (New York, LA, the Bay Area, Chicago, Washington) against one-big-airport cities like ATL. Grouping the routes matrix the same way would put LA–Bay Area, New York–LA, New York–Bay Area and Chicago–LA/Bay Area/New York on rows that open into their airport pairs. It would reuse `buildCityMatrix` and `airport_market`. The top city-market pairs (flights of 52 or more a year in either direction):

  | | 1990 | | 2025 | |
  |---|---|---|---|---|
  | 1 | Bay Area–LA | 10.4M (16 pairs) | Bay Area–LA | 9.0M (16) |
  | 2 | New York–South Florida | 4.9M (7) | New York–South Florida | 8.7M (13) |
  | 3 | LA–Phoenix | 4.6M | Orlando–New York | 5.7M |
  | 4 | Dallas–Houston | 4.5M | Chicago–New York | 5.7M |
  | 5 | Chicago–New York | 4.2M | LA–Las Vegas | 5.5M |
  | 6 | Washington–New York | 3.9M (13) | Atlanta–New York | 5.5M |
  | 7 | Honolulu–LA | 3.6M | LA–New York | 5.2M |
  | 8 | Boston–New York | 3.5M | Dallas–LA | 4.7M (11) |
  | 9 | Chicago–LA | 3.4M | Denver–LA | 4.5M |
  | 10 | Honolulu–Maui | 3.3M | London–New York | 4.4M |

  BTS markets include foreign cities (London is LHR, LGW, STN and LTN), so international city pairs would come too. The shuttles of 1990 (Washington, Boston, Dallas–Houston) have dropped out of the top 10, overtaken by leisure markets (and, on the Northeast Corridor, probably by Acela, from 2000, though this data can't show that).

## Other people's maps

### BTS: busiest routes and airports

The BTS map draws routes as straight lines, coloured and widened in five passenger classes (from "less than 1.25 million" to "2.5 million or more"), with purple airport bubbles sized by passengers boarded. Alaska, Hawaii and Puerto Rico are in insets.

- **It draws very few routes.** The cut-off looks like about 1 million passengers a year, both directions combined. In 2025 that's 160 of 19,427 domestic pairs, carrying 28% of passengers; 101 pairs pass 1.25 million (20%). Only 4 pass 2.5 million: JFK–LAX, LGA–ORD, LAX–SFO and ATL–MCO.
- **What it gains:** every line is legible, and the bubbles and trunk routes read together at a glance.
- **What it loses:** the network. Southwest's mesh, regional feeders and small airports disappear. Ranking by passengers favours long trunk routes; ranking by departures would bring short shuttles forward instead.
- **Weaknesses:**
  - The five green-teal classes are hard to tell apart, and they repeat what width already shows.
  - Metro airports nest and their labels collide (JFK/LGA/EWR, DFW/DAL, SFO/OAK/SJC).
  - The bubbles cover the line ends.

### DWU Consulting: airports only

DWU's map is proportional circles for every airport, with no routes, with Alaska and Hawaii in insets. It's close to what the front page's busiest-airports map already does.

- **The minimum dot is too big,** so hundreds of airports look the same size and read as presence rather than quantity.
- **It has no labels and no legend,** and metro clusters overlap (ORD/MDW, New York, Los Angeles).
- **Its state borders are mangled.** Southwest Missouri (Joplin, Springfield) sits in a diamond that belongs to no state. The Kansas–Missouri–Oklahoma corner is drawn about 100 km too far north, and some borders (Colorado–Kansas) are drawn twice without matching. Each state seems to keep its own copy of every shared border, and the copies have drifted apart. Square corners have become diagonals while the Mississippi keeps its wiggles, which points to a poor boundary file rather than uniform simplification. Our maps use us-atlas TopoJSON, which stores each shared border once, so they can't go wrong this way.

### Simon Patterson, *J.P.233 in C.S.O. Blue* (1992, Tate)

`source_downloads/T07120_10.jpg`. An airline route map, drawn as an in-flight magazine would, with the basemap removed and the airports renamed after people (Julius Caesar, Indira Gandhi, Cardinal Wolsey, Frans Brüggen and more). Routes leaving the edge keep "To San Juan" and "To Don Diego de Silva y Velázquez".

- **The network carries the geography by itself:** hubs show as fans of arcs, and the whole still reads roughly as the US.
- **The arcs are bowed, not great circles.** The airline-map convention separates routes that lie along the same line (A–B, A–C), and it's what an arc layer does in WebGL.
- **It's Delta, around 1991–92.** Delta's 1991 hubs by destinations served were ATL (123), DFW (81), CVG (77), SLC (67), LAX (48) and MCO (46). Those fit Julius Caesar, Frans Brüggen, Indira Gandhi, Cardinal Wolsey, Andrei Sakharov and Orlando Gibbons (Orlando being the giveaway). Measured from the Tate image, with Atlanta–Dallas as the scale, the hub distances come within about 10% of the real ones (Atlanta–Cincinnati 630 km drawn against 602 km, Atlanta–Salt Lake City 2,322 km against 2,553 km). The two big ellipses at the far right fit Delta's European flights, taken over from Pan Am in 1991 (Frankfurt was its European hub); "To Don Diego de Silva y Velázquez" fits Mexico. Not yet done: matching the small ellipses to destinations.

### Langlands & Bell, *Air Routes of the World (Day & Night)* (2001, MoMA)

`source_downloads/W1siZiIs…jpg`. A pair of screen prints, 143.8 × 84 cm each, edition of 45 ([artists' page](http://www.langlandsandbell.com/portfolio-item/air-routes-of-the-world-night-day-2002/), whose address says 2002). Neither page says what route data it was drawn from. What looks like a world airline network in hairlines: the Americas on the left, Europe a dense knot in the middle with Africa below it, Asia on the right, Australia probably bottom right. There's no basemap, and Pacific routes wrap off one side and back in on the other.

- **Every line is the same hairline weight in one colour,** with dots sized by importance. Overlaps build up tone, so density shows without any width encoding.
- **The lines are gently curved,** a lighter version of Patterson's bowed arcs.

### What to take from them

- **Layer the views:** the all-flights density as a faint background, the top 100–200 routes as crisp lines you can hover, and airport bubbles by passengers on top. That gives BTS's legibility without dropping the network.
- **Make the cut-off a setting** in the URL (minimum passengers, or top N), alongside the minimum-departures floor.
- **Optionally merge airports into BTS city markets,** as the routes-over-time page can already group destinations, to remove nested circles.
- **Reuse the front page map's insets** for Alaska, Hawaii and Puerto Rico on any flat US map.
- **Toggle between passengers and departures:** they give noticeably different maps.
- **Try a no-basemap mode** (from the artworks): routes and airports only, perhaps as a front-page poster image.
- **Offer bowed arcs** on the route map, to separate overlapping routes.
- **Try a hairline style:** every line the same thin weight, building up tone where lines overlap. It's another answer to "every flight without a mess", and plain Canvas 2D can draw it.

## The Python image building

`scripts/flightmaps/` holds standalone scripts that read `t100.db` directly with SQL (no Datasette) and write PNGs with matplotlib, numpy and scipy. They aren't project dependencies; run them with `uv run --with`:

```bash
cd scripts/flightmaps
uv run --no-project --with matplotlib --with numpy --with scipy \
  python bundled_layers.py ../../t100.db 2025 7 /tmp/flightmaps
```

Every script takes `DB YEAR MONTH OUTDIR` and takes 2–7 seconds a month.

- **`flightlib.py`:** the shared parts.
  - `load()` runs one query: `t100_domestic` for the month, grouped into unordered airport pairs with summed departures (optionally also by carrier), joined to coordinates from `airport_overrides`, then `openflights_airports`.
  - Projection: Albers equal-area conic (standard parallels 29.5° and 45.5°) framed on the lower 48. Routes are great circles sampled at 64 points, then projected.
  - Basemap: state outlines decoded from the globe page's own `static/globe/vendor/states-10m.json` (us-atlas TopoJSON).
  - `accumulate()` makes the density raster: each route is resampled at about one point per pixel, and each pixel it crosses gets its departures once.
  - The altitude model: climb to 36,000 ft over ~190 km, descend over ~210 km (about 3°), and short hops peak lower. `split_accumulate()` divides each route's departures between a low and a high layer by that altitude, and `two_tone()` blends them orange and blue.
- **`density.py`:** the plain, weighted and density maps.
- **`bundled_and_airlines.py`:** the bundled map, and the 3 × 3 airline small multiples. The bundling repeats twelve times: put the route points on a coarse grid, blur it, nudge each point toward higher density, smooth the lines. The blur narrows each pass, so bundles tighten without collapsing into one line.
- **`landing.py`:** the landing-vs-flying-over density map, plus a crop around Denver.
- **`arcs.py`** (takes `DB YEAR OUTDIR`, a whole year): bowed arcs for the busiest routes, by the million-passenger and 20-busiest-airports cut-offs, each with and without a basemap. `flightlib.nation_rings()` supplies the land fill.
- **`world_arcs.py`** (takes `DB YEAR OUTDIR`, needs `--python 3.13 --with cartopy`): international routes with 400,000+ passengers on five projection variants. `flightlib.land_polygons()` decodes the world land, and `bowed`, `separate` and `place_labels` are shared with `arcs.py`.
- **`bundled_layers.py`:** the altitude-aware bundling (two density layers, altitude-limited movement, near-airport cruise excluded from the pull), drawn with the same two-tone colouring, plus a Denver crop.
