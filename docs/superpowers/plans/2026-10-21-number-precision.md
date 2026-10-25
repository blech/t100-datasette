# Number Precision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every measured count on the site goes through one shared formatter. It rounds to three significant figures and writes words in prose ("51.5 million") and a single × 10⁶ unit in dense contexts: tables, tooltips and axes.

**Architecture:** A pure ES module, `static/common/numbers.js`, holds the rules. A Python twin, `prose_count` in `plugins/t100_globe.py`, handles the server-rendered prose. A shared JSON case file is read by both test suites, so the two can't drift apart. Each page's local `fmt`/`toLocaleString` copy and Plot's `tickFormat: '~s'` are replaced by calls into the module. A guard test stops new copies from appearing.

**Tech Stack:** Plain ES modules and Observable Plot in the browser. `node --test`. Python, Datasette plugin, pytest. Headless Playwright for the visual check.

**Spec:** `docs/superpowers/specs/2026-10-20-number-precision-design.md`

## Global Constraints

- **Three significant figures.** Round first, then choose the form, so 999,999 becomes 1.00 × 10⁶.
- **Below a million:** plain digits with thousands separators, rounded to three figures (48,210 → 48,200).
- **Prose, a million and over:** "million" below a thousand million, "billion" above. Trailing zeros are dropped: 1.2 million, 1.11 billion.
- **Dense, a million and over:** always × 10⁶, never 10⁹. Trailing zeros are kept: 1.20 × 10⁶, 1,110 × 10⁶.
- **Spacing:** the spaces on both sides of "×" are non-breaking (U+00A0).
- **Freight:** the same rules, with " tons" after; pounds are converted at 2,000 lb a ton.
- **Special values:** zero is "0"; a missing value (`null`, `undefined`, `NaN`) is "–"; negative numbers keep their sign.
- **Axes and colour legends:** if the domain's maximum is a million or more, the ticks are plain millions and the label gains " (× 10⁶)". Otherwise the ticks are plain digits.
- **Unchanged:** year, percentage and load-factor axes.
- **Exact figures:** table cells carry a `title` with the full figure and its unit.
- **Out of scope:** percentages, years, menus, the JSON API and `/about`.
- **Commits** end with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_0191mnN3iPgFXTdJ7jQemcY1
  ```
- **Branch:** work happens on `number-precision`, off `main`. Never push.

## Rulings made while planning

- **`prose_count` lives in `plugins/t100_globe.py`, not a new `plugins/t100_numbers.py`.** Datasette loads each plugins-dir file as its own top-level module, so one plugin importing another works in tests (which run from the repo root) but isn't guaranteed under `serve_public.sh`. *Cost if wrong:* one function to move later.
- **Counts of *things* stay exact:** airport pairs, routes per legend chip, destinations. They use `exactCount`. Only measured quantities (passengers, departures, seats, freight) are rounded. Rounding a count of things breaks visible sums, such as kept + dropped = total in an airline's "What changed" summary. *Cost if wrong:* a handful of call sites switch from `exactCount` to `formatCount`.
- **Screen readers get visually hidden words, not `aria-label`.** Screen readers don't reliably announce `aria-label` on a `td` or a plain `span`. Table cells hold the dense form with `aria-hidden="true"`, beside a `.visually-hidden` span with the prose form. This applies to tables only. Tooltips, status lines and map panels are plain text. *Cost if wrong:* small, and the same helper extends to them.
- **`formatCount` and `formatTons` leave `static/landing/src/table.js`.** Callers import them from `static/common/numbers.js` directly, rather than through a re-export.
- **No page summary line exists yet** for "36 families, … in 2025". That line is in another session's uncommitted work, so `rollup.js` only changes its tooltips and legend.

## Review Focus

1. **Rounding that crosses a boundary:** 999,500 and 999,999 must say "1 million" / "1.00 × 10⁶", never "1,000,000" or "1,000 thousand". 999,999,999 must say "1 billion" / "1,000 × 10⁶". (Task 1 fixture.)
2. **Wrapping at phone width:** in narrow tables and tooltips, "× 10⁶" must never wrap away from its number. (Task 1 checks the non-breaking spaces; Task 6 screenshots at 390px.)
3. **An axis just under a million** must not mix forms: the ticks are plain digits and the label has no "(× 10⁶)". (Task 1 `millionsAxis` test.)
4. **Missing or zero values in a table:** "–" or "0", never "NaN" or "– tons". (Task 1 tests.)
5. **The two implementations drifting apart:** both suites read `tests/fixtures/number_formats.json`. (Tasks 1 and 2.)

---

### Task 1: The shared formatter

**Files:**
- Create: `static/common/numbers.js`
- Create: `static/common/test/numbers.test.js`
- Create: `tests/fixtures/number_formats.json`
- Modify: `package.json` (the test script)
- Modify: `static/nav/style.css` (add `.visually-hidden`, loaded on every page)
- Modify: `static/landing/style.css` (remove its own `.visually-hidden`)

**Interfaces:**
- Produces, from `static/common/numbers.js`:
  - `formatCount(n, form = 'dense') → string`, where `form` is `'dense'` or `'prose'`;
  - `formatTons(pounds, form = 'dense') → string`;
  - `exactCount(n) → string`;
  - `countLabel(n) → string` (the prose form);
  - `millionsAxis(max, label) → { label, tickFormat }`;
  - `spokenCount(shown, spoken, doc = document) → [HTMLSpanElement, HTMLSpanElement]`;
  - `MILLIONS = ' × 10⁶'`.

- [ ] **Step 0: Branch**

```bash
git checkout -b number-precision main
```

- [ ] **Step 1: Write the shared cases**

Create `tests/fixtures/number_formats.json`:

```json
[
  { "value": 0, "prose": "0", "dense": "0" },
  { "value": 7, "prose": "7", "dense": "7" },
  { "value": 312, "prose": "312", "dense": "312" },
  { "value": 1246, "prose": "1,250", "dense": "1,250" },
  { "value": 48210, "prose": "48,200", "dense": "48,200" },
  { "value": 999499, "prose": "999,000", "dense": "999,000" },
  { "value": 999500, "prose": "1 million", "dense": "1.00 × 10⁶" },
  { "value": 999999, "prose": "1 million", "dense": "1.00 × 10⁶" },
  { "value": 1204550, "prose": "1.2 million", "dense": "1.20 × 10⁶" },
  { "value": 51512883, "prose": "51.5 million", "dense": "51.5 × 10⁶" },
  { "value": 412318004, "prose": "412 million", "dense": "412 × 10⁶" },
  { "value": 999999999, "prose": "1 billion", "dense": "1,000 × 10⁶" },
  { "value": 1106009313, "prose": "1.11 billion", "dense": "1,110 × 10⁶" },
  { "value": -1500, "prose": "-1,500", "dense": "-1,500" },
  { "value": -2345678, "prose": "-2.35 million", "dense": "-2.35 × 10⁶" }
]
```

- [ ] **Step 2: Write the failing JavaScript tests**

Create `static/common/test/numbers.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatCount, formatTons, exactCount, countLabel, millionsAxis, MILLIONS } from '../numbers.js';

const CASES = JSON.parse(readFileSync(new URL('../../../tests/fixtures/number_formats.json', import.meta.url), 'utf8'));

test('every shared case, in both forms', () => {
  for (const c of CASES) {
    assert.equal(formatCount(c.value, 'prose'), c.prose, `prose ${c.value}`);
    assert.equal(formatCount(c.value, 'dense'), c.dense, `dense ${c.value}`);
  }
});

test('dense is the default form, and countLabel is the prose form', () => {
  assert.equal(formatCount(51512883), `51.5${MILLIONS}`);
  assert.equal(countLabel(51512883), '51.5 million');
});

test('the spaces either side of × never break', () => {
  assert.ok(!/ /.test(formatCount(51512883)), 'no ordinary space in the dense form');
  assert.equal(MILLIONS, ' × 10⁶');
});

test('missing values are a dash; numeric strings are numbers', () => {
  for (const v of [null, undefined, NaN, '', 'x']) {
    assert.equal(formatCount(v), '–');
    assert.equal(formatCount(v, 'prose'), '–');
    assert.equal(exactCount(v), '–');
    assert.equal(formatTons(v), '–');
  }
  assert.equal(formatCount('48210'), '48,200');
});

test('exactCount writes the whole number with separators', () => {
  assert.equal(exactCount(1106009313), '1,106,009,313');
  assert.equal(exactCount(0), '0');
  assert.equal(exactCount(12.6), '13');
});

test('formatTons converts pounds to short tons, then rounds', () => {
  assert.equal(formatTons(0), '0 tons');
  assert.equal(formatTons(4000), '2 tons');
  assert.equal(formatTons(300), '0.15 tons');
  assert.equal(formatTons(2_100_000_000), `1.05${MILLIONS} tons`);
  assert.equal(formatTons(2_100_000_000, 'prose'), '1.05 million tons');
});

test('millionsAxis switches to millions at a maximum of a million', () => {
  const big = millionsAxis(1_106_009_313, 'Passengers');
  assert.equal(big.label, 'Passengers (× 10⁶)');
  assert.equal(big.tickFormat(0), '0');
  assert.equal(big.tickFormat(250e6), '250');
  assert.equal(big.tickFormat(1e9), '1,000');
  assert.equal(big.tickFormat(2.5e6), '2.5');
  const edge = millionsAxis(1e6, 'Seats');
  assert.equal(edge.label, 'Seats (× 10⁶)');
  const small = millionsAxis(999_999, 'Departures');
  assert.equal(small.label, 'Departures');
  assert.equal(small.tickFormat(250000), '250,000');
  assert.equal(millionsAxis(0, 'Seats').label, 'Seats');
});
```

- [ ] **Step 3: Add the folder to the test script, and run the tests to watch them fail**

In `package.json`, add `static/common/test/*.test.js` to the start of the `test` script's file list:

```json
"test": "node --test static/common/test/*.test.js static/globe/test/*.test.js static/landing/test/*.test.js static/charts/test/*.test.js static/nav/test/*.test.js static/home/test/*.test.js"
```

Run: `node --test static/common/test/numbers.test.js`
Expected: FAIL, because the module `../numbers.js` can't be found.

- [ ] **Step 4: Write the module**

Create `static/common/numbers.js`:

```js
// One way to write a measured count anywhere on the site: three significant figures, words in prose
// ("51.5 million", "1.11 billion"), and one unit, × 10⁶, wherever numbers sit side by side (tables, tooltips,
// axes) so they compare by length. The rules: docs/superpowers/specs/2026-10-20-number-precision-design.md.
// plugins/t100_globe.py prose_count() follows the same rules; tests/fixtures/number_formats.json holds both to them.

export const MILLIONS = ' × 10⁶';
const LB_PER_SHORT_TON = 2000;

const toNumber = (n) => (n === null || n === undefined || n === '' ? NaN : Number(n));
const round3 = (v) => (v === 0 ? 0 : Number(v.toPrecision(3)));
const digits = (v) => v.toLocaleString('en-US', { maximumFractionDigits: 3 });

export function formatCount(n, form = 'dense') {
  const v = toNumber(n);
  if (Number.isNaN(v)) return '–';
  const sign = v < 0 ? '-' : '';
  const r = round3(Math.abs(v)); // round first, so 999,999 is a million, not 1,000 thousand
  if (r < 1e6) return sign + digits(r);
  if (form === 'prose') {
    return r < 1e9
      ? `${sign}${Number((r / 1e6).toPrecision(3))} million`
      : `${sign}${digits(Number((r / 1e9).toPrecision(3)))} billion`;
  }
  const m = r / 1e6;
  return sign + (m < 1000 ? m.toPrecision(3) : digits(Math.round(m))) + MILLIONS;
}

export const countLabel = (n) => formatCount(n, 'prose');

export function exactCount(n) {
  const v = toNumber(n);
  return Number.isNaN(v) ? '–' : Math.round(v).toLocaleString('en-US');
}

export function formatTons(pounds, form = 'dense') {
  const v = toNumber(pounds);
  return Number.isNaN(v) ? '–' : `${formatCount(v / LB_PER_SHORT_TON, form)} tons`;
}

// a Plot axis or colour legend: plain millions with "(× 10⁶)" on the label when the domain reaches a million
export function millionsAxis(max, label) {
  if (!(max >= 1e6)) return { label, tickFormat: (v) => digits(v) };
  return { label: `${label} (× 10⁶)`, tickFormat: (v) => digits(v / 1e6) };
}

// a table cell's contents: the dense form for the eye, the prose form for a screen reader
export function spokenCount(shown, spoken, doc = document) {
  const seen = doc.createElement('span');
  seen.setAttribute('aria-hidden', 'true');
  seen.textContent = shown;
  const heard = doc.createElement('span');
  heard.className = 'visually-hidden';
  heard.textContent = spoken;
  return [seen, heard];
}
```

- [ ] **Step 5: Run the tests to watch them pass**

Run: `node --test static/common/test/numbers.test.js`
Expected: PASS, 7 tests.

- [ ] **Step 6: Move `.visually-hidden` into the shared stylesheet**

Add this line to the end of `static/nav/style.css`, and delete the identical line 25 from `static/landing/style.css`:

```css
.visually-hidden { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }
```

Run: `npm test 2>&1 | grep -E "^ℹ (pass|fail)"`
Expected: `fail 0`.

- [ ] **Step 7: Commit**

```bash
git add static/common tests/fixtures/number_formats.json package.json static/nav/style.css static/landing/style.css
git commit -m "A shared number formatter: three significant figures, words in prose, × 10⁶ in tables and charts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0191mnN3iPgFXTdJ7jQemcY1"
```

---

### Task 2: Server-rendered prose

**Files:**
- Modify: `plugins/t100_globe.py`: add `prose_count` and use it in `airport_story` (around line 83)
- Create: `tests/test_numbers.py`
- Test: `tests/test_home_stories.py` and `tests/test_home_page.py` (existing; they should still pass)

**Interfaces:**
- Consumes: `tests/fixtures/number_formats.json` (Task 1).
- Produces: `prose_count(n) -> str` in `plugins/t100_globe.py`.

- [ ] **Step 1: Write the failing test**

Create `tests/test_numbers.py`:

```python
import json
from pathlib import Path

import pytest

from plugins.t100_globe import airport_story, prose_count

CASES = json.loads((Path(__file__).parent / "fixtures" / "number_formats.json").read_text())


@pytest.mark.parametrize("case", CASES, ids=lambda c: str(c["value"]))
def test_prose_count_follows_the_shared_cases(case):
    assert prose_count(case["value"]) == case["prose"]


@pytest.mark.parametrize("value", [None, float("nan")])
def test_a_missing_count_is_a_dash(value):
    assert prose_count(value) == "–"


def test_airport_story_rounds_to_three_figures():
    rows = [{"origin": c, "origin_city_name": c, "total_passengers": n} for c, n in
            [("ATL", 123_456_789), ("DFW", 51_512_883), ("DEN", 999_999)]]
    assert [a["passengers"] for a in airport_story(rows)["airports"]] == ["123 million", "51.5 million", "1 million"]
```

Run: `uv run pytest -q tests/test_numbers.py`
Expected: FAIL with `ImportError: cannot import name 'prose_count'`.

- [ ] **Step 2: Write `prose_count` and use it**

In `plugins/t100_globe.py`, add the function directly above `def percent(`:

```python
def prose_count(n):
    """A count for a sentence, to three significant figures: 48,200 / 51.5 million / 1.11 billion.
    The same rules as static/common/numbers.js; tests/fixtures/number_formats.json holds both to them."""
    if n is None or n != n:
        return "–"
    v = float(n)
    sign = "-" if v < 0 else ""
    r = float(f"{abs(v):.3g}")  # round first, so 999,999 is a million
    if r >= 1e9:
        return f"{sign}{r / 1e9:.3g} billion"
    if r >= 1e6:
        return f"{sign}{r / 1e6:.3g} million"
    return f"{sign}{r:,.0f}" if r == int(r) else f"{sign}{r:,}"
```

In `airport_story`, replace `f"{r['total_passengers'] / 1e6:.1f} million"` with `prose_count(r["total_passengers"])`.

- [ ] **Step 3: Run the tests to watch them pass, then the whole Python suite**

Run: `uv run pytest -q tests/test_numbers.py`
Expected: PASS, 18 tests.
Run: `uv run pytest -q`
Expected: all pass. `test_home_stories.py` and `test_home_page.py` still expect "51.5 million"; their fixture values round the same way under both rules.

- [ ] **Step 4: Commit**

```bash
git add plugins/t100_globe.py tests/test_numbers.py
git commit -m "Front page prose: counts to three significant figures, by the shared rules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0191mnN3iPgFXTdJ7jQemcY1"
```

---

### Task 3: Tables

**Files:**
- Modify: `static/landing/src/table.js`: remove `formatCount`, `formatTons` and `LB_PER_SHORT_TON`
- Modify: `static/landing/test/table.test.js`: remove the three formatter tests and the two names from its import
- Modify: `static/landing/main.js`, lines 3, 14–20 and 46–49
- Modify: `static/charts/routepage.js`, lines 5, 73–79 and 101–105
- Modify: `static/charts/airline.js`: the "What changed" table (around line 98) and the summary (around line 105)

**Interfaces:**
- Consumes: `formatCount`, `formatTons`, `exactCount`, `countLabel` and `spokenCount` from `/static/common/numbers.js` (Task 1).

- [ ] **Step 1: Remove the old formatter and its tests**

In `static/landing/src/table.js`, delete these:
- `const LB_PER_SHORT_TON = 2000;`
- the `// Whole numbers with commas…` comment;
- the `formatCount` function;
- the `formatTons` line.

In `static/landing/test/table.test.js`:
- drop `formatCount, formatTons, ` from the import;
- delete the three tests that call them: the one under a million, the one over a million, and the tons one.

Run: `npm test 2>&1 | grep -E "^ℹ (pass|fail)"`
Expected: `fail 0`. Nothing imports the removed names under `node --test`; `main.js` and `routepage.js` are browser-only.

- [ ] **Step 2: The busiest-airports table**

In `static/landing/main.js`, change the import on line 3 to drop `formatCount, formatTons`, and add:

```js
import { formatCount, formatTons, exactCount, countLabel, spokenCount } from '/static/common/numbers.js';
```

Below `function cell(…)`, add:

```js
// a measured count: × 10⁶ for the eye, words for a screen reader, the exact figure on hover
function countCell(n, noun) {
  const td = cell('', 'num', `${exactCount(n)} ${noun}`);
  td.append(...spokenCount(formatCount(n), `${countLabel(n)} ${noun}`));
  return td;
}
function tonsCell(pounds) {
  const td = cell('', 'num', `${exactCount(pounds)} lb`);
  td.append(...spokenCount(formatTons(pounds), formatTons(pounds, 'prose')));
  return td;
}
```

Replace the four number cells (lines 46–49) with:

```js
      countCell(r.passengers, 'passengers'),
      countCell(r.deps, 'departures'),
      countCell(r.seats, 'seats'),
      tonsCell(r.freight),
```

- [ ] **Step 3: A route's table**

In `static/charts/routepage.js`, replace line 5 with:

```js
import { formatCount, formatTons, exactCount, countLabel, spokenCount } from '/static/common/numbers.js';
```

Add `countCell` and `tonsCell` below `function cell(…)`, exactly as in Step 2. Replace the number cells in `drawTable`:

```js
      countCell(t.deps, 'departures'),
      countCell(t.seats, 'seats'),
      countCell(t.passengers, 'passengers'),
      cell(t.loadFactor === null ? '–' : `${t.loadFactor.toFixed(1)}%`, 'num'),
      tonsCell(t.freight * 2000),
```

- [ ] **Step 4: An airline's "What changed" table and summary**

In `static/charts/airline.js`, add:

```js
import { formatCount, exactCount, countLabel, spokenCount } from '/static/common/numbers.js';
```

In `drawTable`, after the local `cell` arrow function, add:

```js
    const deps = (n) => { const td = cell('', 'num'); td.title = `${exactCount(n)} departures`; td.append(...spokenCount(formatCount(n), `${countLabel(n)} departures`)); return td; };
```

Replace `cell(fmt(r.deps_a), 'num'), cell(fmt(r.deps_b), 'num')` with `deps(r.deps_a), deps(r.deps_b)`.

In `loadChanges`, the summary counts airport pairs, which are things, so they stay exact: replace each `fmt(` with `exactCount(`. Leave the remaining `fmt` uses in this file for Task 4.

- [ ] **Step 5: Check, then commit**

Run: `npm test 2>&1 | grep -E "^ℹ (pass|fail)"` and `uv run pytest -q 2>&1 | tail -1`
Expected: `fail 0`; all pass.

Restart the scratch server on 8811 (see Task 6, Step 1). Then:

Run: `curl -s localhost:8811/static/common/numbers.js | head -3`
Expected: the module's opening comment. That confirms Datasette serves `/static/common/`.

```bash
git add static/landing static/charts/routepage.js static/charts/airline.js
git commit -m "Tables: counts to three figures in × 10⁶, words for screen readers, the exact figure on hover

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0191mnN3iPgFXTdJ7jQemcY1"
```

---

### Task 4: Charts: tooltips, axes and colour legends

**Files:**
- Modify: `static/charts/rollup.js`, lines 31, 92 and 105
- Modify: `static/charts/routes.js`, lines 62, 89–92, 99, 120 and 124, and wherever `colourScale()` is called
- Modify: `static/charts/family.js`, lines 21, 39 and 47
- Modify: `static/charts/airline.js`, line 13 and `drawSize` and `drawPairs`
- Modify: `static/charts/engines.js`, line 25
- Modify: `static/charts/routepage.js`: the y axis and tooltip in `drawChart`
- Modify: `static/home/main.js`, lines 13, 124 and 212

**Interfaces:**
- Consumes: `formatCount`, `exactCount` and `millionsAxis` (Task 1).

In each file, add `import { … } from '/static/common/numbers.js';` with just the names that file uses.

- [ ] **Step 1: The heat maps (`rollup.js`, `routes.js`)**

`rollup.js`:
- delete the `fmtValue` line and replace its use with `formatCount(c.value)`;
- the colour legend on line 105 becomes `{ type: 'sqrt', scheme: 'YlOrRd', legend: true, ...millionsAxis(Math.max(0, ...res.cells.map((c) => c.value)), HEAT_MEASURES[state.measure]) }`. `res` is in scope there.

`routes.js`:
- delete `fmtValue` and use `formatCount` on lines 62, 120 and 124;
- change `colourScale` to take the maximum: `const colourScale = (max) => (relative() ? … : { type: 'sqrt', scheme: 'YlOrRd', legend: true, ...millionsAxis(max, HEAT_MEASURES[state.measure]) });`;
- at each `colourScale()` call, pass `Math.max(0, ...res.cells.map((c) => c.value))` from that function's own `res`.

- [ ] **Step 2: The stacked bar charts (`family.js`, `airline.js` `drawSize`, `routepage.js`)**

In each, compute the tallest stack before the `Plot.plot` call:

```js
const stackMax = (points, key, value = (p) => p.value) => {
  const sums = new Map();
  for (const p of points) sums.set(p[key], (sums.get(p[key]) || 0) + value(p));
  return Math.max(0, ...sums.values());
};
```

Each file gets its own copy, because the files share no module that fits.
- **`family.js`:** the axis becomes `y: { ...millionsAxis(stackMax(res.points, 'year'), HEAT_MEASURES[state.measure]), grid: true }`, and `fmt(` becomes `formatCount(`. Delete `fmt`.
- **`airline.js` `drawSize`:** `y: { ...millionsAxis(stackMax(data, 'year'), HEAT_MEASURES[measure]), grid: true }`, and the title uses `formatCount(d.value)`.
- **`airline.js` `drawPairs`:** airport pairs are things, so the title uses `exactCount(d.pairs)`. Delete `fmt`.
- **`routepage.js`:**
  - The y axis becomes `state.measure === 'load_factor' ? { grid: true, label: MEASURES.load_factor, tickFormat: 'd', domain: [0, 100] } : { grid: true, ...millionsAxis(res.stackable ? stackMax(res.points, 'period') : Math.max(0, ...res.points.map((p) => p.value)), MEASURES[state.measure]) }`.
  - Plot's tooltip writes `y` in full digits by default, so `tip` becomes `{ format: { x: false, fill: false, stroke: false, ...(state.measure === 'load_factor' ? {} : { y: (v) => formatCount(v) }) } }`.

- [ ] **Step 3: The engine chart and the front page**

- **`engines.js`:** delete `fmt` and use `formatCount(p.amount)`.
- **`home/main.js`:**
  - delete `fmt` (line 13) and use `formatCount` in the map tooltip (line 79);
  - delete `millions` (line 124) and pass `formatCount` in its place;
  - the y axis on line 212 becomes `y: { ...millionsAxis(yMax, 'Passengers'), domain: [0, yMax], grid: true, nice: true, ticks: 6 }`.

- [ ] **Step 4: Check, then commit**

Run: `npm test 2>&1 | grep -E "^ℹ (pass|fail)"`
Expected: `fail 0`.
Run: `grep -rn "'~s'\|fmtValue\|const fmt\b\|const millions" static --include=*.js | grep -v vendor`
Expected: only `static/globe/main.js`, `static/globe/src/compare.js` and `static/charts/airlineglobe.js`, which are Task 5's.

```bash
git add static/charts static/home/main.js
git commit -m "Charts: tooltips to three figures, axes and colour legends in millions with (× 10⁶), no more 'G'

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0191mnN3iPgFXTdJ7jQemcY1"
```

---

### Task 5: Maps

**Files:**
- Modify: `static/globe/src/compare.js`, lines 1 and 27
- Modify: `static/globe/test/compare.test.js` (add one case)
- Modify: `static/globe/src/controls.js`, line 16
- Modify: `static/globe/main.js`, lines 22, 90, 108 and 129
- Modify: `static/charts/airlineglobe.js`, lines 18, 116, 137 and 152

**Interfaces:**
- Consumes: `formatCount`, `formatTons` and `exactCount` (Task 1). `compare.js` and `controls.js` are under `node --test`, so they import `'../../common/numbers.js'` relatively. `main.js` and `airlineglobe.js` use `'/static/common/numbers.js'`.

- [ ] **Step 1: Write the failing test**

In `static/globe/test/compare.test.js`, add inside `test('changeText describes a change', …)`:

```js
  assert.equal(changeText({ status: 'kept', depsThen: 12345, depsNow: 2345678 }, 2019), '12,300 → 2.35 × 10⁶ departures');
```

Run: `node --test static/globe/test/compare.test.js`
Expected: FAIL. The current output is `'12,345 → 2,345,678 departures'`.

- [ ] **Step 2: `compare.js` and `controls.js`**

`compare.js`: replace line 1 with `import { formatCount as fmt } from '../../common/numbers.js';`.

`controls.js`: the chip counts are routes, so they stay exact.
- add `import { exactCount } from '../../common/numbers.js';`;
- replace `it.count.toLocaleString('en-US')` with `exactCount(it.count)`.

Run: `node --test static/globe/test/*.test.js`
Expected: PASS.

- [ ] **Step 3: The two map pages**

In `static/globe/main.js` and `static/charts/airlineglobe.js`:
- replace the `fmt` line with `import { formatCount as fmt, formatTons } from '/static/common/numbers.js';`;
- in the detail panel, replace `['Freight (lb)', fmt(r.freight)]` with `['Freight', formatTons(r.freight)]`.

The status lines and tooltips keep calling `fmt` and now get the dense form.

- [ ] **Step 4: Check, then commit**

Run: `npm test 2>&1 | grep -E "^ℹ (pass|fail)"`
Expected: `fail 0`.

```bash
git add static/globe static/charts/airlineglobe.js
git commit -m "Maps: tooltips, panels and comparisons to three figures; route counts stay exact

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0191mnN3iPgFXTdJ7jQemcY1"
```

---

### Task 6: A guard test, and the pages in a browser

**Files:**
- Modify: `static/common/test/numbers.test.js` (add the guard)
- Create (scratchpad, not committed): `number_shots.py`

- [ ] **Step 1: Write the guard test**

Append to `static/common/test/numbers.test.js`:

```js
import { readdirSync } from 'node:fs';

test('no page formats numbers on its own', () => {
  const root = new URL('../../', import.meta.url);
  const offenders = readdirSync(root, { recursive: true })
    .filter((f) => f.endsWith('.js') && !/(^|\/)(vendor|test)\//.test(f) && f !== 'common/numbers.js')
    .filter((f) => /toLocaleString\(|tickFormat: '~s'/.test(readFileSync(new URL(f, root), 'utf8')));
  assert.deepEqual(offenders, []);
});
```

Move the `readdirSync` import up beside the existing `readFileSync` import, so the file has a single `node:fs` import line.

Run: `node --test static/common/test/numbers.test.js`
Expected: PASS. Tasks 3–5 removed every offender. To confirm the test can fail:
- temporarily add `const x = (1).toLocaleString('en-US');` to `static/home/main.js`;
- run it and see it FAIL naming `home/main.js`;
- then remove the line.

- [ ] **Step 2: Restart the scratch server and take screenshots**

```bash
pkill -f "port 8811"; (nohup uv run datasette serve t100.db --config datasette.yml --plugins-dir plugins --template-dir templates --static static:static --port 8811 >/dev/null 2>&1 &)
```

Write `number_shots.py` in the scratchpad. It should use Playwright and Chromium against `http://localhost:8811`.

Pages:
- `/`
- `/airports`
- `/aircraft`
- `/aircraft/engines`
- `/aircraft/boeing-737`
- `/airlines`
- `/airlines/delta`
- `/airports/SFO`
- `/airports/SFO/LHR/2019`
- `/airports/globe`

For each page, at widths 1280 and 390, in light mode:
- full-page screenshot, scrolling each chart into view first;
- collect the console errors;
- assert that no visible text node contains `NaN` or `undefined`;
- on `/airports`, check that the first passengers cell's `title` matches `/^[\d,]+ passengers$/` and that its visible text contains `× 10⁶`.

Run: `uv run --no-project --with playwright python number_shots.py`
Expected: no console errors and no assertion failures.

Then read the screenshots and check by eye:
- "× 10⁶" never wraps away from its number;
- y axes carry "(× 10⁶)" and aren't crowded;
- heat map legends read in millions.

If an axis is crowded at 390px, add `ticks: 5` to that axis only, and note the change in the commit message.

- [ ] **Step 3: The full suites, then commit**

Run: `npm test 2>&1 | grep -E "^ℹ (pass|fail)"` and `uv run pytest -q 2>&1 | tail -1`
Expected: `fail 0`; all pass.

```bash
git add static/common/test/numbers.test.js
git commit -m "Guard: no page formats numbers on its own

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0191mnN3iPgFXTdJ7jQemcY1"
```
