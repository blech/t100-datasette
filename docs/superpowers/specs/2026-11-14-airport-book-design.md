# Airport book: design

## Intent

A printed book of the 63 US airports in the 2025 top 50 by passengers or the top 50 by freight. Each airport gets one spread: its T-100 numbers on the left-hand page and its Airport Cities poster (`~/Documents (Local)/code/airportcity/posters/<CODE>.svg`) on the right. It's a personal object: one copy for the user and one or two for a friend, printed at home on US Letter paper. Many PDF drafts are expected before anything is printed, and explanatory context gets added through those drafts. So regenerating the PDF has to be one quick command, and the layout has to be easy to change.

## Goals

- One command produces the whole book as a single PDF.
- US Letter pages, laid out as a bound book: page 1 is a right-hand page, every airport's data page is a left-hand page facing its poster, and the inner margins leave room for binding.
- The numbers match what the site shows, using the same definitions and the same formatting rules.
- Easy to change between drafts: which fields appear, their order, chart sizes, intro text.

## Non-goals

- Commercial print production (bleed, CMYK, crop marks, ISBN).
- Changing the site. There are no new pages, canned queries or tables, nothing gets deployed, and the changelog isn't touched.
- Airports outside the 63, and airports outside the US. The LHR poster is ignored.

## Anti-goals

- Numbers in the book that disagree with the site's airport pages, such as different passenger totals or ranks.
- A build that needs the Datasette server or a browser running.
- Posters that are distorted, cropped or recoloured from their originals.

## Approaches considered

- **A. Python script → HTML/CSS → WeasyPrint (chosen).** The script queries `t100.db` directly, draws its own SVG charts, embeds the posters inline and renders with WeasyPrint. WeasyPrint is built for print: it supports `@page` size, `:left`/`:right` margins, page counters and page breaks. It's pure Python, so no browser is needed. The cost is that the charts are new code rather than the site's d3 charts. The user picked this one.
- **B. The same HTML, printed by headless Chrome (Playwright).** It renders exactly like a browser, but Chrome's support for left/right page margins and margin boxes is weaker, and every build launches a browser.
- **C. A print route inside the Datasette app**, reusing the site's chart JS. Rejected: it needs the server running, screen charts don't scale well to paper, and it ties a personal project to the live site's tests and deploy.

## Constraints

- `t100.db` (~2.9GB) lives in the main checkout, not the worktree. Its path is an option, defaulting to the main checkout's `t100.db`. Use only the rollup and lookup tables (`airport_dir_year`, `airport_carrier_dir_year`, `top_route_year` / `route_year_totals`, `pair_distance`, `airport_names`, `airport_market`, and `openflights_airports` / `airport_overrides` for the airport's own name, since `airport_names` holds only the BTS city name) with indexed lookups. Never scan the segment tables.
- The posters directory is an option, defaulting to `~/Documents (Local)/code/airportcity/posters`. Posters are 1200×1260 SVGs with a white background and no text. Their inline `<style>` uses `var(--ac-ink,#000)` and `var(--ac-road,#d9d9d9)`, with opacity variables. Replace these with their fallback values when reading each poster, rather than relying on WeasyPrint's SVG CSS support. Each poster's `<defs>` ids are already prefixed with the airport code (`ATL-r2`), so inlining 63 of them doesn't create id clashes. Check this holds for all 63.
- The airport list is computed from the database (2025 top 50 by passengers ∪ top 50 by freight). It should come out as the same 63 as `posters/airports.txt`. The build fails loudly if any airport lacks a poster.
- Definitions follow the site's `airport_ranks` canned query (`datasette.yml`). An airport's traffic is departing plus arriving (`passengers_out + passengers_in`, `freight_out + freight_in`), US airports only (`wac BETWEEN 1 AND 93`), ranked among US airports with any traffic. Freight is stored in pounds and shown in tons (`LB_PER_TON = 2000`, `plugins/t100_globe.py`).
- Number formatting follows the site's rules. These already exist in Python as `prose_count()` and `multiple()` in `plugins/t100_globe.py`, with test cases shared with `numbers.js` in `tests/fixtures/number_formats.json`. Reuse those functions rather than porting `numbers.js` again. Check `docs/site-coherence.md` for the precision conventions.
- The airport list was checked: the 2025 top 50 by passengers plus the top 50 by freight from `airport_dir_year` gives exactly the 63 codes in `posters/airports.txt`, and each has a plain `<CODE>.svg`. Ignore the variants (`ATL-soft.svg`, `ORD-min.svg`). Pango, which WeasyPrint needs, is installed through Homebrew.
- Home printing: most printers can't print to the paper's edge, so keep everything at least 0.25in in from it.

## The design as decided

**Tooling.** The code lives in `scripts/book/`, in this repo, on this branch. WeasyPrint goes in its own `uv` dependency group, `book` (`uv add --group book weasyprint`), not in `dev`. CI and the `Dockerfile` run `uv sync --locked`, which installs `dev`, so this keeps WeasyPrint out of the production image and off CI if the branch is ever merged. Tests that render a PDF skip when WeasyPrint can't be imported. My call: this works whether or not the branch is merged. The script runs as `uv run python -m scripts.book` or similar, with options for the database path, the posters directory, the output path and `--only ATL,MEM` for fast drafts of a few spreads. Output goes to a gitignored `book/out/airport-book.pdf`.

**Structure.** 130 pages, decided by the user:
- p1, right-hand: title page.
- p2: blank.
- p3, right-hand: contents, listing each airport with its page number.
- p4–p129: the 63 spreads, data on the left and poster on the right (Atlanta's data on p4, its poster on p5).
- p130, left-hand: sources and credits (BTS T-100, OpenStreetMap for the posters).

Explanatory text gets added during the drafts, wherever it fits. The build inserts blank pages if needed so that every data page stays on a left-hand page, and a test checks this.

**Later options the build should keep cheap:**
- The airport list comes from top-N cut-offs (`--top-passengers 50 --top-freight 50` by default). A smaller book is then one flag away. The 2025 top 20 by passengers and top 20 by freight together make 30 airports, which comes to exactly 64 pages with this front and back matter. The top 25 of each make 36 airports, 76 pages.
- Page size is a setting, Letter by default, so a half-letter zine (5.5×8.5in, with page counts divisible by 4) can be tried. Sizes are in CSS relative to the page, not hard-coded inches, wherever that's practical.

**Left-hand page: data.** At the top, a heading with the code, the locality (BTS city name) and the airport name. Below that, a table:

- passengers 1990 and 2025
- freight 1990 and 2025
- passenger rank 2025 and freight rank 2025
- top 5 destinations in 2025: code, name, and the passenger count if the airport is in the passenger top 50, the freight amount if it's in the freight top 50

Further rows to try in drafts (to be cut by eye):

- rank in 1990, next to the 2025 rank
- peak passenger year
- the 2020 low point
- number of destinations (the "How many places" definition from the airport page)
- number of airline groups
- top airlines in 2025 with their share of passengers
- the "most dedicated" airline line where it applies
- international share of passengers
- busiest international destination
- longest route by distance
- the city market, where it holds more than one airport

Missing values, such as an airport with no 1990 traffic, show as "—". Below the table are two bar charts covering 1990–2025, about 2in tall each: passengers and freight. They use the site's colours, the shared number formatting, and a year axis labelled every 5 or 10 years.

**Right-hand page: poster.** The poster is scaled to the text width (about 7.5in, so about 7.9in tall), aspect ratio unchanged, placed at the top. In the space below goes the code, set large, with the city name. That space can be revisited in drafts.

## Left to the builder

- **Order of spreads.** My call: passenger rank 2025, then the freight-only airports by freight rank.
- **Which top-5 to show** for airports in both top 50s. My call: destinations by passengers, with a freight column alongside. Freight-only airports (e.g. ANC, ILN, RFD) rank their destinations by freight.
- **Fonts.** My call: one freely available serif or sans, vendored or system, so the PDF is the same on every run. Embedding is automatic in WeasyPrint.
- **Chart drawing.** My call: hand-written SVG strings from Python, with no matplotlib. They're simple bars and stay crisp in print.
- **Tests.** `pytest` tests for the data functions, run against a small fixture database built in the test, not `t100.db`, and for the page-parity rule (data pages are left-hand pages), checked by counting pages in a generated PDF of two airports.
- **Generated PDFs.** My call: not committed. They're gitignored and regenerated on demand. The spec, plan and code are committed on this branch.
- **README.** A short section pointing at the book script.
