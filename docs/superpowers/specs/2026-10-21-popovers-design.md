# Popovers and chart conventions

## Purpose

Charts over time use Plot's built-in tip, which shows the one segment under the pointer. Above a stack, the pointer picks the topmost segment, often a sliver too thin to see, and it reads as the bar's total ("Passengers 964" on `/airports/ATL/JFK` in 2019 is an invisible "Other"). The front page's airline chart already does better: an HTML popover lists the whole year, in stack order, with colour keys and right-aligned numbers. The other popovers on the site (heat-map cells, heat-map row labels, map tooltips) each have their own look.

This change gives every chart over time the front page's popover, gives every other popover the same box, and fixes the conventions that led to the confusion: stack order, and the table under a route's chart. It is bucket 2 of `docs/site-coherence.md`.

## Scope

**Charts over time get the whole-year popover:**

| Chart | File | Now |
|---|---|---|
| Engine shares, `/aircraft/engines` | `static/charts/engines.js` | Plot tip, one series |
| Engine shares, front page | `static/home/main.js` | Plot tip, one series |
| Airline market, front page | `static/home/main.js` | already the HTML popover (moves onto the shared module) |
| Aircraft family, `/aircraft/{family}` | `static/charts/family.js` | Plot tip, one segment |
| An airline's size, `/airlines/{airline}` | `static/charts/airline.js` | Plot tip, one segment |
| An airline's airport pairs, `/airlines/{airline}` | `static/charts/airline.js` | Plot tip, one bar |
| A route, `/airports/{origin}/{dest}[/{year}]` | `static/charts/routepage.js` | Plot tip, one segment or dot |

**Heat-map cells keep their content but move to the shared box:** `/aircraft`, `/airlines` (`static/charts/rollup.js`) and an airport's destinations and cities (`static/charts/routes.js`, two charts).

**Same look, content unchanged:** the heat-map row labels (`routes.js`, `data-tip`), the two globe tooltips (`#tooltip` in `static/globe/style.css`) and the front page's map tooltip (`.map-tip`).

## The popover

**Look.** It's an HTML box, the front page's `.chart-tip` renamed `.popover` and moved into `static/nav/style.css`, which every page loads:
- the theme's background and text colours, a 1px `--line` border and a soft shadow;
- 12px text, no wrapping;
- a bold header line;
- then a grid of rows, each a colour key (a square for a band or bar, a short line for a line), the name, and a right-aligned number in tabular figures.

**Year mode** (charts over time):
- **Header:** the year, or the month and year in a route's month-by-month view ("March 2019").
- **Rows:** every series with a value that year, in stack order from the top down, so the rows read the same way as the bars. "Other" is the first row, because it is on top.
- **Numbers:** the shared formatter's dense form (`formatCount`, or `formatTons` for freight). Load factor is shown as a percentage to one decimal place.
- **Share charts** (the engine charts) show the share as the number ("62.4%"), then the amount in a second, muted right-aligned column ("1.21 million").
- **Unstacked charts** (load factor on a route, drawn as lines) list every line's value that year, highest first.
- **Single-series bars** (airport pairs) show just one row.
- **The pointer:** an invisible `Plot.ruleX` with `Plot.pointerX` over one record per period, which makes the whole column, including the space above the bar, point at that year. A faint vertical rule marks the year, as on the front page.
- **Placement:** beside the year: to the right if it fits inside the chart's box, otherwise to the left, and vertically level with the top of the stack, kept inside the box.

**Cell mode** (heat-map cells):
- **Header:** the row and the year ("JFK · 2019", or the family or airline name).
- **Rows:** the measure ("Passengers 430,000"), and, when the colour shows a share, the share ("Share of the year 1.2%", or "Of the year's top 38%").
- **Pointer:** `Plot.pointer` on the cell mark.
- **Placement:** beside the cell, by the same rules.
- **Links:** cells that link today (an airport's destinations go to the route for that year) keep linking.

**Other popovers** (row labels and maps) keep their text, add the `.popover` class, and drop their own box styles. The maps' tooltips stay free-floating at the pointer, because the canvas has no years to anchor to.

## Touch

On a touch screen, where an element is both pointed at and a link (a route's year bars, an airport's heat-map cells):
- The first tap shows that year's or cell's popover and doesn't follow the link.
- A second tap on the same year or cell follows the link.
- A tap on a different year or cell moves the popover there.
- A tap outside the chart hides it.

On a mouse, hover shows the popover and click follows the link, as now. The decision is a small pure function, `tapAction(showing, tapped, hasLink) → 'show' | 'follow' | 'hide'`, so it can be tested without a browser.

## Chart conventions

**Stack order matches the legend everywhere:** the biggest series at the bottom, "Other" on top.
- The route page passes `order: res.series` to its bars. That fixes "Other" moving between bottom and top from year to year, which happens today because the bars stack in alphabetical data order.
- The family, airline and engine charts already pass an order. The front page's airline chart already puts everyone else on top.

**Segments too thin to see stay charted.** They are real data, and hiding them would change the totals. In the popover they are ordinary rows.

**The table under a route's chart follows "Split by":**

| Split | Rows | Name columns |
|---|---|---|
| Carrier | one per airline | Carrier |
| Aircraft | one per aircraft | Aircraft |
| Carrier and aircraft | one per pair (as now) | Carrier, Aircraft |
| No split | one row of totals | (a single "All" cell) |

- The heading follows the split too: "Carriers in 2019", "Aircraft in 2019", "Carriers and aircraft in 2019", "Totals in 2019".
- The number columns don't change.
- Links stay where they make sense: a carrier links to its airline page, and an aircraft to its family page.
- The function becomes `aggregateTable(rows, split)` in `static/charts/src/series.js`.

## Pieces

**`static/common/popover.js`:**
- `periodRows(points, { key, order, valueOf, format, extra })` is pure. It groups points by `key` (the year, or the month) and returns `[{ period, top, rows: [{ label, value, extra? }] }]`, with the rows in the given order and the top of the stack first. `top` is the stack's total, used for placement.
- `tapAction(showing, tapped, hasLink)` is pure.
- `attachPopover(box, plot, { colourOf, kind, href })` builds the box, listens to Plot's `input` event, places the box, handles touch with `tapAction`, and hides it on `pointerleave`. It returns `[plot, popover]` to append.

**`static/home/main.js`** drops `attachYearTip`, `yearTips` and `keyOf`, and uses the module. `static/home/src/airlines.js`'s `tipRows` is folded into `periodRows`.

**CSS:** `.popover` in `static/nav/style.css`. `.chart-tip` (home), `.map-tip` (home) and `#tooltip`'s box rules (globe) are removed in its favour. Each keeps only its own positioning.

## Out of scope

- The maps' tooltip content and hit-testing.
- Heat-map design: ranking, colour scales and their place among the views (bucket 4).
- Colour palettes (bucket 5).
- Showing totals. They're not needed once the whole year is listed.

## Testing

**JavaScript (`node --test`):**
- `periodRows`:
  - grouping by year and by month;
  - row order follows the given order with the top of the stack first, and "Other" comes first;
  - series missing in a year are left out;
  - `top` is the stack's sum;
  - share charts carry the amount in `extra`.
- `tapAction`: all of its cases.
- `aggregateTable` under each of the four splits, including the single totals row and load factor per row.

**Python (pytest):** none. Nothing on the server changes.

**In a browser (headless Playwright):**
- Hovering in the empty space above a stack on `/airports/ATL/JFK` shows a popover headed "2019" with every airline as a row, "Other" first and the numbers right-aligned.
- The same on a family page, an airline page and `/aircraft/engines`, where the share and the amount are both shown.
- On a 390px touch viewport, the first tap on a route's year shows the popover without leaving the page, and a second tap opens that year.
- Heat-map cells and the map tooltips have the `.popover` class.
- The route page's table changes its rows and heading with "Split by".
- Screenshots in light and dark themes at desktop and phone widths, and no console errors.
