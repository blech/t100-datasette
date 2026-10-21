# Number precision

## Purpose

Every page prints counts in full: "1,106,009,313 passengers in 2025". That is the exact sum of what airlines reported, but the last five or six digits are far below the noise from reporting gaps and late corrections, and long numbers are hard to compare at a glance. Each page also has its own formatter (about ten copies of the same `toLocaleString` one-liner), so the same number appears differently on different pages.

This change rounds counts to three significant figures everywhere, through one shared formatter, with "million" or "billion" in prose and a single unit, "million", everywhere else.

This is the first of three site-wide visual sub-projects: number precision, then the section navigation, then colour.

## The rules

**Three significant figures.** Round first, then choose how to write the number, so 999,999 becomes 1.00 million, not 1,000 thousand.

**Below a million**, write plain digits with thousands separators, rounded to three figures:

| Value | Shown |
|---|---|
| 7 | 7 |
| 312 | 312 |
| 1,246 | 1,250 |
| 48,210 | 48,200 |
| 999,499 | 999,000 |

**A million and over** has two forms.

**Prose** is sentences rendered on the server or in page text, such as the front page's stories and a page's summary line ("36 families, … in 2025"). It uses words: "million" below a thousand million, "billion" above. Trailing zeros are dropped.

| Value | Prose |
|---|---|
| 1,204,550 | 1.2 million |
| 51,512,883 | 51.5 million |
| 412,318,004 | 412 million |
| 1,106,009,313 | 1.11 billion |

**Dense** covers table cells, tooltips, chart labels and axes. It always uses one unit, million, never billion, so every large number in a column or tooltip compares directly by length. Trailing zeros are kept, so the digits line up. (An earlier version used × 10⁶ here; the owner chose words after seeing it in tables.)

| Value | Dense |
|---|---|
| 999,999 | 1.00 million |
| 1,204,550 | 1.20 million |
| 51,512,883 | 51.5 million |
| 412,318,004 | 412 million |
| 1,106,009,313 | 1,110 million |

- The space before "million" is non-breaking, so it never wraps onto its own line.

**Freight** follows the same rules, with " tons" after the number. Pounds are converted to short tons first, as `formatTons` does now.

**Zero, missing values and negative numbers.**
- Zero shows as "0".
- A missing value (`null`, `undefined` or `NaN`) shows as "–".
- Negative numbers keep their sign. Change values on the comparison maps are the only negative counts on the site.

## Axes and colour legends

Plot's `tickFormat: '~s'` is replaced everywhere. It currently writes billions as "G" (for example "1.1G").

- If the domain's maximum is a million or more, the ticks are plain numbers in millions and the axis or legend label gains " (millions)". For example, the label reads "Passengers (millions)" and the ticks read 0, 250, 500, 750, 1,000.
- Otherwise the ticks are plain digits with thousands separators, and the label is unchanged.
- Year axes, percentage axes (`.0%`) and load factor (`d`) are unchanged.

## Exact values

- Table cells keep a `title` attribute with the full figure and its unit ("51,512,883 passengers"), as the busiest-airports table does now. This now applies to every table: busiest airports, a route's totals and an airline's "What changed" routes.
- Prose, tooltips and axes are rounded only.
- The JSON API and Datasette's own table pages are untouched and stay exact.

## Pieces

**`static/common/numbers.js`** is a new module with:
- `formatCount(n, form)`, where `form` is `'prose'` or `'dense'`. It returns a string.
- `formatTons(pounds, form)`.
- `exactCount(n)` returns the full number with separators, for `title` attributes.
- `millionsAxis(max, label)` returns `{ tickFormat, label }` for a Plot axis or colour legend, following the rule above.
- `countLabel(n)` returns the prose form.

**`plugins/t100_numbers.py`** is a new module with `prose_count(n)`. It is used by `plugins/t100_globe.py` in place of the front page's ad hoc `f"{n / 1e6:.1f} million"`, and by any other server-rendered prose.

**`tests/fixtures/number_formats.json`** holds the shared cases: value → prose form and dense form. Both `node --test` and pytest read it, so the two implementations can't drift apart. Python only needs the prose form, but checks against the same rows.

**Call sites**, each replacing its local formatter:

| File | Uses now | Becomes |
|---|---|---|
| `static/landing/src/table.js` (`formatCount`, `formatTons`) | one decimal with M/B | re-export from `numbers.js`, dense |
| `static/landing/main.js` | table cells and titles | dense, `exactCount` titles |
| `static/charts/routepage.js` | table, tooltips, `~s` axis | dense, `millionsAxis` |
| `static/charts/routes.js` | heat map labels, `~s` legend | dense, `millionsAxis` |
| `static/charts/rollup.js` | heat map labels, `~s` legend, summary line | dense; summary line prose |
| `static/charts/family.js` | tooltips, `~s` axis | dense, `millionsAxis` |
| `static/charts/airline.js` | tooltips, `~s` axis, "What changed" table and summary | dense, `millionsAxis`, `exactCount` titles; summary prose |
| `static/charts/engines.js` | tooltips | dense |
| `static/charts/airlineglobe.js`, `static/globe/main.js`, `static/globe/src/compare.js` | map tooltips and comparison panels | dense |
| `static/globe/src/controls.js` | legend chip counts | dense |
| `static/home/main.js` | tooltips, hand-written M/bn axis | dense, `millionsAxis` |
| `plugins/t100_globe.py` | front page prose | `prose_count` |

## Out of scope

- Percentages and shares, which already round.
- Years, counts inside menus and form controls.
- `/about`'s hand-written figures.
- **Follow-up:** moving every chart's tooltip to the shared HTML tooltip now used only by the front page's airline chart (`attachYearTip`), with right-aligned numbers. Plot's built-in tooltips are SVG and can't align a column.

## Testing

**JavaScript (`node --test`):**
- every row of `number_formats.json`, in both forms;
- rounding boundaries (999,499, 999,500, 999,999 and 999,999,999);
- zero, `null`, `NaN` and negative numbers;
- `millionsAxis` above and below a million;
- `formatTons`.

**Python (pytest):**
- every row of `number_formats.json` for `prose_count`;
- the front page's prose shows "51.5 million"-style figures.

**In a browser:** headless Playwright screenshots of the front page, `/airports`, `/aircraft`, `/aircraft/engines`, a family page, `/airlines`, an airline page, an airport's route heat map, a route page and an airport map, at desktop and phone widths. Check that:
- no "million" wraps onto its own line;
- axes aren't crowded;
- table titles show the exact figure.
