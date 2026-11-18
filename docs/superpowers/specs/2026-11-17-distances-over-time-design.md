# Distances over time

A follow-on to `2026-11-14-airport-distances-design.md`. Short design: the conversation settled most of it.

## Why

The distances pages answer "does this airport lean short or long?" for 2025. The next question is how that shape has moved
between 1990 and 2025, for an airport and for all flight segments together: regional-jet growth, long-haul growth, 2020. You compare
shapes, so the shape is the point, not the size.

## What

- Both distances pages (`/airports/<X>/distances` and `/airports/distances`) show any one year, `?year=YYYY`, defaulting to
  `max_year` as now. The h2, the median sentence and the small print follow the year.
- The globe's year bar, reused: ▶ plays through the years (700 ms a year, stopping at the end); a year slider whose hollow "compare
  with" handle draws the comparison year's shape as an outline over the bars; the year label; ← → step a year and space plays.
  The year range is the airport's own first to last year, or every year in the data for the overall page.
- **Y-axis**: share of the year's total by default, so each bar is a percentage and the shapes compare across years whatever the
  traffic. An option shows the counts, on a scale fixed across the years so growth and 2020 show (`?scale=count`). On the overall
  page the fixed scale is the busiest bar among the years loaded so far; we'll see how that behaves.
- **X-axis**: one for every page and year: the longest checked distance of any pair flown **at least 12 times in its year**, over all
  years, rounded up to a whole 250 miles (10,000 now). The 12-flight floor is the maps' own cut-off for one-off charters; without it
  a single 1998 freight charter, PHL–CVQ on a 727-100 filed as one 10,790-mile segment, set the scale. Pairs beyond the axis still
  count, in the last bar, as now.

## Data

No new rollup or schema change.

- An airport: `routes_by_year` with `year` empty, all its years in one request, as its globe loads (about 440 KB compressed for ATL
  or JFK). Hover keeps each bar's top destinations in every year.
- Overall: `pair_distances_by_year` one year at a time (26,000 pairs, 410 KB compressed, for 2025; 156 KB for 1995), cached; while
  playing, the next two years are fetched ahead. Hover keeps each bar's top pairs.
- The axis query (`plugins/t100_distances.axis_max`) moves to all years with the 12-flight floor, cached once.

## Approaches

- **Chosen: one year of pairs at a time.** Reuses the query and the hover; about 10 MB for a full overall play-through.
- A query grouped by exact distance per year (about 5,000 rows a year): lighter, but loses the hover's pairs. The fallback if the
  overall play is sluggish.
- A new rollup table: needs a Fly volume change for no gain over the grouped query.

## Not now

The domestic/international split (being thought about), city pages, months.

## Left to the builder

The control's markup and styling (share the globe's where it can), the outline's style, how the overall page shows a year still
loading, tests for the year stepping, the share scale and the axis floor.
