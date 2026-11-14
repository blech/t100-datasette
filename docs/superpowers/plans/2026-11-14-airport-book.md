# Airport Book Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One command that turns `t100.db` and the Airport Cities posters into a 130-page US Letter PDF: title, blank, contents, then 63 spreads (an airport's data on the left page, its poster on the right), then a credits page.

**Architecture:** A small package `scripts/book/`. `data.py` reads the rollup tables into plain dataclasses. `format.py`, `charts.py` and `posters.py` turn those into strings: numbers, SVG bar charts, and cleaned poster SVG. `render.py` fills a Jinja template and CSS into one HTML document, `pdf.py` renders it with WeasyPrint, and `__main__.py` is the command line. Everything except `pdf.py` is plain Python that the normal test run covers.

**Tech Stack:** Python 3.14, sqlite3, Jinja2 (already installed with Datasette), WeasyPrint (new, in its own `book` dependency group), pytest.

**Spec:** `docs/superpowers/specs/2026-11-14-airport-book-design.md`

## Global Constraints

- WeasyPrint goes in a new `uv` dependency group `book` (`uv add --group book weasyprint`), never in `dev` or `dependencies`. CI and the Dockerfile run `uv sync --locked`, which must not install it.
- Every test that imports WeasyPrint uses `pytest.importorskip("weasyprint")`, so `uv run pytest` passes without the `book` group.
- Read only rollup and lookup tables: `airport_dir_year`, `airport_carrier_dir_year`, `route_year_totals`, `pair_distance`, `airport_names`, `airport_market`, `market_name`, `openflights_airports`, `airport_overrides`. Never the `t100`, `t100_domestic` or `t100_international` segment tables.
- An airport's traffic in a year is `passengers_out + passengers_in` and `freight_out + freight_in`. Only US airports count (`wac BETWEEN 1 AND 93`). Ranks are among US airports with a total above 0, ordered by total descending then by code, as in the `airport_ranks` canned query.
- Freight is stored in pounds and shown in tons, using `LB_PER_TON = 2000` imported from `plugins.t100_globe`.
- Numbers use the site's rules. Use `prose_count` (and `ordinal`, `percent`, `short_airline_name`) from `plugins.t100_globe`; the table's dense form follows the `"dense"` values in `tests/fixtures/number_formats.json`. No ad-hoc `round`, `:.1f` or `:,` in book code apart from inside `format.py`.
- Missing values print as `—` (em dash). The site's `prose_count` returns `–` (en dash) for None; the book's helpers return `—`.
- Defaults: the database is `t100.db` in the main checkout: `Path(git rev-parse --path-format=absolute --git-common-dir).parent / "t100.db"`, which is the same file from the main checkout or any worktree. Posters default to `~/Documents (Local)/code/airportcity/posters`. Output defaults to `book/out/airport-book.pdf`. Year 2025, first year 1990, top 50 by passengers and top 50 by freight, page size `letter`.
- Page structure: p1 title (right-hand page), p2 blank, p3 contents, then for each airport a data page (always left-hand, an even page number) and its poster page (right-hand), then a credits page. With 63 airports that is 130 pages.
- Each poster is shown at its own 1200:1260 aspect ratio, never cropped or recoloured.
- Keep everything at least 0.25in in from the paper's edge.
- `book/out/` is gitignored. Generated PDFs and HTML are never committed.
- Don't touch `templates/changelog.html`, `datasette.yml`, `plugins/` or `static/`. The book only imports from `plugins/t100_globe.py`.

## Review Focus

1. **An airport with no traffic in the first year** (a code that started later, or one BTS renamed): its 1990 rows print `—`, the 1990 rank prints `—`, and its chart leaves the missing years empty without crashing. Tested in Task 1 (`test_facts_for_an_airport_with_no_first_year`) and Task 3 (`test_chart_skips_missing_years`).
2. **A freight-only airport** (in the freight top N, not the passenger top N): its top destinations are ranked by freight, not passengers. Tested in Task 1 (`test_freight_only_airport_ranks_destinations_by_freight`).
3. **A destination with no name in the lookups** (a small or foreign airport missing from OpenFlights and the overrides): the table falls back to the BTS city name, then to the code alone. It never prints `None`. Tested in Task 1 (`test_destination_without_a_name_falls_back`).
4. **A missing or malformed poster**: the build stops before rendering and names every missing code at once, not the first. A poster whose ids aren't prefixed with its code is rejected, because inlined ids would clash. Tested in Task 4.
5. **`--only` with a code that isn't in the book**: the build stops with a message naming the code, rather than building a book without it. Tested in Task 6 (`test_only_rejects_an_unknown_code`).

---

### Task 1: Reading the data

**Files:**
- Create: `scripts/__init__.py` (empty; makes `scripts.book` importable as a package)
- Create: `scripts/book/__init__.py` (empty)
- Create: `scripts/book/data.py`
- Test: `tests/test_book_data.py`

**Interfaces:**
- Consumes: the `db_path` fixture (`tests/conftest.py`). From `tests/helpers.py`: `put_airport_years(db_path, rows)`, `put_airport_carriers(db_path, rows)`, `add_airports(db_path, rows)`, `add_overrides(db_path, rows)` and `_insert(db_path, table, rows)`, for `route_year_totals`, `pair_distance`, `airport_names`, `airport_market` and `market_name` rows.
- Produces, in `scripts/book/data.py`, all plain `@dataclass`es:
  - `YearFigures(year: int, passengers: int, freight_lb: int)`
  - `Destination(code: str, label: str, passengers: int, freight_lb: int)`. `label` is the airport name, else the BTS city name, else the code.
  - `BookAirport(code: str, passenger_rank: int | None, freight_rank: int | None, in_passengers: bool, in_freight: bool)`. The ranks are the airport's actual ranks in the book year; the `in_*` flags say which top-N list put it in the book.
  - `AirportFacts(code: str, name: str, place: str, market: str | None, market_airports: list[str], first_year: int, last_year: int, passengers_first: int | None, passengers_last: int | None, freight_first_lb: int | None, freight_last_lb: int | None, passenger_rank_first: int | None, passenger_rank_last: int | None, freight_rank_first: int | None, freight_rank_last: int | None, peak_year: int | None, peak_passengers: int | None, passengers_2020: int | None, places: int, airline_groups: int, top_airlines: list[tuple[str, float]], international_share: float | None, busiest_international: Destination | None, longest_route: tuple[str, int] | None, destinations: list[Destination], destinations_by: str, series: list[YearFigures])`. `destinations_by` is `"passengers"` or `"freight"`.
  - `ranks(conn, year: int, measure: str) -> dict[str, int]`, where `measure` is `"passengers"` or `"freight"`.
  - `book_airports(conn, year: int, top_passengers: int, top_freight: int) -> list[BookAirport]`
  - `airport_facts(conn, entry: BookAirport, first_year: int, last_year: int) -> AirportFacts`

Definitions, from the spec and the site:
- The order of `book_airports`: airports in the passenger top N by passenger rank, then the freight-only ones by freight rank.
- `name`: `airport_overrides.name` if the code is there, else `openflights_airports.name` (`MIN(name)` by `iata_code`). This is the same lookup as `airport_info` in `plugins/t100_globe.py:200`. `place`: `airport_names.name`.
- `market`: `market_name.name` for the airport's `airport_market.market_id`, only when another code shares that market. `market_airports` lists the other codes, sorted. Otherwise `None` and `[]`.
- `destinations`: top 5 other airports in `last_year`, adding both directions from `route_year_totals` (rows with `origin = code`, plus rows with `dest = code` counted against their origin). Ranked by `passengers` if `entry.in_passengers`, else by `freight`, then by code.
- `places`: other airports with at least 24 flights in `last_year`, both directions added (`deps`). This is the airport page's "How many places" default.
- `airline_groups`: distinct `group_id` in `airport_carrier_dir_year` for `last_year` with any passengers or freight. `top_airlines`: the top 3 groups by passengers as `(short name, share of the airport's passengers)`. The short name is `short_airline_name(group_name)` with ` (incl. …)` removed, as `rank_sentences` does.
- `international_share`: passengers on `domestic = 0` rows divided by all passengers, from `airport_carrier_dir_year`. `None` when there are no passengers.
- `busiest_international`: the destination with the most passengers among routes where `deps > domestic_deps`, both directions.
- `longest_route`: the farthest destination among the `places` airports, as `(code, miles)` from `pair_distance` (look the pair up in either order).
- `peak_year` / `peak_passengers`: from `series`, the earliest year if tied.
- `series`: one `YearFigures` for each year from `first_year` to `last_year` that has an `airport_dir_year` row.

- [ ] **Step 1: Write the failing tests** in `tests/test_book_data.py`. They use a small fixture world built with the helpers: about six US airports over 1990, 2020 and 2025, one airport with no 1990 row, one freight-only airport, two airports sharing a market, one destination missing from every name table, and one international route. Tests:
  - `test_ranks_order_by_total_then_code`: two airports with equal 2025 passengers rank alphabetically; a non-US (`wac` 500) airport is left out.
  - `test_book_airports_union_and_order`: `book_airports(conn, 2025, 2, 2)` returns the passenger top 2 in rank order, then the freight-only airport, and `in_passengers` / `in_freight` are set correctly.
  - `test_facts_totals_and_ranks`: `passengers_first`, `passengers_last`, `freight_*_lb` and all four ranks equal the values put in.
  - `test_facts_for_an_airport_with_no_first_year`: `passengers_first`, `freight_first_lb` and `passenger_rank_first` are `None`, and `series` starts at its first year.
  - `test_destinations_add_both_directions`: a destination served 100 out and 50 in is listed with `passengers == 150`, and the list holds at most 5.
  - `test_freight_only_airport_ranks_destinations_by_freight`: `destinations_by == "freight"`, and the first destination is the one with the most freight, not the most passengers.
  - `test_destination_without_a_name_falls_back`: the label is the BTS city name when there is one, and the code when there's nothing at all.
  - `test_places_need_24_flights_both_ways`: 12 out plus 12 in counts; 23 in total doesn't.
  - `test_market_only_when_shared`: the shared-market airport gets the market's name and the other code; a lone airport gets `None`.
  - `test_top_airlines_shares_and_international_share`: shares add up as put in, the names are shortened, and `international_share` is correct.
  - `test_longest_route_either_order`: found when `pair_distance` stores the pair as `(other, code)`.
  - `test_peak_year`: the year with the most passengers.

- [ ] **Step 2: Run them and see them fail**

Run: `uv run pytest tests/test_book_data.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'scripts.book'`

- [ ] **Step 3: Implement `scripts/book/data.py`** with the dataclasses and functions above. Use one query per fact on `conn` (a `sqlite3.Connection` with `row_factory = sqlite3.Row` set by the caller, or inside the functions), and filter by `year` and `airport` / `origin` / `dest` so every lookup uses the primary keys or `idx_route_year_totals_*`.

- [ ] **Step 4: Run them and see them pass**

Run: `uv run pytest tests/test_book_data.py -q`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/__init__.py scripts/book/__init__.py scripts/book/data.py tests/test_book_data.py
git commit -m "Airport book: read each airport's figures from the rollups"
```

### Task 2: Number formatting

**Files:**
- Create: `scripts/book/format.py`
- Test: `tests/test_book_format.py`

**Interfaces:**
- Consumes: `prose_count`, `ordinal`, `percent`, `LB_PER_TON` from `plugins.t100_globe`; `tests/fixtures/number_formats.json`.
- Produces, in `scripts/book/format.py`:
  - `DASH = "—"`
  - `dense_count(n: int | float | None) -> str`: the `"dense"` column of the fixture (three significant figures, `1.20 million` with a no-break space). `DASH` for None or NaN.
  - `tons(lb: int | None) -> str`: `dense_count(lb / LB_PER_TON)` followed by `" tons"`, or `DASH`.
  - `rank(n: int | None) -> str`: `ordinal(n)` or `DASH`.
  - `share(fraction: float | None) -> str`: `percent(fraction, 1)` or `DASH`.
  - `miles(n: int | None) -> str`: `f"{n:,} miles"` (distances are exact whole miles) or `DASH`.

- [ ] **Step 1: Write the failing tests**
  - `test_dense_count_follows_the_shared_cases`: parametrised over every case in `number_formats.json`, `dense_count(case["value"]) == case["dense"]`.
  - `test_missing_values_are_an_em_dash`: `dense_count(None)`, `tons(None)`, `rank(None)`, `share(None)` and `miles(None)` all `== "—"`.
  - `test_tons`: `tons(1_356_000_000) == "678,000 tons"`, `tons(5_000_000_000) == "2.50\u00a0million tons"`.
  - `test_rank_and_share`: `rank(1) == "1st"`, `rank(22) == "22nd"`, `share(0.4567) == "45.7%"`.

- [ ] **Step 2: Run them and see them fail**

Run: `uv run pytest tests/test_book_format.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'scripts.book.format'`

- [ ] **Step 3: Implement `scripts/book/format.py`.** Copy the rule of `formatCount(n, 'dense')` in `static/common/numbers.js` exactly; the fixture is the arbiter. Check `formatTons` there too, and make `tons` follow it.

- [ ] **Step 4: Run them and see them pass**

Run: `uv run pytest tests/test_book_format.py tests/test_numbers.py -q`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/book/format.py tests/test_book_format.py
git commit -m "Airport book: number formatting from the site's shared rules"
```

### Task 3: Bar charts as SVG

**Files:**
- Create: `scripts/book/charts.py`
- Test: `tests/test_book_charts.py`

**Interfaces:**
- Consumes: `dense_count` from Task 2.
- Produces: `bar_chart(points: list[tuple[int, float | None]], *, first_year: int, last_year: int, color: str, label: str, scale: float = 1.0) -> str`. It returns one `<svg>` element with a `viewBox` and `width="100%"`, so the page's CSS sets its size: one `<rect class="bar">` per year with a value, a baseline, 3–5 y gridlines labelled with `dense_count(value / scale)`, x labels at 1990, 2000, 2010, 2020 and the last year, and the `label` as the chart's title text. `scale` is 2000 for freight, so the axis reads in tons while the data stays in pounds.
- Colours, from `static/common/palette.js` (light theme, `kind`): passengers `#e36d2a`, freight `#64748b`. Defined as `PASSENGER_COLOR` and `FREIGHT_COLOR` in `charts.py`.

- [ ] **Step 1: Write the failing tests**
  - `test_one_bar_per_year_with_a_value`: 36 points with one `None` gives 35 `class="bar"` rects.
  - `test_chart_skips_missing_years`: a series that starts in 2001 has no bar left of 2001's x position, and the x axis still runs from 1990.
  - `test_bars_are_proportional`: the bar for value 50 is half the height of the bar for 100.
  - `test_axis_labels_use_dense_count`: the y labels match `dense_count` of their tick values, and the freight chart's labels are in tons (`scale=2000`).
  - `test_all_zero_series_draws_no_bars_and_does_not_divide_by_zero`.
  - `test_output_is_well_formed_svg`: `xml.etree.ElementTree.fromstring(bar_chart(...))` parses.

- [ ] **Step 2: Run them and see them fail**

Run: `uv run pytest tests/test_book_charts.py -q`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Implement `scripts/book/charts.py`.** Build the SVG as strings, with no plotting library. Pick ticks at "nice" steps (1, 2 or 5 × 10ⁿ) so there are 3–5 of them. Escape the label with `html.escape`.

- [ ] **Step 4: Run them and see them pass**

Run: `uv run pytest tests/test_book_charts.py -q`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/book/charts.py tests/test_book_charts.py
git commit -m "Airport book: passenger and freight bar charts as SVG"
```

### Task 4: Posters

**Files:**
- Create: `scripts/book/posters.py`
- Test: `tests/test_book_posters.py`

**Interfaces:**
- Produces:
  - `class PosterError(Exception)`
  - `load_poster(directory: Path, code: str) -> str`: reads `<directory>/<code>.svg` (never the variants like `ATL-soft.svg`), replaces every `var(--name, fallback)` with its fallback, drops any `<?xml …?>` declaration and the root's `width` / `height` attributes (keeping `viewBox`), and returns the `<svg>` markup.
  - `load_posters(directory: Path, codes: list[str]) -> dict[str, str]`: raises `PosterError` naming every missing code, sorted, before loading any.

- [ ] **Step 1: Write the failing tests**, using posters written to `tmp_path`:
  - `test_css_variables_become_their_fallbacks`: `stroke:var(--ac-ink,#000);stroke-opacity:var(--ac-ink-opacity,1)` becomes `stroke:#000;stroke-opacity:1`, and no `var(` is left.
  - `test_view_box_kept_size_dropped`: the result has `viewBox="0 0 1200 1260"` and no `width=` / `height=` on the root.
  - `test_missing_posters_are_all_named`: with `ABE` present and `XXX`, `YYY` missing, `PosterError` mentions both missing codes.
  - `test_ids_must_carry_the_code`: a poster for `ABE` with `id="r2"` raises `PosterError`; with `id="ABE-r2"` it loads.
  - `test_variant_files_are_ignored`: when only `ATL-soft.svg` exists, `ATL` counts as missing.

- [ ] **Step 2: Run them and see them fail**

Run: `uv run pytest tests/test_book_posters.py -q`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Implement `scripts/book/posters.py`.** Use a regex for the `var()` replacement and the root attributes; the posters are generated files with a regular shape, so a full XML round trip isn't needed.

- [ ] **Step 4: Run them and see them pass**

Run: `uv run pytest tests/test_book_posters.py -q`
Expected: all pass.

- [ ] **Step 5: Run the loader over the real posters**

Run: `uv run python -c "from pathlib import Path; from scripts.book.posters import load_posters; import sys; d=Path.home()/'Documents (Local)/code/airportcity/posters'; codes=(d/'airports.txt').read_text().split(); print(len(load_posters(d, codes)))"`
Expected: `63`, with no `PosterError`.

- [ ] **Step 6: Commit**

```bash
git add scripts/book/posters.py tests/test_book_posters.py
git commit -m "Airport book: load the Airport Cities posters for inlining"
```

### Task 5: The book as HTML

**Files:**
- Create: `scripts/book/render.py`
- Create: `scripts/book/templates/book.html` (Jinja)
- Create: `scripts/book/templates/book.css`
- Test: `tests/test_book_render.py`

**Interfaces:**
- Consumes: `AirportFacts`, `BookAirport`, `Destination` (Task 1); `format.py` (Task 2); `bar_chart`, `PASSENGER_COLOR`, `FREIGHT_COLOR` (Task 3); posters as `dict[str, str]` (Task 4).
- Produces:
  - `PAGE_SIZES = {"letter": ("8.5in", "11in"), "half-letter": ("5.5in", "8.5in")}`
  - `TABLE_ROWS: list[tuple[str, Callable[[AirportFacts], str]]]`: the table's rows in order, as `(label, formatter)`, so a draft can cut or reorder rows by editing one list. Initial rows: Passengers {first year}, Passengers {last year}, Freight {first year}, Freight {last year}, Passenger rank {first}/{last}, Freight rank {first}/{last}, Peak passenger year, Passengers in 2020, Places served (24+ flights), Airline groups, Top airlines (each with its share), International share, Busiest international destination, Longest route, City market. A row whose formatter returns `""` is left out, so City market only appears when the market is shared.
  - `book_html(airports: list[tuple[BookAirport, AirportFacts]], posters: dict[str, str], *, page_size: str = "letter", fonts_dir: Path) -> str`

Layout (CSS, WeasyPrint's paged media):
- `@page { size: <PAGE_SIZES[page_size]>; margin: 0.5in; }` with `@page :left { margin-right: 0.75in }` and `@page :right { margin-left: 0.75in }` for the binding. All lengths inside the page are in `em` or `%`, with the root font size set from the page width (11pt on Letter, about 7.5pt on half-letter), so half-letter scales down without a second stylesheet.
- Section order and breaks:
  - `.title` (p1)
  - `.blank` (p2)
  - `.contents` with `break-before: right` (p3). Each row links `href="#data-CODE"` and shows `CODE  place  page`, the page number from `target-counter(attr(href), page)`.
  - per airport: `section.data#data-CODE` with `break-before: left`, then `section.poster#poster-CODE` with `break-before: right`
  - `.credits` with `break-before: page`
- Data page: an `h1` with the code, then the place and the name on separate lines; the table from `TABLE_ROWS`; a "Top destinations {year}" table (code, label, passengers, freight in tons; the column the list is ranked by comes first); then the passenger chart and the freight chart, each about 2in tall on Letter.
- Poster page: the poster's SVG at 100% of the text width; below it the code, set large, and the place.
- Credits page: "Passenger and freight figures: US Bureau of Transportation Statistics, T-100 segment data, {first}–{last}. Airport diagrams: Airport Cities, from OpenStreetMap data (© OpenStreetMap contributors)."
- Fonts: text in `"Helvetica Neue", Helvetica, Arial, sans-serif`; figures in B612 Mono by `unicode-range` (digits and `%`), as `static/common/fonts.css` does, loaded from `fonts_dir / "b612-mono-v16-latin-regular.woff2"` with an absolute `file://` URL.

- [ ] **Step 1: Write the failing tests** (HTML only, no WeasyPrint), building two airports' `AirportFacts` by hand:
  - `test_sections_in_book_order`: the document's section ids are, in order, `title`, `blank`, `contents`, `data-ATL`, `poster-ATL`, `data-MEM`, `poster-MEM`, `credits`.
  - `test_contents_links_every_airport`: one `href="#data-…"` per airport.
  - `test_table_rows_follow_table_rows`: the row labels appear in `TABLE_ROWS` order, and an airport with no shared market has no City market row.
  - `test_missing_first_year_shows_dash`: facts with `passengers_first=None` render `—` in that row.
  - `test_freight_ranked_destinations_put_freight_first`: for `destinations_by="freight"`, the freight column comes before the passengers column.
  - `test_poster_is_inlined_once`: the poster's markup appears once, inside `#poster-ATL`.
  - `test_half_letter_page_size`: `page_size="half-letter"` puts `size: 5.5in 8.5in` in the CSS; an unknown size raises `ValueError`.
  - `test_text_is_escaped`: an airport name containing `&` comes out as `&amp;`.

- [ ] **Step 2: Run them and see them fail**

Run: `uv run pytest tests/test_book_render.py -q`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Implement `render.py`, `book.html` and `book.css`.** Use `jinja2.Environment(loader=FileSystemLoader(templates dir), autoescape=True)`; pass the posters and charts through `markupsafe.Markup`. Inline the CSS into the document's `<style>` so the HTML file stands alone.

- [ ] **Step 4: Run them and see them pass**

Run: `uv run pytest tests/test_book_render.py -q`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/book/render.py scripts/book/templates tests/test_book_render.py
git commit -m "Airport book: lay the book out as one HTML document"
```

### Task 6: PDF and the command line

**Files:**
- Create: `scripts/book/pdf.py`
- Create: `scripts/book/__main__.py`
- Modify: `pyproject.toml` and `uv.lock` (with `uv add --group book weasyprint`)
- Modify: `.gitignore` (add `book/out/`)
- Modify: `README.md` (a short "Airport book" section: what it makes, the command, the options, that it needs `--group book` and Pango from Homebrew)
- Test: `tests/test_book_pdf.py`, `tests/test_book_cli.py`

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces:
  - `write_pdf(html: str, out: Path, base_url: Path) -> list[int]`: writes the PDF and returns the page numbers (1-based) of the data pages, found from each page's anchors starting with `data-`.
  - `main(argv: list[str] | None = None) -> int`, with these options: `--db PATH`, `--posters DIR`, `--out PATH`, `--year 2025`, `--first-year 1990`, `--top-passengers 50`, `--top-freight 50`, `--only CODES` (comma-separated; ranks and order are still worked out from the full book), `--page-size letter|half-letter`, and `--html` (write `out` with `.html` instead and skip WeasyPrint, for a fast look in a browser). It prints the page count and the output path. It opens the database read-only (`file:…?mode=ro` URI).

- [ ] **Step 1: Add the dependency and the ignore rule**

Run: `uv add --group book weasyprint && printf '\n# airport book output (scripts/book)\nbook/out/\n' >> .gitignore`
Expected: `pyproject.toml` has `book = ["weasyprint>=…"]` under `[dependency-groups]`, and `dev` is unchanged.

- [ ] **Step 2: Write the failing tests**
  - `tests/test_book_pdf.py` (starts with `weasyprint = pytest.importorskip("weasyprint")`):
    - `test_two_airports_make_eight_pages_with_data_on_even_pages`: renders two hand-built airports, with posters from `tmp_path`, into `tmp_path / "b.pdf"`. Expect `write_pdf` to return `[4, 6]`, and the PDF to have 8 pages (title, blank, contents, 2 × 2, credits).
    - `test_three_airports_still_put_data_on_even_pages`: returns `[4, 6, 8]`, 10 pages.
  - `tests/test_book_cli.py` (no WeasyPrint; uses `--html` and the `db_path` fixture with the Task 1 helpers):
    - `test_html_build_writes_a_file`: `main([... "--html", "--top-passengers", "2", "--top-freight", "2"])` returns 0 and writes the HTML with one `data-` section per book airport.
    - `test_only_rejects_an_unknown_code`: `--only ATL,ZZZ` exits non-zero, with `ZZZ` in the message, and writes nothing.
    - `test_missing_poster_stops_the_build`: returns non-zero, names the code, and writes nothing.

- [ ] **Step 3: Run them and see them fail**

Run: `uv run --group book pytest tests/test_book_pdf.py tests/test_book_cli.py -q`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 4: Implement `pdf.py` and `__main__.py`.** `write_pdf` uses `weasyprint.HTML(string=html, base_url=str(base_url)).render()`, then `document.write_pdf(out)`, then reads `page.anchors` for each page. `main` creates `out`'s parent directory. Import WeasyPrint only inside `write_pdf`, so `--html` works without the `book` group.

- [ ] **Step 5: Run them and see them pass, and check the normal run still skips the PDF tests**

Run: `uv run --group book pytest tests/test_book_pdf.py tests/test_book_cli.py -q`
Expected: all pass.
Run: `uv run --no-group book pytest -q`
Expected: everything passes, with `test_book_pdf.py` skipped.

- [ ] **Step 6: Commit**

```bash
git add scripts/book/pdf.py scripts/book/__main__.py pyproject.toml uv.lock .gitignore README.md tests/test_book_pdf.py tests/test_book_cli.py
git commit -m "Airport book: render the PDF from the command line"
```

### Task 7: The real book

**Files:**
- Modify: whatever the checks below show needs fixing, in `scripts/book/` only.

- [ ] **Step 1: A two-airport draft against the real database**

Run: `uv run --group book python -m scripts.book --only ATL,MEM --out book/out/draft.pdf`
Expected: prints 8 pages. Open it (`open book/out/draft.pdf`) and check that the table, charts and poster each fit on their page and nothing spills onto another.

- [ ] **Step 2: The numbers agree with the site.** Run the `airport_ranks` SQL from `datasette.yml` with `sqlite3` (load it with `yaml`, bind `origin` and `year=2025`) for ATL, MEM, ANC and LGA, and compare the totals and `size_rank` with the book's `passengers_last`, `freight_last_lb`, `passenger_rank_last` and `freight_rank_last`.
Expected: identical. If they differ, the book uses the site's numbers (`airport_carrier_dir_year`); change `data.ranks` to match and add a test pinning the case.

- [ ] **Step 3: The whole book**

Run: `uv run --group book python -m scripts.book`
Expected: prints `130 pages`. Every data page is even (`write_pdf`'s list is `4, 6, …, 128`). The airport list equals `posters/airports.txt` as a set.

- [ ] **Step 4: The half-letter trial**

Run: `uv run --group book python -m scripts.book --page-size half-letter --top-passengers 20 --top-freight 20 --out book/out/zine.pdf`
Expected: prints `64 pages`, and the text is still readable when opened at actual size.

- [ ] **Step 5: Both test suites**

Run: `uv run pytest -q && uv run --group book pytest tests/test_book_pdf.py -q && npm test`
Expected: all pass.

- [ ] **Step 6: Commit any fixes**

```bash
git add scripts/book tests
git commit -m "Airport book: fixes from the first full build"
```
