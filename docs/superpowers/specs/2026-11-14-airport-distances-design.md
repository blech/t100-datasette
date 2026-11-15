# Distances: how far an airport's flight segments go

A page at `/airports/<CODE>/distances`, one of an airport's views next to Over time, Destinations, Changes and Map. It shows a
histogram of the airport's flight segments in the latest full year, by distance (x) against passengers, flight segments or
freight (y).

## Why

To get a general sense of whether an airport leans to short flights or long ones. ATL should lean short and JFK long, and in
2025 they do: about 70% of ATL's departing passengers fly under 1,000 miles, while JFK's are spread out, with humps at about
2,000–2,500 miles (transcontinental), 3,000–4,000 (Europe) and 6,500 (East Asia). Comparison is done by switching tabs or by
remembering the shapes, so every airport's chart uses **the same x-axis**, and shapes from different pages can be compared directly.

T-100 records **flight segments**: one takeoff and landing. A connecting passenger counts once on each segment, and a one-stop
flight is two segments. The page says "flight segments" throughout, never just "flights".

## Goals, non-goals, anti-goals

- Goal: one airport's distance profile for one year, readable at a glance as "short", "long" or "both".
- Goal: drop distances that are clearly wrong, and say how many were dropped.
- Non-goal: comparing airports on one chart. No second airport picker, no share-normalised overlay.
- Non-goal: city-market pages. Their query (`market_routes_by_year`) gives a passenger-weighted *average* distance per
  destination, which would blur the bins. Possible later.
- Non-goal: a year picker or changes over time. The page uses the latest full year.
- Anti-goal: an x-axis that differs from one airport to the next. That would defeat flipping between tabs.
- Anti-goal: one bad distance (LSX–SBA at 8,786 miles, `docs/visualisations.md`) stretching or spiking the chart.

## Approaches considered

- **A. Check distances once, at rebuild (chosen).** `rebuild_pair_distance` also stores each pair's great-circle distance,
  computed in Python from airport coordinates. Easy to test, computed once, and reusable (the busiest-routes map has the same
  bad-distance risk). Cost: a new column on the Fly volume before the code deploy.
- B. Check in a canned query with SQL trigonometry. No schema change, but it depends on SQLite's maths functions in the
  production build, and the coordinate lookup (duplicates, overrides) would be repeated on every request.
- C. A hand-kept list of bad pairs in `data/`. Simple, but it only catches pairs someone has already found.

The user chose A: a one-off schema change is better than manual overrides or repeated queries.

## Data

### `pair_distance.gc_distance`

A new column, `gc_distance INTEGER`: the great-circle distance in statute miles (haversine, Earth radius 3,958.8 miles, rounded),
filled by `rebuild_pair_distance`. Change it in `build_database.py`; `schema.sql` is regenerated from it.

- Coordinates come from the same source as the `airports` canned query: `airport_overrides` first, else `openflights_airports`
  by `iata_code` (ignoring `''` and `\N`). One IATA code is duplicated in openflights; take either consistently (e.g. lowest `id`).
- `NULL` when either airport has no coordinates.
- `rebuild_pair_distance` reads `airport_overrides` and `openflights_airports`, which it doesn't load (`load_airport_overrides`
  is separate). They're filled on both the local and the Fly databases. If either is empty, the rebuild should fail loudly
  rather than leave every `gc_distance` `NULL`.
- `create_schema` is `CREATE TABLE IF NOT EXISTS`, so an existing `pair_distance` won't gain the column that way. The project
  already has a mechanism for this: add `("pair_distance", "gc_distance")` to `_ADDED_COLUMNS`, and `create_schema` (called
  by `rebuild_pair_distance`) drops the outdated table and recreates it before the rebuild fills it.

### The check

A pair's distance is **suspect** when it differs from `gc_distance` by more than 10% *and* by more than 50 miles. Calibrated on
2025's 26,000 pairs:

- 10% alone flags short hops where BTS rounds differently (SJU–VQS: 39 miles against 44). The 50-mile floor keeps them.
- What it catches in 2025 is code collisions: BTS uses `CAT` and `MQJ` for small fields that openflights gives to other airports
  (CAT–MIA: 320 miles against 4,138). About 15 pairs with a few dozen passengers in all. LSX's bad pairs are from earlier years.
- Pairs without coordinates can't be checked, and are kept as BTS gives them: in 2025, 0.06% of passengers, 1.4% of segments,
  1% of freight (mostly small Alaskan and Caribbean fields).

The rule is applied at request time, not stored at rebuild, so changing the margins doesn't need a rebuild. Both the shared
maximum (Python) and the binning (JS) need it, so the margins have one source: `distance_check: {ratio: 0.1, miles: 50}` under
`plugins: t100_globe` in `datasette.yml`. The page handler reads them and passes them to the template for the JS. The rule is
written once in Python (also used to build the maximum's SQL) and once as a small function in `static/charts/src/`, and each
has tests on the same edge cases. *(My call.)*

### The query

`routes_by_year` gains `d.gc_distance`, next to `d.distance`. Its other users (globe, airports map, destinations matrix,
over-time page) ignore extra columns. The page fetches it with `min_deps=0` and filters to the latest year in the browser. No
new canned query. `min_deps=1`, which the over-time page uses, drops rows with no departures performed but some passengers or
freight. `0` keeps them, and the query's own `HAVING` still drops rows with nothing at all. *(My call.)*

*(Builder's choice:)* if fetching every year turns out too heavy for the biggest airports, add an optional `:year` parameter
to `routes_by_year`, empty meaning all years, as other queries do.

### The shared x-axis

The x-axis runs from 0 to the **longest checked distance flown by any pair in the latest year**, rounded up to a whole bin:
10,192 miles in 2025, so 0–10,250. The page handler works it out once, from `route_year_totals` (its key starts with `year`, so
it's indexed) joined to `pair_distance`. It counts **only pairs that pass the check**: unchecked pairs (no `gc_distance`)
don't count, so one bad distance on a pair without coordinates can't stretch every airport's axis. That is how the 10,192 was
calculated. The result is cached for the process and passed to the template. An unchecked pair beyond the maximum goes in the
last bin, and the small print says so if that happens.

## The page

Route `/airports/<CODE>/distances`, through `airport_view` with a new `airport_distances.html` (extending `t100_base.html`),
crumb "distances". In the airport nav it goes after Destinations: Over time, Destinations, **Distances**, Changes, Map. *(My call.)*

```
ATL · Hartsfield–Jackson Atlanta International
Over time · Destinations · [Distances] · Changes · Map

Distances of flight segments from and to ATL in 2025
Half of ATL's passengers in 2025 flew segments under 640 miles.

[Passengers ▾] [Both ways ▾]

  ▇
  █▇
  ██▃  ▂
  ███▂▃█▂            ▃▂        ▁
  ──────────────────────────────────────────
  0      2,000    4,000    6,000    8,000   10,000 miles

Distances are BTS's, checked against the airports' coordinates; 15 pairs that disagreed (40 passengers) are left out.
112 pairs couldn't be checked. Every airport's chart has the same scale, up to the longest segment flown in 2025.
```

(The sketch's figures are illustrative, apart from the 0–10,250 axis.)

- **Bins:** 250 miles wide. *(My call:* fine enough to show the regional humps, about 40 bars across the axis.)
- **Measure:** passengers, flight segments (departures performed) or freight, from `routes_by_year`'s `passengers`, `deps`,
  `freight`. Freight is only offered when the airport carries some, as the over-time page does (`offeredBy`).
- **Direction:** both ways, departing or arriving, with the same `dir` setting and menu as the airport's other pages
  (`airport_direction`, `static/common/direction.js`).
- **Y-axis:** the airport's own totals, scaled to its own maximum. Shape, not size, is what's compared.
- **Summary line:** the weighted median distance in the chosen measure ("Half of ATL's passengers in 2025 flew segments
  under 640 miles."). *(My call:* it answers "short or long" in words, for readers and for anyone without scripts.)
- **Hover popover** on a bar: its range ("1,000–1,250 miles"), the value and its share of the airport's total, using the shared
  popover (`static/common/popover.js`).
- **Small print**, one paragraph under the chart: what was left out and why, how many pairs couldn't be checked, and the shared
  scale.
- An airport with nothing in the latest year shows a line saying so (as `gone.js` does on the other pages), with no chart.
- Settings remembered and put in the URL as the over-time page does (`remember`, `replaceSearch`).

Numbers go through `static/common/numbers.js` (axis ticks, values, miles). Colours from `static/common/palette.js`: one series,
so the single default series colour. Check `docs/site-coherence.md` before adding anything new. The chart is Observable Plot
(`static/charts/vendor/plot.js`), like the other airport charts. A data link (`setDataLink`) points at the `routes_by_year` JSON.

## Deploy and docs

- **Database first.** Add `gc_distance` to `pair_distance` on the Fly volume and fill it before the code deploy (as in earlier
  changes: snapshot, load, check, restart). Nothing stops a deploy in the wrong order: the startup schema check
  (`plugins/t100_schema.py`) only logs a warning, and `scripts/smoke_check.sh` (`/-/derived` must report `"ok": true`) only
  runs after the deploy. So the volume step is a manual one, and the plan should spell it out. If the schema check knows
  `pair_distance`'s columns, add `gc_distance` to them.
- Add `/airports/ATL/distances` to `scripts/smoke_check.sh`.
- README: the page, the `pair_distance` column, the `routes_by_year` column.
- The changelog is the user's to write.

## Tests

- Python: `rebuild_pair_distance` fills `gc_distance` (known pair, e.g. LAX–SFO ≈ 337); `NULL` without coordinates; override
  coordinates win over openflights; an existing `pair_distance` without the column is rebuilt with it; the page route renders
  and the nav shows Distances; the shared maximum ignores suspect and unchecked pairs; the Python rule at its edges (the same
  cases as the JS).
- JS (`node --test`): the suspect rule at its edges (10%, 50 miles, missing `gc_distance`); binning into 250-mile bins with a
  shared maximum; the weighted median.

## Left to the builder

The plan's task order, the module layout under `static/charts/`, the bar styling, where the shared maximum's query lives in
the plugin, and whether `routes_by_year` needs a `:year` parameter.
