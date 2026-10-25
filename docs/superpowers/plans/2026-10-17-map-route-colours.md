# Map Route Colours Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the airport map (`/airports/<IATA>/globe`) and the airline map (`/airlines/<id>/globe`) one shared way to colour, show/hide and fade routes. Both maps can colour by domestic/international or by kept/added/dropped, either dimension can be hidden from the legend, and opacity scales with how many routes are on screen. The airport map gains the airline map's two-handle year comparison.

**Architecture:** Two new pure modules in `static/globe/src/` hold the logic both pages share. `compare.js` sets one year's routes against another and moves the year-range handles. `routestyle.js` handles URL style state, the hide filter, colours, opacity and legend data. A thin DOM helper, `controls.js`, draws the legend chips and positions the range handles. The renderer takes a per-route style array instead of choosing colours itself. Each page's `main` module only wires these together.

**Tech Stack:** Plain ES modules (no build step), canvas 2D through vendored d3-geo, `node --test` (Node 24) for JS, pytest + Datasette 1.0a41 for page templates.

**Spec:** No separate spec file. The design was agreed in conversation on 2026-10-17 and is restated under **Design** below. Executors should treat that section as the spec.

## Design

- **Two dimensions on every route:** `service` (`domestic` | `international`, always present) and `status` (`kept` | `added` | `dropped`, present only when two years are being compared; otherwise `null`).
- **Colour by one dimension at a time.** URL `?colour=service|change`.
  - Not comparing: always `service` (the `change` option is disabled).
  - Comparing: `colour` from the URL, defaulting to `change` (today's airline behaviour).
- **Palette:** international `#ff5a00`, domestic `#2a9df4` (unchanged); added `#4dac26`, dropped `#c51b7d`; **kept is neutral**, drawn in the theme's muted UI colour (`theme.ui.muted` on the canvas, `var(--muted)` in the legend). No colour means two different things any more.
- **Dropped routes are always dashed** whenever a comparison is on, whichever dimension is coloured, so "dropped" never depends on colour alone.
- **Show/hide through legend chips**, for both dimensions. URL `?hide=` takes a comma list from `domestic,international,added,kept,dropped`, written in that canonical order. Status entries only take effect while comparing.
- **Opacity:** `alphaFor(n, value, max)`. The base alpha falls as `sqrt(30 / n)` between 0.85 and 0.12, and bigger routes get up to 1.5× the base. The highlighted route is drawn at alpha 1 and the others dim to 60% while something is highlighted.
- **Airport map comparison:** the same two-handle slider as the airline map (solid handle = year shown, hollow = year compared with). The comparison is client-side from the `routes_by_year` rows the page already loads, and its threshold is the query's existing ≥ 12 departures. Comparison and month view are exclusive: turning months on clears the comparison, and moving the hollow handle back turns months off.
- **Back-compatibility:** `?service=domestic` (from old links and from the nav, which carries `service` between pages) still works and means `hide=international`. The nav learns to read `hide` back into `service` when leaving a map page.

## Global Constraints

- Work on a new branch `map-route-colours` from local `main`. (Local `main` has one unpushed commit, `e85fc1b`. Leave it there and don't push.)
- No build step, no new dependencies, no CDN: plain ES modules imported by absolute `/static/...` paths in page modules and by relative paths inside `static/globe/src/`.
- Existing colours stay: international `#ff5a00`, domestic `#2a9df4` (`SERVICE_COLOURS` in `static/globe/src/scale.js`).
- New colours: `CHANGE_COLOURS = { added: '#4dac26', dropped: '#c51b7d' }`. Kept uses the theme's muted colour.
- URL keys: `year`, `compare`, `month`, `proj`, `width`, `colour`, `hide`, `theme` (+ airline page's `min`). Defaults are omitted from the URL.
- JS tests: `npm test`. Python tests: `uv run pytest -q`. Both must pass at the end of every task.
- Code style: match the surrounding code. That means terse one-line comments saying *why*, `const $ = (id) => document.getElementById(id)`, two-space indent, single quotes, and no frameworks.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

Each line below has a test in the named task.

1. **Every route hidden** (both services hidden, or a status filter that matches everything) → no routes drawn, no crash in hit-testing, and the status line says the legend is hiding them rather than "No flights" (`visibleRoutes` test in Task 1; status text in Task 4 and Task 5, checked by hand in Task 7).
2. **Old links with `?service=domestic`** and the nav carrying `service` → still show only domestic routes, now expressed as `hide=international`. Junk `hide` values are ignored (Task 1, Task 5, Task 6).
3. **`compare` in the URL that is invalid for this airport** (not a year with data, ≥ `year`, or combined with `month`) → dropped silently, page shows a single year (`parseState` test and page validation in Task 5).
4. **One handle dragged past the other** → carries it along, never `compare >= year` (`moveHandle` tests in Task 2).
5. **Opacity at the extremes** (1 route, 5,000 routes, zero or missing width value, `max` 0) → alpha always a finite number in [0.08, 0.9] (`alphaFor` tests in Task 1).

## File Structure

| Path | Responsibility |
|---|---|
| `static/globe/src/routestyle.js` (new) | Style state in the URL, colour mode, hide filter, colours, opacity, legend data. Pure. |
| `static/globe/src/compare.js` (new) | Year-against-year route comparison, status counts, change text, range-handle and play-step logic. Pure. |
| `static/globe/src/controls.js` (new) | DOM: legend chips and range-handle positioning, shared by both pages. |
| `static/globe/src/renderer.js` | Draws routes from a per-route style array (colour, alpha, dash). |
| `static/globe/src/state.js` | Airport page URL state, now with `compare`, `colour`, `hide` (no `service`). |
| `static/globe/main.js` | Airport page wiring: comparison, legend, styles. |
| `static/globe/style.css` | Gains the two-handle range CSS (moved from `airlineglobe.css`) and legend chip CSS. |
| `templates/globe.html` | Airport page: two-handle range, colour select, legend chip container; service select removed. |
| `static/charts/src/airline.js` | `mapRoutes` uses `compareYears`; `STATUS_COLOURS` and the `colour` field go. |
| `static/charts/airlineglobe.js` | Airline page wiring: legend, hide, colour select, styles. |
| `static/charts/airlineglobe.css` | Loses the range CSS (now shared). |
| `templates/airline_globe.html` | Airline page: colour select, legend chip container. |
| `static/nav/src/state.js` | Reads `hide` back into `service` when carrying settings off a map page. |

---

### Task 1: Shared route styling module

**Files:**
- Create: `static/globe/src/routestyle.js`
- Test: `static/globe/test/routestyle.test.js`

**Interfaces:**
- Consumes: `SERVICE_COLOURS`, `colourFor`, `maxOf` from `static/globe/src/scale.js` (existing).
- Produces:
  - `CHANGE_COLOURS: { added: string, dropped: string }`
  - `SERVICES: ['domestic', 'international']`, `STATUSES: ['added', 'kept', 'dropped']`
  - `parseStyle(search: string) → { colour: 'service'|'change'|null, hide: string[] }`
  - `styleParams({ colour, hide }) → { colour?: string, hide?: string }` (for building a query string)
  - `colourMode(colour, comparing: boolean) → 'service'|'change'`
  - `toggleHide(hide: string[], key: string) → string[]` (canonical order)
  - `visibleRoutes(routes, hide: string[], comparing: boolean) → routes[]`
  - `alphaFor(n: number, value, max: number) → number` in [0.08, 0.9]
  - `styleRoutes(routes, { mode, theme, widthKey }) → { colour: string, alpha: number, dashed: boolean }[]` (parallel to `routes`)
  - `legendItems({ mode, comparing, hide, routes }) → { name: 'service'|'change', items: { key, label, count, colour: string|null, dashed: boolean, hidden: boolean }[] }[]`

- [ ] **Step 1: Write the failing tests**

Create `static/globe/test/routestyle.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHANGE_COLOURS, parseStyle, styleParams, colourMode, toggleHide, visibleRoutes, alphaFor, styleRoutes, legendItems,
} from '../src/routestyle.js';
import { SERVICE_COLOURS } from '../src/scale.js';

test('parseStyle defaults to no colour choice and nothing hidden', () => {
  assert.deepEqual(parseStyle(''), { colour: null, hide: [] });
  assert.deepEqual(parseStyle('?colour=change&hide=dropped,domestic'), { colour: 'change', hide: ['domestic', 'dropped'] });
});

test('parseStyle ignores junk and repeats, and keeps a canonical order', () => {
  assert.deepEqual(parseStyle('?colour=rainbow&hide=dropped,,nope,dropped,international,__proto__'), { colour: null, hide: ['international', 'dropped'] });
});

test('the old ?service= means hiding the other service', () => {
  assert.deepEqual(parseStyle('?service=domestic').hide, ['international']);
  assert.deepEqual(parseStyle('?service=international&hide=kept').hide, ['domestic', 'kept']);
  assert.deepEqual(parseStyle('?service=all').hide, []);
});

test('styleParams leaves out defaults and round-trips', () => {
  assert.deepEqual(styleParams({ colour: null, hide: [] }), {});
  const p = styleParams({ colour: 'service', hide: ['domestic', 'dropped'] });
  assert.deepEqual(p, { colour: 'service', hide: 'domestic,dropped' });
  assert.deepEqual(parseStyle(`?${new URLSearchParams(p)}`), { colour: 'service', hide: ['domestic', 'dropped'] });
});

test('colourMode is service unless comparing, and change by default when comparing', () => {
  assert.equal(colourMode(null, false), 'service');
  assert.equal(colourMode('change', false), 'service');
  assert.equal(colourMode(null, true), 'change');
  assert.equal(colourMode('service', true), 'service');
});

test('toggleHide adds and removes, in canonical order', () => {
  assert.deepEqual(toggleHide([], 'dropped'), ['dropped']);
  assert.deepEqual(toggleHide(['dropped'], 'domestic'), ['domestic', 'dropped']);
  assert.deepEqual(toggleHide(['domestic', 'dropped'], 'domestic'), ['dropped']);
});

const route = (service, status, passengers = 100) => ({ service, status, passengers });

test('visibleRoutes hides by service always and by status only when comparing', () => {
  const routes = [route('domestic', 'kept'), route('international', 'dropped'), route('domestic', 'added')];
  assert.equal(visibleRoutes(routes, ['domestic'], true).length, 1);
  assert.equal(visibleRoutes(routes, ['dropped'], true).length, 2);
  assert.equal(visibleRoutes(routes, ['dropped'], false).length, 3);
  assert.deepEqual(visibleRoutes(routes, ['domestic', 'international'], true), []);
  assert.deepEqual(visibleRoutes([], ['kept'], true), []);
});

test('alphaFor falls as more routes are shown and rises with a route\'s size', () => {
  assert.ok(alphaFor(1000, 10, 100) < alphaFor(10, 10, 100));
  assert.ok(alphaFor(500, 100, 100) > alphaFor(500, 1, 100));
});

test('alphaFor stays a finite number between 0.08 and 0.9 at the extremes', () => {
  for (const n of [0, 1, 30, 5000, 1e6]) {
    for (const [v, max] of [[0, 0], [undefined, 100], [NaN, 100], [-5, 100], [100, 100], [1e9, 100], [50, 0]]) {
      const a = alphaFor(n, v, max);
      assert.ok(Number.isFinite(a) && a >= 0.08 && a <= 0.9, `n=${n} v=${v} max=${max} -> ${a}`);
    }
  }
});

const theme = { ui: { muted: '#777777' } };

test('styleRoutes colours by service or by change, kept in the theme\'s muted colour', () => {
  const routes = [route('domestic', 'kept'), route('international', 'added'), route('domestic', 'dropped')];
  const byService = styleRoutes(routes, { mode: 'service', theme, widthKey: 'passengers' });
  assert.deepEqual(byService.map((s) => s.colour), [SERVICE_COLOURS.domestic, SERVICE_COLOURS.international, SERVICE_COLOURS.domestic]);
  const byChange = styleRoutes(routes, { mode: 'change', theme, widthKey: 'passengers' });
  assert.deepEqual(byChange.map((s) => s.colour), ['#777777', CHANGE_COLOURS.added, CHANGE_COLOURS.dropped]);
});

test('dropped routes are dashed whichever dimension is coloured', () => {
  const routes = [route('domestic', 'kept'), route('domestic', 'dropped'), route('domestic', null)];
  for (const mode of ['service', 'change']) {
    assert.deepEqual(styleRoutes(routes, { mode, theme, widthKey: 'passengers' }).map((s) => s.dashed), [false, true, false]);
  }
});

test('legendItems lists services always and changes only when comparing, with counts before hiding', () => {
  const routes = [route('domestic', 'kept'), route('domestic', 'added'), route('international', 'dropped')];
  const single = legendItems({ mode: 'service', comparing: false, hide: [], routes });
  assert.deepEqual(single.map((g) => g.name), ['service']);
  assert.deepEqual(single[0].items.map((i) => [i.key, i.count, i.colour]), [['international', 1, SERVICE_COLOURS.international], ['domestic', 2, SERVICE_COLOURS.domestic]]);

  const both = legendItems({ mode: 'change', comparing: true, hide: ['kept'], routes });
  assert.deepEqual(both.map((g) => g.name), ['service', 'change']);
  assert.deepEqual(both[0].items.map((i) => i.colour), [null, null]);
  assert.deepEqual(both[1].items.map((i) => [i.key, i.count, i.colour, i.dashed, i.hidden]), [
    ['added', 1, CHANGE_COLOURS.added, false, false],
    ['kept', 1, 'var(--muted)', false, true],
    ['dropped', 1, CHANGE_COLOURS.dropped, true, false],
  ]);
});
```

- [ ] **Step 2: Run the tests to check they fail**

Run: `node --test static/globe/test/routestyle.test.js`
Expected: FAIL with `Cannot find module` for `routestyle.js`.

- [ ] **Step 3: Write the module**

Create `static/globe/src/routestyle.js`:

```js
import { SERVICE_COLOURS, colourFor, maxOf } from './scale.js';

// Kept routes take the theme's muted colour, so what changed stands out
export const CHANGE_COLOURS = { added: '#4dac26', dropped: '#c51b7d' };
export const SERVICES = ['domestic', 'international'];
export const STATUSES = ['added', 'kept', 'dropped'];
const HIDEABLE = [...SERVICES, ...STATUSES];
const LABELS = { domestic: 'Domestic', international: 'International', added: 'Added', kept: 'Kept', dropped: 'Dropped' };

const canonical = (keys) => HIDEABLE.filter((k) => keys.has(k));

// ?colour=service|change&hide=domestic,dropped. The older ?service=domestic (still carried by the nav) means "hide international".
export function parseStyle(search) {
  const q = new URLSearchParams(search || '');
  const colour = ['service', 'change'].includes(q.get('colour')) ? q.get('colour') : null;
  const hide = new Set((q.get('hide') || '').split(',').filter((k) => HIDEABLE.includes(k)));
  const service = q.get('service');
  if (SERVICES.includes(service)) for (const s of SERVICES) if (s !== service) hide.add(s);
  return { colour, hide: canonical(hide) };
}

export function styleParams({ colour, hide }) {
  const out = {};
  if (colour) out.colour = colour;
  if (hide.length) out.hide = hide.join(',');
  return out;
}

// change only means something with two years to compare; comparing defaults to it
export const colourMode = (colour, comparing) => (comparing ? colour ?? 'change' : 'service');

export function toggleHide(hide, key) {
  const s = new Set(hide);
  if (s.has(key)) s.delete(key); else s.add(key);
  return canonical(s);
}

export const visibleRoutes = (routes, hide, comparing) =>
  routes.filter((r) => !hide.includes(r.service) && !(comparing && r.status && hide.includes(r.status)));

// fainter as more routes crowd the map, so a big network doesn't turn into a smear; the busiest stay strongest
export function alphaFor(n, value, max) {
  const base = Math.min(0.85, Math.max(0.12, 0.85 * Math.sqrt(30 / Math.max(1, n))));
  const v = Number(value);
  const w = v > 0 && max > 0 ? Math.sqrt(Math.min(1, v / max)) : 0;
  return Math.min(0.9, Math.max(0.08, base * (0.6 + 0.9 * w)));
}

export function styleRoutes(routes, { mode, theme, widthKey }) {
  const max = maxOf(routes, widthKey);
  return routes.map((r) => ({
    colour: mode === 'change' ? CHANGE_COLOURS[r.status] ?? theme.ui.muted : colourFor(r.service),
    alpha: alphaFor(routes.length, r[widthKey], max),
    dashed: r.status === 'dropped',
  }));
}

// The legend's chips: one group per dimension, the coloured one with swatches. Counts are before hiding,
// so a hidden chip still says how many routes it would bring back.
export function legendItems({ mode, comparing, hide, routes }) {
  const item = (key, field, colour) => ({
    key, label: LABELS[key], count: routes.filter((r) => r[field] === key).length,
    colour, dashed: key === 'dropped', hidden: hide.includes(key),
  });
  const groups = [{ name: 'service', items: ['international', 'domestic'].map((s) => item(s, 'service', mode === 'service' ? SERVICE_COLOURS[s] : null)) }];
  if (comparing) {
    groups.push({ name: 'change', items: STATUSES.map((s) => item(s, 'status', mode === 'change' ? CHANGE_COLOURS[s] ?? 'var(--muted)' : null)) });
  }
  return groups;
}
```

- [ ] **Step 4: Run the tests to check they pass**

Run: `node --test static/globe/test/routestyle.test.js`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add static/globe/src/routestyle.js static/globe/test/routestyle.test.js
git commit -m "Add shared route styling: colour mode, hide filter, opacity, legend data

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Shared year comparison module, used by the airline map's route builder

**Files:**
- Create: `static/globe/src/compare.js`
- Test: `static/globe/test/compare.test.js`
- Modify: `static/charts/src/airline.js` (`STATUS_COLOURS` line 50 and `mapRoutes` lines 52–88)
- Modify: `static/charts/test/airline.test.js` (import line 3; the `mapRoutes` tests around lines 26–39)

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `compareYears(now: route[], then: route[]|null, keyOf: (route) => string) → route[]`. Each output route is a copy with `status` (`'kept'|'added'|'dropped'`, or `null` when `then` is null), `depsThen: number`, `depsNow: number`. Dropped routes carry year-A fields. Order: `now` order, then dropped routes in `then` order.
  - `countStatuses(routes) → { kept, added, dropped }`
  - `changeText(route, compareYear: number) → string` (`''` when `route.status` is null)
  - `moveHandle(years: number[], { year, compare }, which: 'year'|'compare', index: number) → { year, compare }`
  - `playStep(years: number[], year: number, base: number|null) → { year, compare } | null`
  - `mapRoutes` in `airline.js` keeps its signature and output, except that routes no longer have a `colour` field. `STATUS_COLOURS` is no longer exported.

- [ ] **Step 1: Write the failing tests**

Create `static/globe/test/compare.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { compareYears, countStatuses, changeText, moveHandle, playStep } from '../src/compare.js';

const r = (dest, deps) => ({ dest, deps, passengers: deps * 80 });
const byDest = (x) => x.dest;

test('compareYears without a second year marks nothing', () => {
  const out = compareYears([r('LAX', 10)], null, byDest);
  assert.deepEqual(out.map((x) => [x.dest, x.status]), [['LAX', null]]);
});

test('compareYears marks kept, added and dropped, dropped last and with the old numbers', () => {
  const out = compareYears([r('LAX', 20), r('MEX', 7)], [r('LAX', 10), r('DEN', 30)], byDest);
  assert.deepEqual(out.map((x) => [x.dest, x.status, x.depsThen, x.depsNow]), [
    ['LAX', 'kept', 10, 20], ['MEX', 'added', 0, 7], ['DEN', 'dropped', 30, 0],
  ]);
  assert.equal(out[2].deps, 30);
  assert.equal(out[2].passengers, 2400);
});

test('compareYears copies routes rather than changing them', () => {
  const now = [r('LAX', 20)];
  compareYears(now, [], byDest);
  assert.equal(now[0].status, undefined);
});

test('countStatuses counts each status and ignores routes without one', () => {
  assert.deepEqual(countStatuses([{ status: 'kept' }, { status: 'kept' }, { status: 'dropped' }, { status: null }]), { kept: 2, added: 0, dropped: 1 });
});

test('changeText describes a change', () => {
  assert.equal(changeText({ status: 'dropped', depsThen: 1200 }, 2019), 'Dropped: 1,200 departures in 2019');
  assert.equal(changeText({ status: 'kept', depsThen: 10, depsNow: 1500 }, 2019), '10 → 1,500 departures');
  assert.equal(changeText({ status: 'added', depsThen: 0, depsNow: 52 }, 2019), '0 → 52 departures');
  assert.equal(changeText({ status: null }, 2019), '');
});

const years = [2019, 2020, 2021, 2022];

test('moveHandle: the solid handle moves the year shown and keeps the comparison behind it', () => {
  assert.deepEqual(moveHandle(years, { year: 2022, compare: null }, 'year', 1), { year: 2020, compare: null });
  assert.deepEqual(moveHandle(years, { year: 2022, compare: 2019 }, 'year', 2), { year: 2021, compare: 2019 });
});

test('moveHandle: the hollow handle sets the comparison', () => {
  assert.deepEqual(moveHandle(years, { year: 2022, compare: null }, 'compare', 0), { year: 2022, compare: 2019 });
  assert.deepEqual(moveHandle(years, { year: 2022, compare: 2019 }, 'compare', 3), { year: 2022, compare: null });
});

test('moveHandle: one handle pushed past the other carries it along, never leaving compare >= year', () => {
  assert.deepEqual(moveHandle(years, { year: 2021, compare: 2020 }, 'year', 0), { year: 2019, compare: null });
  assert.deepEqual(moveHandle(years, { year: 2020, compare: 2019 }, 'compare', 3), { year: 2022, compare: null });
  for (const which of ['year', 'compare']) {
    for (let i = 0; i < years.length; i++) {
      const s = moveHandle(years, { year: 2021, compare: 2020 }, which, i);
      assert.ok(s.compare === null || s.compare < s.year, `${which} ${i}`);
    }
  }
});

test('playStep moves the year on and keeps the comparison year, stopping at the end', () => {
  assert.deepEqual(playStep(years, 2020, 2019), { year: 2021, compare: 2019 });
  assert.deepEqual(playStep(years, 2019, null), { year: 2020, compare: null });
  assert.equal(playStep(years, 2022, 2019), null);
});
```

In `static/charts/test/airline.test.js`, change the import on line 3 to drop `STATUS_COLOURS`:

```js
import { classifyRoutes, summariseRoutes, formatYearMonth, mapRoutes, centreOf, airlineOptions, findAirline, mergeMembers } from '../src/airline.js';
```

and replace the two `mapRoutes` tests (the one named `mapRoutes without a comparison year colours by domestic or international and has no status`, and the one named `mapRoutes with a comparison year marks pairs kept, dropped and added, drawing dropped ones with the old numbers`) with:

```js
test('mapRoutes without a comparison year gives each pair a service and no status', () => {
  const { routes } = mapRoutes([pair('SFO', 'LAX', 10), pair('LAX', 'MEX', 5)], null, airports);
  assert.deepEqual(routes.map((r) => [r.service, r.status]), [['domestic', null], ['international', null]]);
  assert.ok(routes.every((r) => !('colour' in r)));
});

test('mapRoutes with a comparison year marks pairs kept, dropped and added, drawing dropped ones with the old numbers', () => {
  const { routes } = mapRoutes([pair('SFO', 'LAX', 20), pair('SFO', 'MEX', 7)], [pair('SFO', 'LAX', 10), pair('SFO', 'DEN', 30)], airports);
  const by = Object.fromEntries(routes.map((r) => [r.dest, r]));
  assert.equal(by.LAX.status, 'kept'); assert.equal(by.LAX.deps, 20); assert.equal(by.LAX.depsThen, 10); assert.equal(by.LAX.depsNow, 20);
  assert.equal(by.DEN.status, 'dropped'); assert.equal(by.DEN.deps, 30); assert.equal(by.DEN.depsNow, 0);
  assert.equal(by.MEX.status, 'added'); assert.equal(by.MEX.depsThen, 0);
});
```

Keep any other existing `mapRoutes` tests (e.g. member merging, `min`, skipped airports) unchanged. If one of them asserts on `colour`, delete only that assertion.

- [ ] **Step 2: Run the tests to check they fail**

Run: `node --test static/globe/test/compare.test.js static/charts/test/airline.test.js`
Expected: FAIL. `compare.js` is not found, and the `colour` assertion in airline.test.js fails because `mapRoutes` still sets it.

- [ ] **Step 3: Write `compare.js`**

Create `static/globe/src/compare.js`:

```js
const fmt = (n) => Number(n || 0).toLocaleString('en-US');

// Year B's routes set against year A's, matched by `keyOf`: each route once, marked kept, added or dropped,
// with its departures in both years. A dropped route keeps its year-A numbers so it can still be drawn.
export function compareYears(now, then, keyOf) {
  if (!then) return now.map((r) => ({ ...r, status: null }));
  const before = new Map(then.map((r) => [keyOf(r), r]));
  const seen = new Set();
  const out = now.map((r) => {
    const k = keyOf(r);
    seen.add(k);
    const a = before.get(k);
    return { ...r, status: a ? 'kept' : 'added', depsThen: a ? Number(a.deps) || 0 : 0, depsNow: Number(r.deps) || 0 };
  });
  for (const [k, a] of before) if (!seen.has(k)) out.push({ ...a, status: 'dropped', depsThen: Number(a.deps) || 0, depsNow: 0 });
  return out;
}

export function countStatuses(routes) {
  const c = { kept: 0, added: 0, dropped: 0 };
  for (const r of routes) if (r.status) c[r.status] += 1;
  return c;
}

export function changeText(r, compareYear) {
  if (!r.status) return '';
  return r.status === 'dropped' ? `Dropped: ${fmt(r.depsThen)} departures in ${compareYear}` : `${fmt(r.depsThen)} → ${fmt(r.depsNow)} departures`;
}

// The year range's two handles are indexes into `years`: the solid one (`year`) never sits below the hollow one (`compare`).
// Moving one past the other carries it along; the hollow one only stays behind when the solid one moves away from it.
export function moveHandle(years, { year, compare }, which, index) {
  const lo = years.indexOf(compare ?? year);
  const hi = years.indexOf(year);
  const [a, b] = which === 'year' ? [Math.min(lo, index), index] : [index, Math.max(index, hi)];
  return { year: years[b], compare: a < b ? years[a] : null };
}

// One step of play: the solid handle moves on a year and the hollow one stays at `base`; null once at the end
export function playStep(years, year, base) {
  const next = years.indexOf(year) + 1;
  if (next <= 0 || next >= years.length) return null;
  return { year: years[next], compare: base !== null && base < years[next] ? base : null };
}
```

- [ ] **Step 4: Make `mapRoutes` use `compareYears`**

In `static/charts/src/airline.js`:

Delete the line `export const STATUS_COLOURS = { kept: '#2a9df4', added: '#2ca02c', dropped: '#d62728' };`.

Add after the existing `import … from './names.js';` line. Use a relative path, which works both in the browser (the file is served at `/static/charts/src/`) and under `node --test`, where a leading `/static/…` would resolve against the filesystem root:

```js
import { compareYears } from '../../globe/src/compare.js';
```

Replace the body of `mapRoutes` from `const now = perYear(rowsB);` to the end of the function with:

```js
  const now = perYear(rowsB);
  const then = compare ? perYear(rowsA) : null;
  const routes = [];
  const skipped = new Set();
  for (const t of compareYears([...now.values()], then && [...then.values()], (x) => `${x.origin}\u0000${x.dest}`)) {
    const from = airports.get(t.origin);
    const to = airports.get(t.dest);
    if (!from || !to) { skipped.add(!from ? t.origin : t.dest); continue; }
    routes.push({
      origin: t.origin, dest: t.dest, status: t.status, from: [from.lon, from.lat], to: [to.lon, to.lat],
      deps: t.deps, seats: t.seats, passengers: t.passengers, freight: t.freight,
      depsThen: t.depsThen ?? 0, depsNow: t.depsNow ?? t.deps, airlines: t.airlines,
      service: from.isUs && to.isUs ? 'domestic' : 'international',
    });
  }
  return { routes, skipped: [...skipped].sort() };
```

Update the comment above `mapRoutes` if it mentions colours.

- [ ] **Step 5: Run all JS tests**

Run: `npm test`
Expected: PASS. If an airline test expected the old ordering (union of keys, `now` first then `then`), it still holds: `compareYears` emits `now` order, then dropped in `then` order.

- [ ] **Step 6: Commit**

```bash
git add static/globe/src/compare.js static/globe/test/compare.test.js static/charts/src/airline.js static/charts/test/airline.test.js
git commit -m "Add shared year comparison and range-handle logic; airline routes use it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Renderer draws from per-route styles; shared legend and range DOM

**Files:**
- Modify: `static/globe/src/renderer.js` (route loop in `draw`, lines ~119–131)
- Create: `static/globe/src/controls.js`
- Modify: `static/globe/style.css` (append legend chip and range CSS)
- Modify: `static/charts/airlineglobe.css` (remove the range CSS that moves)

**Interfaces:**
- Consumes: the `styleRoutes` output shape `{ colour, alpha, dashed }[]` (Task 1) and the `legendItems` output (Task 1).
- Produces:
  - `renderer.draw(view, routes, opts)` accepts `opts.styles` (parallel to `routes`). Without it, the renderer behaves exactly as now (service colour, alpha 0.65).
  - `renderLegend(el: HTMLElement, groups, onToggle: (key: string) => void)`
  - `syncRange({ from, to, fill }: { HTMLInputElement, HTMLInputElement, HTMLElement }, years: number[], year: number, compare: number|null)`
  - CSS ids/classes: `#range`, `#range-fill`, `#year-from`, `#range-hint`, `#legend-chips`, `.legend-group`, `.chip`, `.chip .count`, `.swatch.dashed`, `.swatch.plain`.

There is no unit test for canvas or DOM code in this repo (the node tests have no DOM). This task is covered by `npm test` staying green and by the browser checks in Tasks 4, 5 and 7.

- [ ] **Step 1: Change the route loop in `renderer.js`**

Replace the `for (const i of order) { … }` loop and the `ctx.globalAlpha = 1;` after it with:

```js
    // while a route is highlighted the rest step back
    const dim = opts.highlight >= 0 ? 0.6 : 1;
    for (const i of order) {
      const r = routes[i];
      const s = opts.styles?.[i];
      ctx.beginPath();
      this.path({ type: 'LineString', coordinates: [r.from, r.to] });
      ctx.strokeStyle = s?.colour ?? colourFor(r.service);
      ctx.setLineDash(s?.dashed ? [5, 4] : []);
      ctx.globalAlpha = i === opts.highlight ? 1 : (s?.alpha ?? 0.65) * dim;
      ctx.lineWidth = widthFor(r[key], opts.max) + (i === opts.highlight ? 1.5 : 0);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
```

- [ ] **Step 2: Create `controls.js`**

```js
// The legend's chips, one button per category, pressed while its routes are shown
export function renderLegend(el, groups, onToggle) {
  el.replaceChildren();
  for (const g of groups) {
    const group = Object.assign(document.createElement('span'), { className: 'legend-group' });
    for (const it of g.items) {
      const b = Object.assign(document.createElement('button'), { type: 'button', className: 'chip' });
      b.setAttribute('aria-pressed', String(!it.hidden));
      b.title = `${it.hidden ? 'Show' : 'Hide'} ${it.label.toLowerCase()} routes`;
      const sw = Object.assign(document.createElement('span'), { className: 'swatch' });
      if (it.colour) sw.style.setProperty('--swatch', it.colour); else sw.classList.add('plain');
      if (it.dashed) sw.classList.add('dashed');
      const count = Object.assign(document.createElement('span'), { className: 'count', textContent: it.count.toLocaleString('en-US') });
      b.append(sw, `${it.label} `, count);
      b.addEventListener('click', () => onToggle(it.key));
      group.append(b);
    }
    el.append(group);
  }
}

// Place the two year handles and the fill between them
export function syncRange({ from, to, fill }, years, year, compare) {
  const lo = years.indexOf(compare ?? year);
  const hi = years.indexOf(year);
  from.value = String(lo);
  to.value = String(hi);
  const span = Math.max(1, years.length - 1);
  fill.style.left = `calc(8px + (100% - 16px) * ${lo / span})`;
  fill.style.width = `calc((100% - 16px) * ${(hi - lo) / span})`;
}
```

- [ ] **Step 3: Move the range CSS and add chip CSS**

Cut every rule from `static/charts/airlineglobe.css` that starts with `#range` (`#range`, `#range::before`, `#range-fill`, `#range input…`, `#range #year-from…`, `#range-hint`), along with the two comments above them, and paste them at the end of `static/globe/style.css`. Leave `#year-label { min-width: 8em; }` in `airlineglobe.css`. If that leaves `airlineglobe.css` with only that rule, keep the file anyway, since the template links it.

Delete the rule `#year { flex:1; min-width:140px; }` (line 30 of `static/globe/style.css`). `#year` now sits inside `#range`, which takes the row's spare width, and the moved `#range input` rules size the input.

Append the chip CSS to `static/globe/style.css`:

```css
/* legend chips: a toggle per category; the swatch shows the colour only for the dimension being coloured */
#legend-chips { display:flex; flex-wrap:wrap; gap:4px 10px; align-items:center; }
.legend-group { display:inline-flex; flex-wrap:wrap; gap:4px; }
.chip { font-size:12px; padding:2px 8px; color:var(--fg); display:inline-flex; align-items:center; gap:2px; }
.chip .count { color:var(--muted); font-variant-numeric:tabular-nums; }
.chip[aria-pressed="false"] { opacity:.45; text-decoration:line-through; }
.chip .swatch { margin:0 4px 0 0; background:var(--swatch, transparent); }
.swatch.plain { border:1px solid var(--muted); height:2px; }
.swatch.dashed { background:repeating-linear-gradient(90deg, var(--swatch, var(--muted)) 0 5px, transparent 5px 9px); }
```

- [ ] **Step 4: Run all tests**

Run: `npm test && uv run pytest -q`
Expected: PASS. Nothing calls the new code yet, and the renderer without `styles` is unchanged.

- [ ] **Step 5: Commit**

```bash
git add static/globe/src/renderer.js static/globe/src/controls.js static/globe/style.css static/charts/airlineglobe.css
git commit -m "Renderer draws per-route colour, opacity and dash; shared legend chips and year range

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Airline map uses the shared colouring, legend and filters

**Files:**
- Modify: `templates/airline_globe.html` (legend block lines ~30–37, range hint line ~47)
- Modify: `static/charts/airlineglobe.js`
- Test: `tests/test_rollup_pages.py` (the airline globe test near line 68)

**Interfaces:**
- Consumes: `parseStyle`, `styleParams`, `colourMode`, `toggleHide`, `visibleRoutes`, `styleRoutes`, `legendItems` (Task 1); `countStatuses`, `changeText`, `moveHandle`, `playStep` (Task 2); `renderLegend`, `syncRange` (Task 3); `opts.styles` on `renderer.draw` (Task 3).
- Produces: airline page URL gains `colour` and `hide`.

- [ ] **Step 1: Write the failing page test**

In `tests/test_rollup_pages.py`, find the test containing `"/static/charts/airlineglobe.js" in r.text` (near line 68) and add after its existing assertion:

```python
    assert 'id="legend-chips"' in r.text and 'id="colour"' in r.text
    assert 'id="legend-service"' not in r.text
```

- [ ] **Step 2: Run it to check it fails**

Run: `uv run pytest -q tests/test_rollup_pages.py`
Expected: FAIL on `id="legend-chips"`.

- [ ] **Step 3: Update the template**

In `templates/airline_globe.html`, replace the two spans `legend-service` and `legend-status` (from `<span id="legend-service">` through the `Added</span>` line) with:

```html
      <span id="legend-chips"></span>
```

In the `<div class="row">` that holds `#proj` and `#width`, add after `#width`'s `</select>`:

```html
      <select id="colour" aria-label="Colour routes by"><option value="service">Colour: domestic or international</option><option value="change">Colour: kept, added or dropped</option></select>
```

Replace the `#range-hint` text with:

```html
    <div id="range-hint">Drag the hollow handle back to compare with an earlier year: new routes show green, dropped ones dashed pink. Click the legend to hide any kind of route.</div>
```

- [ ] **Step 4: Rewire `airlineglobe.js`**

Make these changes in `static/charts/airlineglobe.js`:

Imports: add

```js
import { parseStyle, styleParams, colourMode, toggleHide, visibleRoutes, styleRoutes, legendItems } from '/static/globe/src/routestyle.js';
import { countStatuses, changeText, moveHandle, playStep } from '/static/globe/src/compare.js';
import { renderLegend, syncRange } from '/static/globe/src/controls.js';
```

State: add `...parseStyle(location.search),` as the last property of the `state` object. Add next to `let routes = [];`:

```js
let shown = []; // routes after the legend's filters: what is drawn and hit-tested
const range = { from: $('year-from'), to: $('year'), fill: $('range-fill') };
```

`pushState`: after `if (state.min !== '12') q.set('min', state.min);` add

```js
  for (const [k, v] of Object.entries(styleParams(state))) q.set(k, v);
```

Delete the `counts()` function and the `syncHandles()` function.

Replace `refresh()` with:

```js
function refresh() {
  hover = -1;
  selected = -1;
  $('panel').hidden = true;
  $('tooltip').hidden = true;
  const comparing = Boolean(state.compare);
  shown = visibleRoutes(routes, state.hide, comparing);
  $('year-label').textContent = comparing ? `${state.compare} → ${state.year}` : state.year;
  syncRange(range, years, state.year, state.compare);
  const c = countStatuses(routes);
  const pax = shown.reduce((s, r) => s + (r.status === 'dropped' ? 0 : Number(r.passengers || 0)), 0);
  $('stats').textContent = comparing
    ? `${state.year} compared with ${state.compare} · ${c.kept} kept · ${c.dropped} dropped · ${c.added} added`
    : `${state.year} · ${shown.length} airport pairs · ${fmt(pax)} passengers`;
  const mode = colourMode(state.colour, comparing);
  $('colour').value = mode;
  $('colour').querySelector('option[value="change"]').disabled = !comparing;
  renderLegend($('legend-chips'), legendItems({ mode, comparing, hide: state.hide, routes }), (key) => { state.hide = toggleHide(state.hide, key); refresh(); });
  $('footnote').textContent = skipped.length ? `${skipped.length} airport${skipped.length === 1 ? '' : 's'} not shown (no coordinates): ${skipped.slice(0, 12).join(', ')}${skipped.length > 12 ? '…' : ''}` : '';
  if (!routes.length && !$('status').textContent) setStatus('No routes at this level in this year.');
  else if (routes.length && !shown.length) setStatus('Every route here is hidden: click a legend entry to show it again.');
  else if (routes.length && $('status').className !== 'warn') setStatus('');
  $('table-link').href = `/airlines/${own}${state.compare ? `?from=${state.compare}&to=${state.year}` : ''}#changes`;
  pushState();
  dirty = true;
}
```

`tooltipText`: replace the `if (r.status) lines.push(…); else lines.push(…);` pair with

```js
  if (r.status) lines.push(changeText(r, state.compare));
  else lines.push(`${fmt(r.passengers)} passengers · ${fmt(r.deps)} departures`);
```

`bindControls`: replace the `apply` function and the two slider listeners with

```js
  const move = (which, el) => () => { Object.assign(state, moveHandle(years, state, which, Number(el.value))); load(); };
  slider.addEventListener('input', move('year', slider));
  from.addEventListener('input', move('compare', from));
```

and, after the `width` listener, add

```js
  $('colour').addEventListener('change', () => { state.colour = $('colour').value; refresh(); });
```

Play: replace the `playTimer = setInterval(() => { … }, 900);` body with

```js
    playTimer = setInterval(() => {
      const step = playStep(years, state.year, base);
      if (!step) { clearInterval(playTimer); playTimer = null; $('play').textContent = '▶'; return; }
      Object.assign(state, step);
      load();
    }, 900);
```

`bindCanvas`: change every `routes` used for hit-testing or display to `shown`: `renderer.hitTest(x, y, shown)`, `tooltipText(shown[i])`, `renderer.hitTest(x, y, shown, 10)`, `showPanel(shown[selected])`.

`frame`: replace the `renderer.draw(...)` call with

```js
    const styles = styleRoutes(shown, { mode: colourMode(state.colour, Boolean(state.compare)), theme: THEMES[themeId], widthKey: state.width });
    renderer.draw(view, shown, { widthKey: state.width, max: maxOf(shown, state.width), highlight: selected >= 0 ? selected : hover, labels: 0, bothEnds: true, styles });
```

`main`: `home = centreOf(routes);` stays on `routes`, since the camera centres on the whole network.

- [ ] **Step 5: Run the tests**

Run: `npm test && uv run pytest -q`
Expected: PASS.

- [ ] **Step 6: Check in the browser**

Start the site locally the way the README describes (check `README.md` for the local run command; it is `datasette .` from the repo root with `t100.db` present). Open `/airlines/<a big group, e.g. the one for United>/globe`:
- The single year shows International/Domestic chips with colour swatches and counts. Clicking one hides those routes and strikes the chip through. The URL gains `hide=`.
- Drag the hollow handle back. Added/Kept/Dropped chips appear, coloured green, grey and pink. Dropped lines are dashed. The service chips lose their swatches.
- Switch the colour select to domestic/international while comparing. Lines go orange/blue, dropped stay dashed, and the change chips lose their swatches.
- Hide everything. The status line reads "Every route here is hidden…", and hover and click do nothing.
- Reload with the URL. The same view comes back.
- Hover a route. It goes solid and the rest dim.

- [ ] **Step 7: Commit**

```bash
git add templates/airline_globe.html static/charts/airlineglobe.js tests/test_rollup_pages.py
git commit -m "Airline map: colour by service or change, legend filters, opacity by route count

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Airport map gains year comparison, colour choice and legend filters

**Files:**
- Modify: `static/globe/src/state.js`
- Modify: `static/globe/test/state.test.js`
- Modify: `templates/globe.html` (legend block, year row, controls row)
- Modify: `static/globe/main.js`
- Test: `tests/test_globe_page.py` (`test_service_menu_offers_all_domestic_international`)

**Interfaces:**
- Consumes: everything from Tasks 1–3; `parseStyle`, `styleParams` from `./routestyle.js`.
- Produces: `parseState(search) → { year, compare, month, proj, width, colour, hide }`. `service` is gone, and `?service=` is read into `hide`. `toSearch(state, extra)` also writes `compare`, `colour` and `hide`. `compare` is only range-checked here (1990–2100); the page checks it against the data (Step 7, `main`). The airport page URL becomes `?year=&compare=&colour=&hide=`.

- [ ] **Step 1: Write the failing state tests**

Replace the whole of `static/globe/test/state.test.js` with:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseState, toSearch } from '../src/state.js';

const DEFAULTS = { year: null, compare: null, month: null, proj: 'globe', width: 'passengers', colour: null, hide: [] };

test('defaults', () => {
  assert.deepEqual(parseState(''), DEFAULTS);
});
test('parses valid values', () => {
  assert.deepEqual(parseState('?year=2019&month=3&proj=flat&width=freight'), { ...DEFAULTS, year: 2019, month: 3, proj: 'flat', width: 'freight' });
  assert.deepEqual(parseState('?year=2024&compare=2019&colour=service&hide=dropped'), { ...DEFAULTS, year: 2024, compare: 2019, colour: 'service', hide: ['dropped'] });
});
test('rejects out-of-range and garbage', () => {
  assert.deepEqual(parseState('?year=abc&compare=1850&month=13&proj=cube&width=<b>&colour=x&hide=x'), DEFAULTS);
  assert.equal(parseState('?year=1850').year, null);
  assert.equal(parseState('?month=0').month, null);
});
test('round trips and omits defaults', () => {
  assert.equal(toSearch(DEFAULTS), '');
  assert.equal(toSearch({ ...DEFAULTS, year: 2019, proj: 'flat', width: 'deps' }), '?year=2019&proj=flat&width=deps');
  const full = { ...DEFAULTS, year: 2024, compare: 2019, proj: 'flat', width: 'freight', colour: 'change', hide: ['domestic', 'dropped'] };
  assert.deepEqual(parseState(toSearch(full)), full);
});
test('extra params are preserved', () => {
  assert.equal(toSearch({ ...DEFAULTS, year: 2019 }, { theme: 'night' }), '?year=2019&theme=night');
});
test('the old service filter becomes a hidden service and is not written back', () => {
  assert.deepEqual(parseState('?service=domestic').hide, ['international']);
  assert.deepEqual(parseState('?service=both').hide, []);
  assert.equal(toSearch(parseState('?year=2019&service=domestic')), '?year=2019&hide=international');
});
```

- [ ] **Step 2: Run them to check they fail**

Run: `node --test static/globe/test/state.test.js`
Expected: FAIL (`compare`, `colour`, `hide` missing; `service` present).

- [ ] **Step 3: Update `state.js`**

Replace the file with:

```js
import { parseStyle, styleParams } from './routestyle.js';

const intOrNull = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

const WIDTHS = ['passengers', 'deps', 'freight'];
const yearOrNull = (v) => (v !== null && v >= 1990 && v <= 2100 ? v : null);

export function parseState(search) {
  const q = new URLSearchParams(search || '');
  const month = intOrNull(q.get('month'));
  return {
    year: yearOrNull(intOrNull(q.get('year'))),
    compare: yearOrNull(intOrNull(q.get('compare'))),
    month: month !== null && month >= 1 && month <= 12 ? month : null,
    proj: q.get('proj') === 'flat' ? 'flat' : 'globe',
    width: WIDTHS.includes(q.get('width')) ? q.get('width') : 'passengers',
    ...parseStyle(search),
  };
}

export function toSearch(state, extra = {}) {
  const q = new URLSearchParams();
  if (state.year !== null) q.set('year', state.year);
  if (state.compare !== null) q.set('compare', state.compare);
  if (state.month !== null) q.set('month', state.month);
  if (state.proj === 'flat') q.set('proj', 'flat');
  if (state.width !== 'passengers') q.set('width', state.width);
  for (const [k, v] of Object.entries({ ...styleParams(state), ...extra })) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : '';
}
```

- [ ] **Step 4: Write the failing page test**

In `tests/test_globe_page.py`, replace `test_service_menu_offers_all_domestic_international` with:

```python
def test_map_has_year_comparison_colour_choice_and_legend(ds):
    html = get(ds, "/airports/ATL/globe").text
    for el in ('id="year-from"', 'id="year"', 'id="range-fill"', 'id="colour"', 'id="legend-chips"'):
        assert el in html, el
    assert 'id="service"' not in html
```

- [ ] **Step 5: Run it to check it fails**

Run: `uv run pytest -q tests/test_globe_page.py`
Expected: FAIL on `id="year-from"`.

- [ ] **Step 6: Update the template**

In `templates/globe.html`:

Replace the two swatch spans (International, Domestic) inside `#legend` with

```html
      <span id="legend-chips"></span>
```

Replace `<input id="year" type="range" min="0" max="0" value="0" step="1" aria-label="Year">` with

```html
      <div id="range">
        <div id="range-fill"></div>
        <input id="year-from" type="range" min="0" max="0" value="0" step="1" aria-label="Compare with this year">
        <input id="year" type="range" min="0" max="0" value="0" step="1" aria-label="Year">
      </div>
```

After that `<div class="row">`, add

```html
    <div id="range-hint">Drag the hollow handle back to compare with an earlier year: new routes show green, dropped ones dashed pink. Click the legend to hide any kind of route.</div>
```

Replace the `<select id="service" …>…</select>` with

```html
      <select id="colour" aria-label="Colour routes by"><option value="service">Colour: domestic or international</option><option value="change">Colour: kept, added or dropped</option></select>
```

- [ ] **Step 7: Rewire `static/globe/main.js`**

Imports:
- From `./src/adapter.js`, drop `forService`.
- Add:

```js
import { colourMode, toggleHide, visibleRoutes, styleRoutes, legendItems } from './src/routestyle.js';
import { compareYears, countStatuses, changeText, moveHandle, playStep } from './src/compare.js';
import { renderLegend, syncRange } from './src/controls.js';
```

Module state: add next to `let monthRaw = [];`:

```js
let periodRoutes = [];   // the period on screen, with kept/added/dropped when comparing
let shown = [];          // periodRoutes after the legend's filters: what is drawn and hit-tested
const range = { from: $('year-from'), to: $('year'), fill: $('range-fill') };
const destKey = (r) => r.dest;
```

Replace `currentRoutes()` with `recompute()`:

```js
function recompute() {
  if (state.year === null) { periodRoutes = []; shown = []; return; }
  periodRoutes = state.month !== null
    ? compareYears(forMonth(monthRoutes, state.month), null, destKey)
    : compareYears(forYear(yearRoutes, state.year), state.compare ? forYear(yearRoutes, state.compare) : null, destKey);
  shown = visibleRoutes(periodRoutes, state.hide, Boolean(state.compare));
}
```

Replace `updateStats()` with:

```js
function updateStats() {
  const comparing = Boolean(state.compare);
  const pax = shown.reduce((s, r) => s + (r.status === 'dropped' ? 0 : Number(r.passengers || 0)), 0);
  const deps = shown.reduce((s, r) => s + (r.status === 'dropped' ? 0 : Number(r.deps || 0)), 0);
  const label = state.month !== null ? `${state.year}-${String(state.month).padStart(2, '0')}` : comparing ? `${state.compare} → ${state.year}` : `${state.year}`;
  const c = countStatuses(periodRoutes);
  $('stats').textContent = comparing
    ? `${state.year} compared with ${state.compare} · ${c.kept} kept · ${c.dropped} dropped · ${c.added} added`
    : `${label} · ${shown.length} ${document.body.dataset.foreign ? 'US destinations' : 'destinations'} · ${fmt(deps)} departures · ${fmt(pax)} passengers`;
  $('year-label').textContent = label;
  const periodRows = state.month !== null
    ? monthRaw.filter((r) => r.month === state.month)
    : yearRaw.filter((r) => r.year === state.year || r.year === state.compare);
  const skipped = skippedFor(periodRows.filter((r) => !state.hide.includes(r.service)), airports);
  const notes = [];
  if (skipped.length) notes.push(`${skipped.length} destination${skipped.length === 1 ? '' : 's'} not shown (no coordinates): ${skipped.slice(0, 12).join(', ')}${skipped.length > 12 ? '…' : ''}`);
  $('footnote').textContent = notes.join(' · ');
  if (loadError) setStatus(loadError, true);
  else if (truncated) setStatus('Too many rows: some routes are missing from this view.', true);
  else if (!periodRoutes.length) setStatus('No flights from this airport in this period.');
  else if (!shown.length) setStatus('Every route here is hidden: click a legend entry to show it again.');
  else setStatus('');
}
```

`tooltipText`:

```js
function tooltipText(r) {
  const change = changeText(r, state.compare);
  return `${r.dest} · ${r.destCity || ''}\n${change || `${fmt(r.passengers)} passengers · ${fmt(r.deps)} departures`}\n${r.service}`;
}
```

`showPanel`: change the `sub.textContent` line to

```js
  sub.textContent = `${r.destCity || ''} (${r.service}${r.status ? `, ${r.status}` : ''})`;
```

`refresh()`: replace with

```js
function refresh() {
  hover = -1;
  selected = -1;
  $('panel').hidden = true;
  $('tooltip').hidden = true;
  $('month').hidden = state.month === null;
  recompute();
  const comparing = Boolean(state.compare);
  const mode = colourMode(state.colour, comparing);
  $('colour').value = mode;
  $('colour').querySelector('option[value="change"]').disabled = !comparing;
  renderLegend($('legend-chips'), legendItems({ mode, comparing, hide: state.hide, routes: periodRoutes }), (key) => { state.hide = toggleHide(state.hide, key); refresh(); });
  if (years.length) syncRange(range, years, state.year, state.compare);
  updateStats();
  pushState();
  dirty = true;
}
```

`bindControls`:
- Delete the `service` select block (three lines starting `const service = $('service');`).
- After the `width` listener add:

```js
  $('colour').addEventListener('change', () => { state.colour = $('colour').value; refresh(); });
```

- Replace everything from `const slider = $('year');` through the slider's `input` listener with:

```js
  for (const el of [range.from, range.to]) { el.min = '0'; el.max = String(years.length - 1); }
  // comparing is by year, so moving the hollow handle back leaves the month view
  const move = (which, el) => async () => {
    Object.assign(state, moveHandle(years, state, which, Number(el.value)));
    if (state.compare !== null && state.month !== null) { state.month = null; $('month-toggle').checked = false; }
    if (state.month !== null && (await loadMonths()) === false) return;
    refresh();
  };
  range.to.addEventListener('input', move('year', range.to));
  range.from.addEventListener('input', move('compare', range.from));
```

- Replace the `play` listener with:

```js
  $('play').addEventListener('click', () => {
    if (playTimer) { clearInterval(playTimer); playTimer = null; $('play').textContent = '▶'; return; }
    $('play').textContent = '⏸';
    state.month = null;
    $('month-toggle').checked = false;
    // play moves the solid handle on, keeping the hollow one where it is; from the end, start again from it
    const base = state.compare;
    if (state.year === years.at(-1)) { state.year = base ?? years[0]; state.compare = null; refresh(); }
    playTimer = setInterval(() => {
      const step = playStep(years, state.year, base);
      if (!step) { clearInterval(playTimer); playTimer = null; $('play').textContent = '▶'; return; }
      Object.assign(state, step);
      refresh();
    }, 700);
  });
```

- In the `month-toggle` listener's `if (toggle.checked) {` branch, add `state.compare = null;` as the first line.

`bindCanvas`: in `onHover` and `onTap`, replace `const routes = currentRoutes();` with `const routes = shown;`.

`frame`: replace `const routes = currentRoutes();` with `const routes = shown;` and add `styles` to the `renderer.draw` options:

```js
      styles: styleRoutes(routes, { mode: colourMode(state.colour, Boolean(state.compare)), theme: THEMES[themeId], widthKey: key }),
```

`main`: after `if (state.year === null || !years.includes(state.year)) state.year = years[years.length - 1];` add

```js
  if (!years.includes(state.compare) || state.compare >= state.year || state.month !== null) state.compare = null;
```

Search the file for any remaining `state.service`, `forService` or `currentRoutes` and remove them. `grep -n "state.service\|forService\|currentRoutes" static/globe/main.js` must print nothing.

- [ ] **Step 8: Run the tests**

Run: `npm test && uv run pytest -q`
Expected: PASS. `forService` is still exported from `adapter.js` and tested there; leave it.

- [ ] **Step 9: Check in the browser**

With the local site running, open `/airports/ATL/globe`:
- One year: service chips with counts. Hiding Domestic leaves only international routes and puts `hide=domestic` in the URL.
- Drag the hollow handle to 2019 with the solid one on the latest year. Change chips appear, the stats say "… kept · … dropped · … added", dropped routes are dashed and drawn with their 2019 widths, and the tooltip on a dropped route says "Dropped: N departures in 2019".
- Turn Months on. The comparison clears and the hollow handle joins the solid one. Drag the hollow handle back again: Months turns off.
- Press play with a comparison set. The solid handle advances, the hollow one stays, and it stops at the end.
- Open `/airports/ATL/globe?service=domestic`. It shows domestic only, and the URL rewrites to `hide=international`.
- Open `/airports/ATL/globe?compare=1850` and `?year=2019&compare=2024`. Both show a single year with no comparison.
- Click a destination in the panel (`r.dest` link). The new airport keeps `compare`, `colour` and `hide`.
- The chooser page `/globe` still shows airport dots and works.

- [ ] **Step 10: Commit**

```bash
git add static/globe/src/state.js static/globe/test/state.test.js templates/globe.html static/globe/main.js tests/test_globe_page.py
git commit -m "Airport map: compare two years, colour by service or change, legend filters

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Nav carries the map's hidden service to other pages

**Files:**
- Modify: `static/nav/src/state.js` (`carryParams`, line ~25)
- Test: `static/nav/test/state.test.js`

**Interfaces:**
- Consumes: the `hide` URL format from Task 1 (comma list).
- Produces: `carryParams(search, target)` treats `?hide=` with exactly one of `domestic`/`international` as `service=<the other>`. An explicit `service` wins.

- [ ] **Step 1: Write the failing test**

Append to `static/nav/test/state.test.js`:

```js
test('a map hiding one service carries the other as the service setting', () => {
  assert.deepEqual(carryParams('?hide=international,dropped', 'routes'), { service: 'domestic' });
  assert.deepEqual(carryParams('?hide=domestic', 'globe'), { service: 'international' });
  assert.deepEqual(carryParams('?hide=domestic,international', 'routes'), {});
  assert.deepEqual(carryParams('?hide=kept', 'routes'), {});
  assert.deepEqual(carryParams('?hide=domestic&service=domestic', 'routes'), { service: 'domestic' });
});
```

- [ ] **Step 2: Run it to check it fails**

Run: `node --test static/nav/test/state.test.js`
Expected: FAIL on the first assertion (`{}` returned).

- [ ] **Step 3: Implement**

In `static/nav/src/state.js`, add above `carryParams`:

```js
// the map pages hide a service with ?hide=; hiding just one of the two means showing the other
function serviceFromHide(hide) {
  const hidden = (hide || '').split(',').filter((s) => SERVICES.includes(s));
  return hidden.length === 1 ? SERVICES.find((s) => s !== hidden[0]) : null;
}
```

and change `const service = q.get('service');` to

```js
  const service = q.get('service') ?? serviceFromHide(q.get('hide'));
```

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add static/nav/src/state.js static/nav/test/state.test.js
git commit -m "Nav: carry a map's hidden service to other pages as the service setting

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Tune opacity by eye, update docs, final check

**Files:**
- Possibly modify: `static/globe/src/routestyle.js` (`alphaFor` constants only)
- Modify: `README.md` (line ~51, nav settings sentence; line ~52, `static/globe/` sentence)
- Modify: `scripts/smoke_check.sh` only if it greps for markup removed here (`id="service"`, `legend-service`)

- [ ] **Step 1: Look at the extremes**

With the local site running, check in Paper and Night themes, globe and flat:
- A small airport (e.g. `/airports/BTV/globe`, about 10 routes). Lines should look about as strong as before (0.65).
- A hub (`/airports/ATL/globe`, 200+ routes) and a large airline network (the biggest group on `/airlines`). Trunk routes should read clearly and minor routes faintly, with no solid smear over the US.
- Airline comparison over a long span (e.g. 2005 → latest). The dashed dropped routes should still be visible at low alpha.

If the hub or airline view is still too dense or too faint, adjust only the constants in `alphaFor`: `30` (route count at which fading starts), `0.12` (base floor), `0.6 + 0.9 * w` (size boost). Re-run `node --test static/globe/test/routestyle.test.js`; the bounds test must still pass.

- [ ] **Step 2: Docs**

In `README.md`, extend the sentence about `static/nav/` to say it also reads the maps' `hide` setting back into `service`. Add to the `static/globe/` sentence: "`src/routestyle.js` and `src/compare.js` hold the colouring, filtering and year comparison shared with the airline map (`static/charts/airlineglobe.js`)."

Run `grep -n 'id="service"\|legend-service\|legend-status' scripts/smoke_check.sh templates static -r`. Nothing should print. Fix any hit.

- [ ] **Step 3: Full test run**

Run: `npm test && uv run pytest -q`
Expected: PASS, with the output shown.

- [ ] **Step 4: Commit**

```bash
git add -A static/globe/src/routestyle.js README.md scripts/smoke_check.sh
git commit -m "Tune route opacity; document the shared map styling

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(If `alphaFor` and `smoke_check.sh` are unchanged, `git add` on them is a no-op.)
