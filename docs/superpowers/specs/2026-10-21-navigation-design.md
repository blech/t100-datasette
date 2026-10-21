# Navigation

## Purpose

Every page has a breadcrumb, but the only way to move between the site's sections is the front page. Under the breadcrumb, each template has its own hand-written line of related links (`<p class="related">`), mixing three kinds of link:
- **parents**, which repeat the breadcrumb ("All aircraft families");
- **siblings**, chosen ad hoc ("Airlines" on `/aircraft`, while Airports appears nowhere);
- **other views** of the page's subject ("Map of SFO").

This change gives each kind of link one consistent home:
- the **sections** in the header;
- the **parent** in the breadcrumb;
- **other views of this subject** in a views line under the breadcrumb.

The theme chooser moves to a footer to make room. This is bucket 3 of `docs/site-coherence.md`.

## Header

The shared header (`templates/_nav.html`) holds two things:
- **Left:** the breadcrumb, unchanged.
- **Right:** the site's sections, **Airports · Aircraft · Airlines · About**.
  - The current section is bold and unlinked, with `aria-current="page"` when the page *is* the section's index, otherwise `aria-current="true"`.
  - The front page marks none.
  - It's a `<nav aria-label="Sections">`, a list styled like the breadcrumb: no bullets, separated by spaces, not slashes.

The current section comes from the path's first segment: `airports`, `aircraft`, `airlines` or `about`.

**On phones** (below 600px wide), the header stacks: the breadcrumb on its first line or lines, then the sections on a line of their own. Nothing in the header scrolls sideways.

The theme chooser (`<select id="theme">`) leaves the header.

## The views line

The views line replaces every `<p class="related">` under the breadcrumb:
- a full-width 1px rule in `var(--rule)`;
- beneath it, the subject's views as small links in `var(--muted)`, separated by a middle dot;
- the current view in bold, in `var(--fg)`, and unlinked, with `aria-current="page"`.

It's a `<nav class="views" aria-label="Views">`. It is left out entirely when a subject has only one view.

| Page | Views (current in bold) |
|---|---|
| `/airports` | **Busiest airports** · Map |
| `/airports/globe` | Busiest airports · **Map** |
| `/airports/{code}` | **Routes over time** · Map |
| `/airports/{code}/globe` | Routes over time · **Map** |
| `/airports/{a}/{b}`, `/airports/{a}/{b}/{year}` | **{a} → {b}** · {b} → {a} |
| `/aircraft` | **Families** · Long-haul engines |
| `/aircraft/engines` | Families · **Long-haul engines** |
| `/airlines/{airline}` | **Overview** · Map |
| `/airlines/{airline}/globe` | Overview · **Map** |
| `/`, `/airlines`, `/aircraft/{family}`, `/about` | (none) |

- **Links carry state.** A route's reverse-direction link keeps the year: `/airports/LHR/SFO/2019`. Links that scripts update today keep their ids, so the scripts keep updating them:
  - `id="map-link"` on an airline's page (year and comparison) and on a route's page (year);
  - `id="table-link"` on the airline map.
- **The maps' picker rows lose their view links.** The airport map's "Routes over time" and the airline map's "All charts for this airline" are now the views line's "Routes over time" and "Overview". Links that aren't views stay:
  - "Data tables" on the airport map;
  - "Routes dropped and added, as a table" on the airline map.
- **What's dropped:**
  - Parent links: "All aircraft families" on `/aircraft/engines` and the family pages, and "All airlines" on an airline's page. The breadcrumb covers them.
  - Sibling links: "Airlines" on `/aircraft` and "Aircraft families" on `/airlines`. The sections cover them.
  - Cross-subject links: "LHR routes over time" and "Map of SFO" on a route.
- **The route page's cross-subject links** go into the page's own text, where they read naturally: "Each direction is a route of its own. More from SFO: [routes over time] · [map]." That paragraph sits under the years nav.

## Footer

A new shared footer, `templates/_footer.html`, appears on every page that scrolls: the front page, `/airports`, `/aircraft`, `/aircraft/engines`, the family pages, `/airlines`, an airline's page, an airport's routes, a route and `/about`. It's a 1px `var(--rule)` rule, then a line in `var(--muted)`, 13px:

> Theme [Auto ▾] · Data: the US Department of Transportation's T-100 segment tables · About the data

- The theme chooser keeps `id="theme"` and its current behaviour (Auto, Light, Dark), so `static/nav/main.js` works unchanged.
- "About the data" links to `/about`.

**On the map pages** (`/airports/globe`, `/airports/{code}/globe`, `/airlines/{airline}/globe`), which fill the window and have no footer, the theme chooser goes at the end of the bottom controls bar (`#controls .row`). It's the same element with the same id.

## Pieces

**`plugins/t100_globe.py`:**
- `section_of(path) → 'airports' | 'aircraft' | 'airlines' | 'about' | None`. Pure.
- `views_for(path, **ids) → [{ label, href, current }]`. Pure; it holds the table above. `ids` are the parts of the path a link needs (origin, destination, year, airline slug).
- Each page handler passes `section` and `views` into its template context, next to `crumbs`. The context is built in one place per handler, as `crumbs` is now.

**Templates:**
- `_nav.html` gains the sections and the views line, and loses `#theme`.
- `_footer.html` is new. It's included at the end of `<main>` on the scrolling pages, and the maps' templates move `#theme` into `#controls`.
- Every `<p class="related">` that held view, parent or sibling links is removed. The airline page's second `.related` (`#full-name`) and the member years' `.related` spans are styling, not navigation, and stay.

**CSS** in `static/nav/style.css`:
- the sections;
- the views line: `.views`, rule, muted links, bold current;
- the footer;
- the phone breakpoint.

`.related`'s rule in `static/charts/style.css` stays for the styling uses.

## Out of scope

- Which views each subject *should* have, and links across subjects, such as an airport's map leading to an airline's map. That's bucket 4.
- Colour (bucket 5).
- The "Aircraft by maker" page under way in another session. When it lands, it joins `/aircraft`'s views as a third entry.

## Testing

**Python (pytest):**
- `section_of` for every page type and the front page.
- `views_for` for every row of the table, including the route's reverse link keeping the year.
- **Every page in the table:**
  - the header has the four sections, with the right one current (or none on `/`);
  - the views line is present with the right current view, or absent;
  - there's no `<p class="related">` with links.
- **Every scrolling page** has one `#theme`, in the footer. **Every map page** has one `#theme`, inside `#controls`.
- Existing tests that look for removed links ("All airlines", "All aircraft families", "Map of SFO", the maps' "Routes over time") are updated to the new places.

**In a browser (headless Playwright):**
- At 390px on `/airlines/delta` and `/airports/SFO/LHR/2019`, the sections sit on their own line under the breadcrumb, and the page doesn't scroll sideways because of the header.
- The views line shows a full-width rule with the current view in bold.
- Changing the theme from the footer, and on `/airports/SFO/globe` from the controls bar, switches the page to Dark and is remembered on the next page, as it is today.
- Screenshots in light and dark, at desktop and phone widths.
