# Datasette's own pages in the site's style

## Purpose

The site's pages share one frame (`t100_base.html`, `static/common/base.css`, the header in `_nav.html`). Datasette's own pages don't: the database index, the `t100` table browser, canned query results, single rows and the JSON/error pages still wear Datasette's default look. A reader following "This page's data" from a chart lands on a blue-gradient bar saying "home / t100" on an off-white page, which reads as leaving the site.

This change makes those pages look like part of the site, in the light theme only. It carries out the backlog item at the end of bucket 6 in `docs/site-coherence.md` ("Datasette's own pages in the site's style, light mode only"), which the data-links spec (`2026-10-22-data-links-design.md`) listed as out of scope.

## What changes

**Header.** Datasette's blue gradient bar (`header.hd`) becomes the site's plain header: white, with the same breadcrumb and section links as the other pages.
- The breadcrumb starts with the site name (`site_name` under `plugins: t100_globe`, default `t100.husk.org`) in place of "home".
- The database crumb reads **data**, not `t100`: `t100.husk.org / data`. A table or canned query follows it as today: `t100.husk.org / data / airports`.
- The sections line (Airports · Aircraft · Airlines · About) sits at the right as on the site's pages, with no section marked as current. The views line is left out.

**Background and text.** The page background goes from Datasette's off-white (`#F8FAFB`) to the site's white (`--bg`), and text, links and rules take the site's colours. The body font and size match the site's (15px Helvetica stack).

**Footer.** Datasette's blue `footer.ft` bar loses its gradient and colour, so the site's own footer line (already shown there by name, with the credit and the about link) sits on white like every other page.

**Tables stay compact.** The results table (`.rows-and-columns`), the table browser's filters and facets, the parameter form and the buttons keep Datasette's compact default layout and sizes. Only colours that clash with the new white page (borders, header cells, hover rows) are mapped to the site's tokens; no padding, font-size or layout of the table changes.

## Constraints

- **Light only.** The stylesheet defines the light tokens and sets `color-scheme: light`. It has no `prefers-color-scheme` block, so it doesn't link `base.css` (which has one), and the page doesn't load `static/nav/main.js`, so the theme menu doesn't exist there. A reader whose system is dark gets a light data page, as now. Dark mode is a possible later step of its own.
- **Datasette's templates aren't copied.** A new `templates/base.html` extends `default:base.html` and overrides blocks only (`extra_head`, `nav`, and the `ft` footer wrapper if needed), so Datasette upgrades need no merging. Datasette's `app.css` stays loaded underneath; the site's stylesheet comes after it and overrides.
- **Name clash.** Datasette's base imports its breadcrumb macros as `crumbs`, so the site's `_nav.html` (which reads a `crumbs` list) can't be included as it is. The data pages use their own partial, `_data_header.html`, built from Datasette's `crumb_items`, and the markup and classes match `_nav.html` so `static/nav/style.css` styles both. (`t100_base.html` is the site pages' base and is unaffected.)
- **No dist or script changes.** The bundle's entry points are unchanged.
- **Numbers and colours rules still apply:** no new data colours (this is chrome only), and nothing formats numbers.

## Anti-goals

- No dark mode on these pages.
- No change to the table's density, and no attempt yet to unify it with the site's own tables. That is a possible later change, perhaps with a more compact site-wide design, and this stylesheet should make it easy by using the same tokens.
- No restyling of Datasette's admin/debug pages beyond what the shared header and background give them for free.

## Testing

**Python:**
- `/t100` (database index), a table, a canned query result and a row each render: the site name and `data` in the breadcrumb, the sections line, no `class="hd"` gradient bar, the stylesheet linked after `app.css`, and the site footer.
- The breadcrumb's last item is plain text and earlier ones are links; the table and query pages carry their own crumb after `data`.
- A test holds the light tokens in the new stylesheet to the `:root` values in `static/common/base.css`, as the existing base test does for `themes.js`.
- Site pages' output is unchanged (the existing 760-odd tests).

**By eye** (own instance on another port, never 8808): `/t100`, a table with filters and facets, a canned query with parameters, a row and an error page, at desktop and 390px widths.

## Calls I've made (check these)

- **Sections line shown** on Datasette pages, with nothing highlighted. The alternative is the breadcrumb alone.
- **Datasette's hamburger menu is not shown.** Its only use here is "Jump to…", which still works with the `/` key (the navigation-search element isn't part of the header). Nothing else is in the menu on this site, which has no logins.
- **"data"** is the database crumb's label for every database (there is only `t100`); it links to `/t100`.
- **Grey means the page background** (`#F8FAFB`) and any matching grey panels; I haven't removed other Datasette greys, such as zero-result messages and hover rows, beyond mapping them to the site's `--line` and `--bg`.
- **The stylesheet** is `static/datasette/style.css`, linked from `extra_head`.
