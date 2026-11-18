# Distances over time Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Both distances pages show any year, play through the years with the globe's year bar, compare two years, and default to shares of the year's total.

**Architecture:** The server gives each page its year range and the requested year; the axis becomes all-years with a 12-flight floor. The browser holds the rows by year (an airport's all at once, the overall page's one year at a time, cached and fetched ahead), and redraws per year with a fixed y scale over the years loaded.

**Tech Stack:** Datasette plugin (Python), Jinja, ES modules with Observable Plot, pytest, node --test.

**Spec:** `docs/superpowers/specs/2026-11-17-distances-over-time-design.md`

## Global Constraints

- Axis: longest checked distance of a pair flown at least 12 times (both directions) in some year, any year, rounded up to 250 miles (10,000 on the real data).
- Default y is share of the year's total; `?scale=count` gives counts. The y domain is fixed over the years loaded.
- Address: `?year=` (omitted for the latest), `?compare=`, `?scale=count`, with the existing `measure`, `bars`, `dir`.
- Play: 700 ms a year, stopping at the end, from the start again when at the end (as the globe).
- Numbers through `static/common/numbers.js`; "flight segments" wording; don't touch `templates/changelog.html`.

## Review Focus

- A `?year=` outside the airport's years, or not a number: falls back to the latest year the page has, no error.
- The overall page played before a year has loaded: the step waits for it rather than drawing an empty year.
- An airport with no flights in a year inside its range (a gap): "No passengers at X in Y.", and play carries on.
- Comparing a year with itself is no comparison (the handles together), as on the globe.
- Count scale on freight, and the share scale where a year's total is zero (no division by zero).

---

### Task 1: The all-years axis with the 12-flight floor

**Files:** Modify `plugins/t100_distances.py`, `plugins/t100_globe.py` (`distances_context`); Test `tests/test_distances.py`.

**Interfaces:** Produces `async axis_max(datasette) -> int` (no year), `AXIS_MIN_DEPS = 12`.

- [ ] Tests: `test_axis_max_needs_twelve_flights_in_a_year` (a 3,000-mile pair with 11 flights in each of two years doesn't count; a 1,000-mile pair with 12 does → 1000); `test_axis_max_counts_both_directions_together` (6 + 6 → counts); `test_axis_max_spans_every_year` (pairs in 2019 and 2025, the longer one in 2019 sets it); the existing ones without the year argument.
- [ ] Run, watch fail. Implement: candidates are the 200 longest checked pairs, the longest with a year of ≥ 12 flights wins; with none among them, all checked pairs. Cache key (ratio, miles).
- [ ] Run `uv run pytest tests/test_distances.py`, commit.

### Task 2: The page's year, range and controls (server)

**Files:** Modify `plugins/t100_globe.py`, `templates/airport_distances.html`, `static/charts/style.css` or a new `static/common/yearbar.css` (the globe's `#range`/`#year-label` rules moved there, linked from the three globe templates too); Test `tests/test_airport_pages.py`.

**Interfaces:** Template body gains `data-first-year`, `data-last-year`, `data-year` (the requested year, else the latest); markup `#play`, `#range` with `#range-fill`, `#year-from`, `#year`, `#year-label`, `#ds-scale`; the h2's year in `<span id="distance-year">`.

- [ ] Tests: `?year=1999` renders `data-year="1999"` and "in 1999" in the h2; `?year=1890` and `?year=x` fall back to the latest; an airport's range is its own first and last years; the overall page's is `min_year`..`max_year`; the year bar's ids are present; the globe pages still link the year bar's CSS.
- [ ] Run, watch fail. Implement: `airport_view`'s extra takes the request; a shared `distances_years(request, first, last, latest)`.
- [ ] Run `uv run pytest tests/test_airport_pages.py tests/test_navigation.py`, commit.

### Task 3: Years in the browser

**Files:** Create `static/charts/src/distanceyears.js`; Test `static/charts/test/distanceyears.test.js`; Modify `static/charts/distances.js`.

**Interfaces:** `byYear(rows) -> Map<number, rows[]>`; `barHeight(bin, measure, scale) -> number` (share: `share * 100`; count: freight in short tons, else the value); `scaleTop(profiles, measure, scale) -> number` (the tallest bar over the profiles, 0 for none); `parseYear(value, years, fallback) -> number`; `readState(search, years, latest) -> {year, compare, scale}` (compare null unless an earlier year in range); `yearSearch(state, latest) -> string` params for `year`, `compare`, `scale` only when not the default.

- [ ] Tests for each, including the Review Focus inputs (bad years, compare ≥ year, a zero-total year's profile is empty so it adds nothing to `scaleTop`).
- [ ] Run, watch fail; implement; run `npm test`.
- [ ] Page: state `{year, compare, scale}` from the address; data per year (airport: one `routes_by_year` with `year` empty; overall: `pair_distances_by_year` per year, cached promises, the next two fetched ahead while playing); year bar wired with `syncRange`, `moveHandle`, `playStep`, `bindTrackPress`; ← → and space through `mapKey` (map-type keys ignored); play a `setTimeout` chain that awaits the next year; the comparison year drawn as an outline (`Plot.rectY` with no fill, the foreground colour's stroke); the y domain `[0, scaleTop(...)]` over the years loaded; h2 year, sentence and small print per year; the scale choice.
- [ ] Check in the browser on 8818 (ATL, JFK, the overall page; play, compare, keys, both scales, dark theme); `npm test`; commit.

### Task 4: Docs and the full suites

**Files:** `README.md`, `scripts/smoke_check.sh` (`/airports/distances?year=1995`).

- [ ] README's distances entries: years, the year bar, the scale choice, the axis rule.
- [ ] `uv run pytest` and `npm test`, commit.
