# Risers and fallers: airports against the median airport

A page at `/airports/movers`, linked "Risers and fallers" in the airports section's views line. It shows which US airports grew
faster or slower than the median airport between two years, and which lost what they once had.

## Why

Total traffic hides how uneven growth is. Between 1990 and 2025 the median US airport (500,000+ passengers in 1990) grew by about
1.7 times and all traffic by 1.9 times; the spread is from Austin at 4.8 times to St. Louis at 0.75 and Pittsburgh at 0.57. The
ones worth a look are the ones nobody would guess, so the page ranks by growth *relative to the median*, not by size.

## Data

Two canned queries, both reading `airport_dir_year` (one row per airport and year, so they are small for any range):

- `airport_movers` (built): per airport, passengers in the first and last year, their ratio, the median ratio of the airports
  listed, `vs_median`, and the busiest year in the range with the last year's share of it (`vs_peak`).
- `airport_movers_series`: the same airports (same `from_year`, `to_year`, `min_pax`), one row per airport and year, for the
  lines. Passengers are both directions, as elsewhere.

An airport with under 1% of its first-year passengers left (`lost`) has probably lost its service, not grown slowly. It is
flagged by the query, left out of the median, the total, the tables and the charts, and named in a note under the tables
(Detroit City, DET, is the one at the default settings: 720,000 passengers in 1990, 54 in 2025).

Pointing at an airport's line, its name, its leader or its row in either table picks it out everywhere: the other lines fade
(`.faded`), its line is drawn heavier, its name underlined, its row shaded and its row bold in the year popover. The lines
are too thin to hit, so each has an invisible wider copy to point at. Touch screens don't use it (a tap follows the link).

Passengers are segment passengers: a connecting passenger counts once on each flight, so hubs count higher than the people
who started or ended a trip there. Airports closed or recoded in the last year count as a ratio of 0.

## The page

Settings, as the URL's `from`, `to` and `min` (defaults 1990, the latest year, 500,000), all invalid values falling back to the
default: first year, last year, and minimum size (passengers in the first year): 100,000, 500,000, 1 million, 5 million.

Server-rendered, so it works without scripts and the numbers are quoted from the same queries the charts fetch:

1. An intro sentence with the median ("The median airport carried 1.73 times its 1990 passengers in 2025; all airports together,
   1.94 times").
2. Two tables of ten: **Risers** (highest `vs_median`) and **Fallers** (lowest), with airport, city, passengers then and now, the
   growth as a multiple of the first year ("×4.84"), `vs_median`, and the peak year with `vs_peak`.

With scripts, two charts above the tables (Observable Plot, as the other charts):

1. **Scatter:** x is passengers in the first year (log), y is growth against the median (log, 1 at the median line). Points are
   coloured as risers or fallers; the ten furthest from the median in either direction are labelled. A popover on each point and a
   click to the airport's page.
2. **Lines:** passengers indexed to the first year (100), for those labelled airports and for the median airport (the median of the
   airports' indices, year by year, drawn heavier). A log axis, so doubling and halving are the same height. It shows the shape the
   ratio hides: an airport that peaked and fell (STL, CVG) against one that climbed.

Colour: risers and fallers use the palette's `change.added` and `change.dropped` (green and magenta, colour-blind safe against each
other); the median is grey. No new colour convention.

Numbers go through `static/common/numbers.js` (counts) and a shared multiple formatter ("×4.84": three significant figures).

## Not in scope

Freight, flights or seats as the measure (passengers only); airports outside the US; per-airport adjustment for population or
region; a pick-your-own-airports lines chart.
