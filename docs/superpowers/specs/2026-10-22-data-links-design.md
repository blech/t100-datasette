# Data links: every page links to the data behind it

## Purpose

Links between the site's subjects **cross**: a link opens the other subject's own page, keeping a **highlight** of where you came from when that page can show it, and keeping settings the destination also has. The site has no filtered views, such as one airline at one airport or on one route, and building them as pages would multiply the views.

Datasette can already narrow. A canned query's page shows each parameter as a field the reader can edit, even with the SQL hidden. Production refuses SQL written by the reader (`default_allow_sql off`) but serves canned queries.

This work gives every page one link, in the same place, to the canned query whose numbers it draws, with the page's current settings filled in. Where narrowing is useful, the query takes an optional airline group to narrow by. The rule, for the roadmap:

> **Pages cross, with highlights; data links narrow.**

## The link

- **Wording:** "This page's data". On a map it reads "This map's data".
- **Place:**
  - On a scrolling page, the footer gains it: "Theme [ ] · Data: the US Department of Transportation's T-100 segment tables · This page's data · About the data".
  - On a map, it sits at the end of the controls row, after the theme menu.
- **Target:** `/t100/{query}?{parameters}&_hide_sql=1`.
  - Every parameter the query takes is in the address, empty when unused, so the form shows them all.
  - The page's script keeps the link in step with its settings, as it does the views line.
- **Pages without one:** the front page (each section leads to a page that has one) and the about page. The footer's link is hidden there.
- **The route pages' "Raw data table" link** in their note is replaced by this one.

## Inventory

| Page | Query | Parameters from the page |
|---|---|---|
| `/airports` | `top_airports` | `year` |
| `/airports/globe` | `top_us_airports` | `year` (the year shown), `sort_column` empty |
| `/airports/{code}` (over time) | `airport_size` | `origin`, `group` empty |
| `/airports/{code}/destinations` | `routes_by_year` | `origin`, `min_deps` empty |
| `/airports/{code}/changes` | `airport_changes` | `origin`, `a`, `b`, `group` empty |
| `/airports/{code}/globe` | `routes_by_year` | `origin`, `min_deps` empty |
| `/airports/{a}/{b}` and `/table` | `route` | `origin`, `dest`, `group` (from `highlight=airline:…`, else empty) |
| `/airports/{a}/{b}/{year}` and `/table` | `route_year` | `origin`, `dest`, `year`, `group` (as above) |
| `/aircraft` | `type_table` | `year` |
| `/aircraft/makers` | `maker_by_year` | none |
| `/aircraft/engines` | `engines_by_year` | none |
| `/aircraft/{family}` | `family_detail` | `family`, `group` (from `highlight=airline:…`, else empty) |
| `/airlines` | `airline_table` | `year` |
| `/airlines/over-time` | `carrier_group_by_year` | none |
| `/airlines/{airline}` | `carrier_group_detail` | `group`, `airline` |
| `/airlines/{airline}/routes` | `carrier_route_by_year` | `group`, `airline` |
| `/airlines/{airline}/changes` | `carrier_route_changes` | `group`, `airline`, `a`, `b` |
| `/airlines/{airline}/globe` | `carrier_routes_year` | `group`, `airline`, `year` (the year shown) |

A page with two charts (an airport's or an airline's Over time) links to the query behind its first chart.

## Narrowing by airline

Five queries gain an optional `:group`, written as the queries already write optional parameters: `(:group = '' OR … = :group)`. Empty means every airline, so each query's results and the pages that fetch it are unchanged.
- `route` and `route_year`: by the group the segment's carrier belongs to, as their `group_id` column already finds it. This gives an airline on a route.
- `family_detail`: by `group_id`. This gives a family as one airline flew it.
- `airport_size` and `airport_changes`: by the group they already find. This gives an airline at an airport: its size by year, and its destinations gained and lost.

A page that arrived with `highlight=airline:{group}` fills `group` in its data link. The reader can otherwise type a group id into the field on the data page.

## The data pages

- **A title and description** for each query in the inventory, in `datasette.yml`.
  - The title names what the rows are, such as "Departures from an airport, by year, airline group, service and kind". Datasette shows it in place of the SQL that heads the page today ("t100: WITH cn AS (").
  - The description is one sentence: what each row is, and that counts are departures from the origin where that applies. Queries that take `group` add "Leave group empty for every airline".
- Nothing else about Datasette's pages changes.

## The about page

Under "Source", a short paragraph:
- every page links to the data it draws;
- the fields at the top of a data page can be changed, including `group` (an airline group's id, as in its page's address);
- the raw `t100` table can be browsed and filtered by column, with BTS's own codes.

## Pieces

- **`templates/_footer.html`:** `<a id="data-link" href="" hidden>This page's data</a>`, between the data credit and "About the data", with its separator hidden along with it.
- **`templates/globe.html`, `templates/airline_globe.html`:** the same link (with "This map's data") after `#theme`.
- **`templates/route.html`, `templates/route_table.html`:** the note's "Raw data table" link is removed. `routepage.js` sets the footer link instead.
- **`static/common/datalink.js`:** `dataHref(query, params) → string` (pure, tested), and `setDataLink(query, params)`, which sets `#data-link`'s href and unhides it.
- **Page scripts:** each calls `setDataLink` when it fetches, and again when its settings change: the scripts for every page in the inventory.
- **`datasette.yml`:** the five optional `group` parameters, and the titles and descriptions.
- **`templates/about.html`:** the paragraph.
- **`docs/site-coherence.md`:** the rule under bucket 4, which settles "Narrowing down, or back to the top?"

## Out of scope

- Allowing SQL written by the reader, or `_where=`.
- Styling Datasette's own pages to match the site.
- Links into the raw `t100` table from the site's pages: the about page mentions it, but BTS's codes don't match the site's groups and families.
- Carrying the year from the airlines and aircraft tables and from an airport's Changes rows: the gaps found with the rule above, kept for their own change.

## Testing

**Python (pytest):**
- Each of the five queries with `group` empty returns what it returned before.
- With a group set, each returns only that group's rows: the seeded United and Delta segments at SFO, and on SFO–JFK; a family flown by both.
- Each query in the inventory has a title and a description.
- Every scrolling page has `id="data-link"` in its footer, and both maps have it in their controls.
- The route pages' notes no longer have "Raw data table".
- The about page's "Source" section mentions the data links.

**JavaScript (`node --test`):**
- `dataHref`:
  - gives `/t100/route?origin=SFO&dest=JFK&group=&_hide_sql=1`;
  - keeps every parameter, empty or not, in the order given;
  - encodes values.

**In a browser (headless Playwright), against the real database:**
- On every page in the inventory, `#data-link` is shown, and its href opens a 200 page whose title isn't SQL.
- Changing a setting updates the link:
  - the year on `/airlines`;
  - the years on an airport's Changes;
  - the year on an airline's map (an airport's map links `routes_by_year`, which takes no year).
- `/airports/SFO/JFK?split=carrier&highlight=airline:united` links to `route` with `group=united`, and that page's rows are all United's.
- The front page and the about page show no data link.
- There are no page errors.
