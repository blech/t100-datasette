# Views Part 2 (Carrying a Highlight Across Links) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Links from an airline to a route, and from a route's table row to an aircraft family, carry `?highlight=airline:{group}`. The destination chart opens split by airline with that airline's series pinned as highlighted, never folded into "Other", and a "Highlighting … · clear" line above the chart.

**Architecture:**
- **Pure parts, unit-tested:** `parseHighlight` and `highlightedSeries` in `static/common/highlight.js`, and a `keep` option in `buildSeries` and `buildFamilySeries`.
- **`attachHighlight`** takes a pinned set.
- **The route and family pages** read the parameter, keep the series, pin them and draw the line.
- **Three link sites** add the parameter.

**Tech Stack:** Plain ES modules, Observable Plot, `node --test`, headless Playwright.

**Spec:** `docs/superpowers/specs/2026-10-22-highlight-links-design.md`

## Global Constraints

- **The parameter:** `highlight=airline:{group id}`. Airlines are matched by `group_id` on the rows, never by label.
- **On a route,** the airline split is `split=carrier`. **On a family,** it's `split=airline`.
- **The line:** "Highlighting {name} · clear". When the airline isn't on the chart: "{name} doesn't appear here · clear". When the split doesn't show airlines: "{name} isn't shown when split by {split label} · clear". When the name is unknown: no line.
- **Branch:** `highlight`, off `views-pages`. Never push. Stage files by name.
- **Commits** end with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_0191mnN3iPgFXTdJ7jQemcY1
  ```

## Review Focus

1. **A merged group on a route:** Delta (incl. Northwest) highlights both "Delta Air Lines" and "Northwest Airlines" bands, through the set version of `attachHighlight`. (Task 1 test; Task 4 browser check.)
2. **The kept airline's colour:** a ninth series from `keep` takes the last Ember step and must not be black. (Task 1 test, `seriesColours` with nine.)
3. **Pinned versus pointing:** pointing and leaving returns to the pinned set; "clear" empties the pin. (Task 4.)
4. **Short carrier names:** `routepage.js` replaces carrier names with short ones (`shortenField`) before building series. `highlightedSeries` must read labels after that replacement, so it uses the same rows the chart uses. (Task 3 browser check.)
5. **The popover's bold row:** `plot.dataset.highlight` becomes a set, so the popover's comparison must handle several labels. (Task 2.)

---

### Task 1: The pure parts

**Files:**
- Modify: `static/common/highlight.js` (`parseHighlight`, `highlightedSeries`)
- Modify: `static/charts/src/series.js` (export `labelFor`; the `keep` option)
- Modify: `static/charts/src/rollup.js` (export `SPLIT_LABEL`; the `keep` option)
- Modify: `static/common/test/highlight.test.js`, `static/charts/test/series.test.js`, `static/charts/test/rollup.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `static/common/test/highlight.test.js`, adding `parseHighlight` and `highlightedSeries` to its import:

```js
test('parseHighlight reads airline:{id} and ignores anything else', () => {
  assert.deepEqual(parseHighlight('?highlight=airline:delta&split=carrier'), { kind: 'airline', id: 'delta' });
  for (const s of ['', '?highlight=delta', '?highlight=airline:', '?highlight=version:737-800', '?x=1']) assert.equal(parseHighlight(s), null, s);
});

test('highlightedSeries finds every series an airline group appears in', () => {
  const rows = [{ group_id: 'delta', carrier: 'Delta' }, { group_id: 'delta', carrier: 'Northwest' }, { group_id: 'jetblue', carrier: 'JetBlue' }];
  const label = (r) => r.carrier;
  assert.deepEqual([...highlightedSeries(rows, { kind: 'airline', id: 'delta' }, label)].sort(), ['Delta', 'Northwest']);
  assert.equal(highlightedSeries(rows, { kind: 'airline', id: 'nope' }, label).size, 0);
  assert.equal(highlightedSeries(rows, null, label).size, 0);
});
```

Append to `static/charts/test/series.test.js`:

```js
test('buildSeries keeps a series asked for, even outside the top', () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ year: 2019, carrier: `C${i}`, aircraft: 'A', deps: 1, total_seats: 1, total_passengers: 100 - i, total_freight: 0 }));
  const plain = buildSeries(rows, { top: 8 });
  assert.ok(!plain.series.includes('C9') && plain.series.includes('Other'));
  const kept = buildSeries(rows, { top: 8, keep: new Set(['C9']) });
  assert.ok(kept.series.includes('C9') && kept.series.includes('Other'));
  assert.deepEqual(kept.points.filter((p) => p.series === 'Other').map((p) => p.value), [91]);
});
```

Append to `static/charts/test/rollup.test.js`:

```js
test('buildFamilySeries keeps an airline asked for, even outside the top eight', async () => {
  const { buildFamilySeries } = await import('../src/rollup.js');
  const rows = Array.from({ length: 10 }, (_, i) => ({ year: 2019, group_id: `g${i}`, group_name: `G${i}`, kind: 'passenger', service: 'domestic', passengers: 100 - i }));
  const res = buildFamilySeries(rows, { split: 'airline', keep: new Set(['G9']) });
  assert.ok(res.series.includes('G9') && res.series.includes('Other'));
});
```

Run: `npm test 2>&1 | grep -E "^ℹ (pass|fail)"`
Expected: failures. The new exports don't exist yet, and `keep` is ignored.

- [ ] **Step 2: Implement**

Append to `static/common/highlight.js`:

```js
// ?highlight=airline:{group id}: a series to pick out on arrival, named by id because labels differ between pages
export function parseHighlight(search) {
  const m = /^airline:([A-Za-z0-9_-]+)$/.exec(new URLSearchParams(search || '').get('highlight') || '');
  return m ? { kind: 'airline', id: m[1] } : null;
}

// the chart's series labels whose rows belong to the highlighted airline group
export function highlightedSeries(rows, highlight, labelOf) {
  const out = new Set();
  if (!highlight) return out;
  for (const r of rows) if (r.group_id === highlight.id) out.add(labelOf(r));
  return out;
}
```

In `static/charts/src/series.js`:
- export `labelFor` (`export const labelFor = …`);
- `buildSeries` takes `keep = new Set()` in its options;
- replace `const kept = new Set(ranked.slice(0, top));` with:

```js
  const kept = new Set([...ranked.slice(0, top), ...ranked.filter((l) => keep.has(l))]);
```

- replace `const series = ranked.slice(0, top).filter(…)` with `const series = ranked.filter((l) => kept.has(l) && points.some((p) => p.series === l));`;
- `folded` becomes `ranked.length > kept.size`.

In `static/charts/src/rollup.js`:
- export `SPLIT_LABEL`;
- `buildFamilySeries` takes `keep = new Set()`;
- `kept` becomes `folded ? [...order.slice(0, top), ...order.slice(top).filter((s) => keep.has(s))] : order`;
- `folded` stays `(split === 'airline' || split === 'maker') && order.length > top`.

Run: `npm test 2>&1 | grep -E "^ℹ (pass|fail)"`
Expected: `fail 0`.

- [ ] **Step 3: Commit**

```bash
git add static/common/highlight.js static/common/test/highlight.test.js static/charts/src/series.js static/charts/test/series.test.js static/charts/src/rollup.js static/charts/test/rollup.test.js
git commit -m "Highlight across links, the pure parts: read ?highlight=airline:{id}, find its series, keep them out of Other

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0191mnN3iPgFXTdJ7jQemcY1"
```

---

### Task 2: A pinned set in `attachHighlight`, and the popover

**Files:**
- Modify: `static/common/highlight.js` (`attachHighlight`)
- Modify: `static/common/popover.js` (the bold row)

- [ ] **Step 1: Implement**

`attachHighlight(plot, { pinned = new Set() } = {})` works with sets throughout:
- `set(series)` becomes `show(set)`, taking a Set (empty for none);
- a mark is faded when the set is non-empty and its fill isn't one of the set's colours;
- a legend entry is faded when the set is non-empty and its text isn't in the set;
- `plot.dataset.highlight` is the set joined with `'\n'`;
- the `highlight` event's detail is an array.

Pointing at a segment or legend entry shows `new Set([series])`. Leaving shows `pinned`. A legend tap toggles between `new Set([series])` and `pinned`.

On attach, call `show(pinned)`.

Export `setPinned(plot, set)`, which updates the pinned set and shows it, for "clear". Keep the pinned set on the plot as `plot.__pinned`, or in a WeakMap keyed by plot, so `setPinned` can reach it.

In `static/common/popover.js`, the bold-row test becomes:

```js
      const current = (plot.dataset.highlight || '').split('\n').includes(r.label) ? ' current' : '';
```

- [ ] **Step 2: Check, then commit**

Run: `npm test 2>&1 | grep -E "^ℹ (pass|fail)"`
Expected: `fail 0`.

Restart the scratch server:

```bash
pkill -f "port 8811"; (nohup uv run datasette serve t100.db --config datasette.yml --plugins-dir plugins --template-dir templates --static static:static --port 8811 >/dev/null 2>&1 &)
```

Then run the earlier `hl_check.py` from the scratchpad. Expected: pointing at a segment and at a legend entry still behaves as before, and leaving restores everything. No pin is set yet, so leaving shows nothing faded.

Commit `static/common/highlight.js` and `static/common/popover.js`, with the message "Highlighting takes a set of series and a pinned set it returns to when the pointer leaves".

---

### Task 3: The route and family pages honour the highlight

**Files:**
- Modify: `templates/route.html`, `templates/family.html` (add `<p class="note" id="highlight-line" hidden></p>` directly above the chart's box)
- Modify: `static/charts/routepage.js`, `static/charts/family.js`

- [ ] **Step 1: The route page**

In `routepage.js`:
- import `parseHighlight`, `highlightedSeries` and `setPinned` from the highlight module, and `labelFor` from the series module.

In `drawChart`:
- `const highlight = parseHighlight(location.search);`
- `const byAirline = state.split === 'carrier' || state.split === 'both';`
- `const wanted = byAirline ? highlightedSeries(viewRows, highlight, (r) => labelFor(r, state.split)) : new Set();`. `viewRows` already has short carrier names, from `main()`.
- pass `keep: wanted` to `buildSeries`;
- when the chart is stacked, attach with `attachHighlight(chart, { pinned: wanted })`;
- call `highlightLine(highlight, wanted, byAirline)`.

`highlightLine` is a local function:

```js
// "Highlighting Delta (incl. Northwest) · clear", or why it isn't shown; hidden when there is nothing to say
function highlightLine(highlight, wanted, byAirline) {
  const line = $('highlight-line');
  const name = highlight && allRows.find((r) => r.group_id === highlight.id)?.group_name;
  line.hidden = !name;
  if (!name) return;
  const text = !byAirline ? `${name} isn't shown when split by ${SPLITS[state.split].toLowerCase()}` : wanted.size ? `Highlighting ${name}` : `${name} doesn't appear here`;
  const clear = Object.assign(document.createElement('a'), { href: '#', textContent: 'clear' });
  clear.addEventListener('click', (e) => {
    e.preventDefault();
    const q = new URLSearchParams(location.search);
    q.delete('highlight');
    history.replaceState(null, '', `${location.pathname}${q.size ? `?${q}` : ''}`);
    carryQuery();
    drawChart();
  });
  line.replaceChildren(`${text} · `, clear);
}
```

If `route` query rows lack `group_name`, check `datasette.yml`'s `route` and `route_year` queries. If it's missing there, add it to both queries' select lists: it's in the same table as `group_id`. Record that as a ruling.

- [ ] **Step 2: The family page**

In `family.js`, mirror the route page:
- `highlightedSeries(rows, highlight, SPLIT_LABEL.airline)`, only when `state.split === 'airline'`;
- pass `keep` into `buildFamilySeries`;
- attach with `pinned`;
- draw the same line, with the name from `rows.find((r) => r.group_id === highlight.id)?.group_name`. The split label comes from the page's split menu text.
- "clear" redraws with `draw()`.

- [ ] **Step 3: Check, then commit**

Run: `npm test 2>&1 | grep -E "^ℹ (pass|fail)"` and `uv run pytest -q 2>&1 | tail -1`
Expected: `fail 0`; all pass.

Restart the server. Then check:
- **`/airports/ATL/JFK?split=carrier&highlight=airline:delta`:** some rects are faded and Delta's aren't, the line reads "Highlighting Delta…", and there are no errors.

Commit the four files, with the message "Route and family charts honour ?highlight=airline:{id}: pinned, kept out of Other, with a clear line".

---

### Task 4: The links, and a browser pass

**Files:**
- Modify: `static/charts/airline.js` (`routeCell`)
- Modify: `static/charts/airlineglobe.js` (the panel's "This route over time")
- Modify: `static/charts/routepage.js` (`drawTable`'s aircraft `linkCell`)

- [ ] **Step 1: The three link sites**

- **`airline.js` `routeCell`:** `a.href = `/airports/${r.origin}/${r.dest}?split=carrier&highlight=airline:${group}`;`, where `group` is the page's `data-group`, so a member's page highlights its group.
- **`airlineglobe.js`:** the panel's link is the same, using that page's group. Check which variable holds the group id there (`document.body.dataset.group` or similar).
- **`routepage.js` `drawTable`:** the aircraft cell's href becomes ``t.family && `/aircraft/${slugify(t.family)}${t.groupId ? `?split=airline&highlight=airline:${t.groupId}` : ''}` ``. Only rows split by airline have a `groupId`, so other splits link plainly.

- [ ] **Step 2: Browser checks**

In `highlight_check.py` (Playwright, 1280), check:
1. **From an airline's Changes page:** on `/airlines/delta/changes?from=2019&to=2025`, click the first route link. Expected:
   - the URL has `split=carrier&highlight=airline:delta`;
   - unfaded rects are only Delta's colours, Northwest's too where present;
   - `#highlight-line` reads "Highlighting Delta (incl. Northwest) · clear".
2. **Pinned, then pointing:** point at a non-Delta segment, then leave. Expected: Delta is highlighted again.
3. **Clear:** click "clear". Expected: nothing is faded, and `highlight` is gone from the URL.
4. **From a route's table:** on `/airports/ATL/JFK/table?split=both`, the first aircraft link whose row is Delta goes to `/aircraft/{family}?split=airline&highlight=airline:delta`. Follow it. Expected: the line reads "Highlighting Delta…" and Delta's bars are unfaded.
5. **A small airline outside the top eight:** find a route with more than eight carriers, for example `/airports/ATL/JFK` has nine or more over all years, and pick its smallest carrier's `group_id` from `/t100/route.json?origin=ATL&dest=JFK&_shape=array`. With `highlight=airline:{that}`, its label is in the legend and its bars are unfaded.
6. **An unknown airline:** `/airports/SFO/LHR?highlight=airline:nope`. Expected: no highlight line, nothing faded, no errors.

Run: `uv run --no-project --with playwright python highlight_check.py`
Expected: all six hold.

- [ ] **Step 3: The full suites, and commit**

Run: `npm test 2>&1 | grep -E "^ℹ (pass|fail)"` and `uv run pytest -q 2>&1 | tail -1`
Expected: `fail 0`; all pass.

Commit the three scripts, with the message "Links from an airline to a route, and from a route's row to an aircraft family, carry the airline as a highlight".
