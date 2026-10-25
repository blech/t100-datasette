# Page Frame Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One base stylesheet, `static/common/base.css`, loaded first on every page, holds the theme fallbacks, reset, type, title scale, content column and shared table rules. The page stylesheets keep only their own rules. Titles are 32px on desktop and 26px on phones, maps included. No page scrolls sideways at 390px.

**Architecture:** Plain CSS. Rules move out of `static/landing/style.css`, `static/globe/style.css` and `static/nav/style.css` into `base.css`. Each template links `base.css` first. A node test keeps the CSS fallbacks equal to `themes.js`, and a pytest checks the link order.

**Tech Stack:** CSS, Jinja templates, pytest, `node --test`, headless Playwright.

**Spec:** `docs/superpowers/specs/2026-10-21-page-frame-design.md`

## Global Constraints

- **Values:** the token values are the spec's table, which are the current ones. The font stack is the current one: `"Helvetica Neue", "Helvetica", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`.
- **Titles:** `h1, #title` are 32px, and 26px at `max-width: 600px`.
- **Maps:** the map pages keep a 14px/1.4 base for their controls.
- **Branch:** `page-frame`, off `main`. Never push. Stage files by name; `templates/` holds untracked files that aren't ours.
- **Commits** end with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_0191mnN3iPgFXTdJ7jQemcY1
  ```

## Rulings made while planning

- **`#status` moves to `base.css`,** alongside `.note`. The spec lists it under the busiest-airports page, but `route.html` uses `#status` too and relies on the shared muted 13px style. The maps' own `#status` rule still overrides it, because `globe/style.css` loads after `base.css`. *Cost if wrong:* one rule moves back.

## Review Focus

1. **The maps after the reset moves:** `globe/style.css` no longer sets `* { box-sizing }`, `[hidden]` or the body colours itself; `base.css` must supply them before the map's rules. Check that the map still fills the window with no scrollbars, and that the chooser and panel still show and hide. (Task 3.)
2. **The cascade order,** with `base.css` first: a page rule that relied on beating a `landing/style.css` rule by coming later must still win. The likely ones are `select` on the maps (their larger padding) and `.note` inside `#legend`. (Task 3 screenshots.)
3. **Dark mode before the theme script runs:** the `@media (prefers-color-scheme: dark)` fallbacks must cover every token, including `--panel` and `--line` on the maps. (Task 1 test; Task 3 dark screenshots.)
4. **`/airports` at 390px:** after the `.scroll` fix the page is 390 wide, and the table still scrolls inside its box. (Task 3.)
5. **The airline "What changed" table in its new `.scroll` box:** its left-aligned columns and margins are unchanged. (Task 3 screenshots.)

---

### Task 0: Baseline screenshots

- [ ] **Step 1: Branch, restart the server, and take "before" shots**

```bash
git checkout -b page-frame main
pkill -f "port 8811"; (nohup uv run datasette serve t100.db --config datasette.yml --plugins-dir plugins --template-dir templates --static static:static --port 8811 >/dev/null 2>&1 &)
```

In the scratchpad, write `frame_shots.py`. It takes an output folder, and for each of the twelve pages:
- `/`, `/airports`, `/aircraft`, `/aircraft/engines`, `/aircraft/boeing-737`, `/airlines`, `/airlines/delta`, `/airports/SFO`, `/airports/SFO/LHR/2019`, `/about`, `/airports/globe`, `/airports/SFO/globe`;
- in light and dark, at 1280×900;
- it saves a viewport screenshot named after the page, with capitals kept (`re.sub(r"[^A-Za-z0-9]+", "_", …)`).

Run it into `before/`.

Expected: 24 files.

---

### Task 1: `base.css`, held to the theme

**Files:**
- Create: `static/common/base.css`
- Create: `static/common/test/base.test.js`

**Interfaces:**
- Produces: `/static/common/base.css`, with the rules in Step 2.

- [ ] **Step 1: Write the failing test**

Create `static/common/test/base.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { THEMES } from '../../globe/src/themes.js';

const css = readFileSync(new URL('../base.css', import.meta.url), 'utf8');
const tokens = (block) => Object.fromEntries([...block.matchAll(/--([a-z]+)\s*:\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()]));
const light = tokens(css.match(/^:root\s*\{([^}]*)\}/m)[1]);
const dark = tokens(css.match(/prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([^}]*)\}/)[1]);
const norm = (v) => v.replace(/\s+/g, '').replace(/0\./g, '.').toLowerCase();

test('the CSS fallbacks are the theme script\'s colours', () => {
  for (const [name, values] of [['light', light], ['dark', dark]]) {
    const t = THEMES[name];
    assert.equal(values.bg, t.bg, `${name} --bg`);
    assert.equal(values.fg, t.ui.fg, `${name} --fg`);
    assert.equal(values.muted, t.ui.muted, `${name} --muted`);
    assert.equal(norm(values.panel), norm(t.ui.panel), `${name} --panel`);
    assert.equal(values.accent, t.ui.accent, `${name} --accent`);
  }
});

test('both themes define every token', () => {
  const all = ['bg', 'fg', 'muted', 'line', 'rule', 'panel', 'accent'];
  assert.deepEqual(Object.keys(light).sort(), [...all].sort());
  assert.deepEqual(Object.keys(dark).sort(), [...all].sort());
});
```

Run: `node --test static/common/test/base.test.js`
Expected: FAIL, because `base.css` doesn't exist.

- [ ] **Step 2: Write `base.css`**

```css
/* What every page shares, the scrolling pages and the maps alike; each page's own stylesheet comes after.
   The colours are fallbacks for before static/nav/main.js paints the chosen theme from static/globe/src/themes.js,
   and a test keeps them equal (static/common/test/base.test.js). */
:root { --bg:#ffffff; --fg:#09090b; --muted:#71717a; --line:#d4d4d4; --rule:#8c8c8d; --panel:rgba(255,255,255,.85); --accent:#e36d2a; }
@media (prefers-color-scheme: dark) { :root { --bg:#09090b; --fg:#fafafa; --muted:#a1a1aa; --line:#343435; --rule:#767677; --panel:rgba(9,9,11,.8); --accent:#ec863f; } }

* { box-sizing:border-box; }
[hidden] { display:none !important; }
body { margin:0; background:var(--bg); color:var(--fg); font:15px/1.5 "Helvetica Neue", "Helvetica", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
a { color:var(--fg); }

/* one title scale for every page, the maps' title included */
h1, #title { font-size:32px; font-weight:600; letter-spacing:-.01em; }
h1 { margin:0 0 8px; }
h2 { font-size:18px; margin:0; }
@media (max-width:600px) { h1, #title { font-size:26px; } }

main { max-width:960px; margin:0 auto; padding:max(24px, env(safe-area-inset-top)) 16px 48px; }
.intro { color:var(--muted); max-width:42em; }
.note, #status { color:var(--muted); font-size:13px; }
select { font:inherit; color:var(--fg); background:transparent; border:1px solid var(--muted); border-radius:8px; padding:3px 8px; }

/* a table that scrolls sideways in its own box; positioned, so hidden text inside it can't widen the page */
.scroll { overflow-x:auto; position:relative; }
table { width:100%; border-collapse:collapse; font-variant-numeric:tabular-nums; }
th, td { padding:8px 10px; border-bottom:1px solid var(--line); text-align:left; white-space:nowrap; }
th.num, td.num { text-align:right; }
th { color:var(--muted); font-weight:500; }

.visually-hidden { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }
```

Run: `node --test static/common/test/base.test.js`
Expected: PASS, 2 tests.

Add `static/common/test/*.test.js` to the npm test script if it's missing. It shouldn't be.

- [ ] **Step 3: Commit**

```bash
git add static/common/base.css static/common/test/base.test.js
git commit -m "A base stylesheet for every page: theme fallbacks (held to themes.js), type, one title scale, the column, tables

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0191mnN3iPgFXTdJ7jQemcY1"
```

---

### Task 2: Every page on it; the page stylesheets trimmed

**Files:**
- Modify: the eleven templates: `home`, `airports`, `rollup`, `engines`, `family`, `airline`, `routes`, `route`, `about`, `globe` and `airline_globe`
- Modify: `static/landing/style.css`, `static/home/style.css`, `static/globe/style.css`, `static/nav/style.css`, `static/charts/style.css`
- Create: `tests/test_page_frame.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_page_frame.py`:

```python
import re

import pytest

TEMPLATES = ["home", "airports", "rollup", "engines", "family", "airline", "routes", "route", "about", "globe", "airline_globe"]


def stylesheets(name):
    html = open(f"templates/{name}.html").read()
    return re.findall(r'<link rel="stylesheet" href="([^"]+)"', html)


@pytest.mark.parametrize("name", TEMPLATES)
def test_every_page_loads_the_base_stylesheet_first(name):
    assert stylesheets(name)[0] == "/static/common/base.css"


@pytest.mark.parametrize("name", TEMPLATES)
def test_only_the_airports_table_loads_its_own_stylesheet(name):
    assert ("/static/landing/style.css" in stylesheets(name)) == (name == "airports")


def test_the_airline_change_table_scrolls_in_its_own_box():
    html = open("templates/airline.html").read()
    assert re.search(r'<div class="scroll">\s*<table id="change-table">', html)
```

Run: `uv run pytest -q tests/test_page_frame.py`
Expected: FAIL. No template loads `base.css` yet, and ten load `landing/style.css`.

- [ ] **Step 2: Templates**

In every template, add `<link rel="stylesheet" href="/static/common/base.css">` as the first stylesheet link.

In every template except `airports.html`, delete the `<link … href="/static/landing/style.css">` line.

In `templates/airline.html`, wrap the table in a scrolling box:
- replace `<table id="change-table">` with `<div class="scroll">` and `<table id="change-table">` on the next line;
- add `</div>` after its `</table>`.

- [ ] **Step 3: Trim the page stylesheets**

**`static/landing/style.css`** becomes just this:

```css
/* the busiest-airports table: sortable headers, the airport and city columns, the controls above */
.bar { display:flex; justify-content:space-between; align-items:center; gap:12px; margin:24px 0 8px; }
th button { font:inherit; color:inherit; background:none; border:0; padding:0; cursor:pointer; }
th button:hover { color:var(--fg); }
th[aria-sort] { color:var(--fg); font-weight:600; }
th[aria-sort] button::after { content:" ▾"; }
td.code a { font-weight:600; }
td.city { white-space:normal; }
```

**`static/home/style.css`:** add the front page's section rule, which comes from `landing/style.css`:

```css
/* a 1px rule above each section, its heading directly beneath (the husk.org/labs pattern) */
.section { border-top:1px solid var(--rule); margin:36px 0 0; padding:4px 0 0; }
.section > h2 { margin:0 0 8px; }
```

**`static/globe/style.css`:**
- delete the `:root` line, the dark `@media` fallback line and its comment, and the `* { box-sizing… }` and `[hidden] { … }` lines;
- replace the `html, body { … }` rule with `html, body { height:100%; overflow:hidden; font-size:14px; line-height:1.4; }`;
- `#title { font-size:28px; font-weight:600; letter-spacing:-.01em; }` becomes nothing, so delete it;
- in the `@media (max-width:520px)` line, remove `#title { font-size:22px; } ` and keep the `#panel` rule.

**`static/nav/style.css`:** delete the `.visually-hidden { … }` line.

**`static/charts/style.css`:**
- `var(--muted, #777)` becomes `var(--muted)`;
- `var(--bg, #fff)` becomes `var(--bg)`, in both places.

- [ ] **Step 4: Run the tests**

Run: `uv run pytest -q` and `npm test 2>&1 | grep -E "^ℹ (pass|fail)"`
Expected: all pass; `fail 0`. If an older test asserts on the removed `landing/style.css` link on a page, update it to `base.css`.

- [ ] **Step 5: Commit**

```bash
git add templates/home.html templates/airports.html templates/rollup.html templates/engines.html templates/family.html templates/airline.html templates/routes.html templates/route.html templates/about.html templates/globe.html templates/airline_globe.html static/landing/style.css static/home/style.css static/globe/style.css static/nav/style.css static/charts/style.css tests/test_page_frame.py
git commit -m "Every page on the base stylesheet; page stylesheets keep only their own rules; an airline's changes table scrolls in its box

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0191mnN3iPgFXTdJ7jQemcY1"
```

---

### Task 3: In a browser

- [ ] **Step 1: Restart, then measure**

Restart the scratch server. In `frame_check.py` (Playwright), check:
1. **At 390×844,** on the twelve pages from Task 0, print `document.documentElement.scrollWidth`. Expected: 390 for each.
2. **The title's computed `font-size`** (`h1`, or `#title` on the map) on `/aircraft/boeing-737` and `/airports/SFO/globe`, at 1280 and at 390. Expected: `32px` and `26px`.
3. **On `/airports` at 390,** the `.scroll` box's `scrollWidth` is greater than its `clientWidth`. Expected: true; the table still scrolls inside its box.
4. **Page errors.** Expected: none.

- [ ] **Step 2: After screenshots**

Run `frame_shots.py` into `after/`. Compare each pair by eye. Only these should differ:
- the map titles, which are larger;
- the airline page's table, now in a box, which looks the same at 1280.

Look closely at:
- the maps' controls (padding on `select` and `button`), legend note, chooser and panel;
- dark-mode backgrounds;
- the front page's section rules.

Fix any regression in the page stylesheet it belongs to, and record a ruling.

- [ ] **Step 3: The full suites, and a commit if anything changed**

Run: `uv run pytest -q` and `npm test 2>&1 | grep -E "^ℹ (pass|fail)"`
Expected: all pass; `fail 0`.

If Step 2 led to fixes, commit them by name:

```bash
git commit -m "Page frame: fixes from the before-and-after screenshots

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0191mnN3iPgFXTdJ7jQemcY1" <files>
```
