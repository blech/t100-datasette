# Views, part 2: carrying a highlight across links

## Purpose

This is sub-project 2 of bucket 4 in `docs/site-coherence.md`. When a link crosses from one subject to another, the destination opens on its own full page with the series you came from already picked out. Nothing is filtered: the thread you were following stays visible, and one click clears it.

Two kinds of link carry it:
- **Airline to route:** from an airline's Changes table and from its map's route panel, a route opens split by airline, with that airline highlighted. A merged airline such as Delta (incl. Northwest) highlights all of its member airlines.
- **Route row to aircraft family:** from a route's table, an aircraft cell such as "Delta · 737-800" opens the family's chart split by airline, with that row's airline highlighted.

## The parameter

`?highlight=airline:{group id}`, for example `?highlight=airline:delta`.

- The prefix names the kind of thing, so other kinds can come later.
- Pages that don't use a kind ignore it.
- An airline is named by its **group id**, not its label, because labels differ between pages. "Delta (incl. Northwest)" on the airline page is "Delta Air Lines" plus "Northwest Airlines Inc." on a route chart.

## At the destination

**Series lookup.** The new pure function `highlightedSeries(rows, highlight, labelOf)` returns the set of series labels whose rows have `group_id` equal to the highlight's id.
- On a route split by carrier, the labels are carrier names.
- On a family split by airline, they're group names.
- A malformed or unknown highlight gives an empty set.

**Never folded into "Other".** The route chart (`buildSeries`) and the family chart (`buildFamilySeries`) keep their top eight series and fold the rest into "Other". They gain a `keep` option, a set of labels kept as their own series. A highlighted airline outside the top eight **takes the eighth place**, and the eighth-ranked series folds into "Other" instead. There are never more than eight named series, so each keeps a colour of its own. Split by carrier and aircraft, nothing is forced in: only the airline's pairings already in the top eight are picked out. (Revised after the final review: a ninth series shared the eighth's colour, and keeping every pairing of a big airline swamped the chart.)

**Pinned highlight.** `attachHighlight(plot, { pinned })` in `static/common/highlight.js` changes in three ways:
- It takes a set of series, not one.
- A `pinned` set (from the URL) is shown when the chart draws.
- Pointing at another series or legend entry highlights that one while pointing, and leaving returns to the pinned set rather than to nothing.

**The highlight line.** A line above the chart reads "Highlighting {name} · clear":
- the name is the airline group's display name, from the rows' `group_name`;
- "clear" removes `highlight` from the query with `history.replaceState` and redraws without it.

If the set is empty because the airline didn't fly this route or family, the line instead reads "{name} doesn't appear here · clear", and the chart draws normally. If even the name is unknown (no rows mention the id), the line is left out.

**Split.** A link that carries an airline highlight also sets the split that shows airlines: `split=carrier` on a route, `split=airline` on a family.
- If the visitor later changes the split to one without airlines, the highlight line says "{name} isn't shown when split by {split} · clear", and nothing is highlighted.
- The highlight stays in the query, so switching back restores it.

**Carrying.** `highlight` is part of the query, so the views line, years nav and reverse-direction links on a route carry it already (views part 1's `carryQuery`).

## The links

| From | Link | Becomes |
|---|---|---|
| An airline's Changes table (`static/charts/airline.js` `routeCell`) | `/airports/{o}/{d}` | `/airports/{o}/{d}?split=carrier&highlight=airline:{group}` |
| An airline map's route panel (`static/charts/airlineglobe.js`, "This route over time") | `/airports/{o}/{d}` | the same |
| A route's table, aircraft cell (`static/charts/routepage.js` `drawTable`) | `/aircraft/{family slug}` | `/aircraft/{family slug}?split=airline&highlight=airline:{row's groupId}`, when the row has an airline; otherwise unchanged |

`{group}` is the page's own group, `group` from the page's data, so a member airline's page (Northwest) still highlights its parent group's bands.

## Pieces

- **`static/common/highlight.js`:**
  - `parseHighlight(search) → { kind, id } | null`;
  - `highlightedSeries(rows, highlight, labelOf) → Set`;
  - `attachHighlight(plot, { pinned })`.
- **`static/charts/src/series.js` `buildSeries`, `static/charts/src/rollup.js` `buildFamilySeries`:** the `keep` option.
- **`static/charts/routepage.js`, `static/charts/family.js`:** read the highlight, pass `keep`, attach with `pinned`, render the highlight line into a new `<p class="note" id="highlight-line" hidden>` above the chart (in `route.html` and `family.html`), and wire "clear".
- **The three link sites above.**

## Out of scope

- Highlighting routes on maps.
- Other highlight kinds (an aircraft version, a maker).
- The route table and the airline pages as destinations: they have no series to pick out.

## Testing

**JavaScript (`node --test`):**
- `parseHighlight`: a valid value, a missing one, a malformed one (`delta`, `airline:`), and an unknown kind.
- `highlightedSeries`:
  - a merged group's rows give both members' carrier labels;
  - family rows give the group name;
  - an unknown id gives an empty set.
- `buildSeries` with `keep`: a ninth airline stays its own series and isn't in "Other", and "Other" still totals the rest.
- `buildFamilySeries` with `keep`: the same, for split by airline.

**In a browser (headless Playwright):**
- From `/airlines/delta/changes?from=2019&to=2025`, follow a dropped route's link. The route opens with `split=carrier&highlight=airline:delta`, Delta's (and Northwest's, where present) bands are unfaded, other rects are faded, and the line reads "Highlighting Delta (incl. Northwest) · clear".
- Click "clear": nothing is faded, and `highlight` is gone from the URL.
- Pointing at JetBlue then leaving: the pinned highlight returns.
- From `/airports/ATL/JFK/table?split=both`, the "Delta · 737-…" row's aircraft link opens `/aircraft/boeing-737?split=airline&highlight=airline:delta`, with Delta highlighted.
- A small airline outside the top eight on a route (find one in the data) is a series of its own and highlighted.
- `/airports/SFO/LHR?highlight=airline:nope` draws normally, with no highlight line and no errors.
