# Datasette pages in the site's style: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Datasette's own pages (database index, table, canned query, row, error) get the site's white header, breadcrumb and footer, in the light theme only, with Datasette's compact tables unchanged.

**Architecture:** `templates/base.html` extends `default:base.html` and overrides blocks only: `extra_head` links `static/datasette/style.css`, and `nav` renders a new `_data_header.html` in place of Datasette's bar. The stylesheet maps the site's light tokens onto Datasette's classes and comes after `app.css`.

**Tech Stack:** Jinja, Datasette 1.0a41 templates (async `crumb_items`), plain CSS, pytest, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-06-datasette-pages-design.md`

## Global Constraints

- Light only: no `prefers-color-scheme` block, `color-scheme: light`, `base.css` and `static/nav/main.js` are not loaded on these pages.
- Datasette's own templates are not copied; `base.html` overrides blocks only.
- The breadcrumb reads `{site_name} / data[ / table or query]`; `site_name` is `plugins: t100_globe` → `site_name`, default `t100.husk.org`. The database crumb's label is `data`.
- Sections line (Airports · Aircraft · Airlines · About) shown with none current; no views line; no hamburger menu.
- Tables keep Datasette's padding, font sizes and layout; only colours move to the site's tokens.
- Don't touch `templates/changelog.html`; keep README.md in step.

## Review Focus

- A database other than `t100` (Datasette allows more): its crumb must still read sensibly, so only `t100` is relabelled `data`.
- A page with no database (the `/-/` index, an error page): the breadcrumb is the site name alone as the current page, with no stray separator.
- A table name containing HTML characters: escaped in the crumb.
- The site's own pages are unchanged (`t100_base.html` and `_nav.html` are not touched).
- The footer's existing "no theme menu or data link on Datasette pages" behaviour still holds.

---

### Task 1: The header, base template and stylesheet link

**Files:**
- Create: `templates/base.html`, `templates/_data_header.html`, `static/datasette/style.css` (empty placeholder with a comment, filled in Task 2)
- Test: `tests/test_datasette_pages.py`

**Interfaces:**
- Produces: `templates/_data_header.html`, which uses Datasette's async `crumb_items(request=request, database=database, table=table)`; the site name comes from `site_name`, which `plugins/t100_globe.py` `extra_template_vars` supplies for every request (`nav_site`).
- Produces: the stylesheet `/static/datasette/style.css`, linked after `app.css`.

- [ ] **Step 1: Write the failing tests** in `tests/test_datasette_pages.py`, using `get(ds, path)` from `tests/helpers.py`:
  - `test_the_database_page_has_the_site_header`: `/t100` contains `t100.husk.org`, a crumb link to `/t100` labelled `data` with `aria-current="page"` on it, the four section links, and no `class="hd"`.
  - `test_a_table_page_has_data_then_the_table_in_the_trail`: `/t100/t100` has `data` as a link to `/t100` and the table name as the current page.
  - `test_a_canned_query_page_has_the_header`: `/t100/airports` (a canned query) has the site header and no `class="hd"`.
  - `test_the_index_page_trail_is_the_site_name_alone`: `/-/` has `t100.husk.org` as the current page and no `/` separator list item after it.
  - `test_another_database_keeps_its_own_name`: the label rule is unit-tested through a small function `crumb_label(database)` returning `data` for `t100` and the name otherwise (see Step 3).
  - `test_the_stylesheet_follows_app_css`: in `/t100` the `/static/datasette/style.css` link appears after `app.css`.
  - `test_the_site_pages_are_unchanged`: `/about` has no `datasette/style.css` link.
- [ ] **Step 2: Run** `uv run pytest tests/test_datasette_pages.py -q`; expect FAIL.
- [ ] **Step 3: Implement.**
  - `plugins/t100_globe.py`: `crumb_label(database: str) -> str` (`"data"` for `"t100"`, else the name), exposed to templates through the existing `extra_template_vars` as `nav_crumb_label`, together with `nav_site` (the configured site name).
  - `templates/base.html`: `{% extends "default:base.html" %}`; block `extra_head` links the stylesheet and adds `<meta name="color-scheme" content="light">`; block `nav` includes `_data_header.html`.
  - `templates/_data_header.html`: the markup of `_nav.html`'s `.site-header` (`nav.crumbs > ol`, `nav.sections > ul`), with items from `crumb_items`; the first item (Datasette's "home") is replaced by `nav_site`, the database item uses `nav_crumb_label(database)`, the last item is plain text with `aria-current="page"`, the rest are links; with no items, the site name alone. Autoescape on. Link `/static/nav/style.css` too (in `extra_head`) so `.crumbs`/`.sections` rules apply.
- [ ] **Step 4: Run** the new tests and `uv run pytest -q`; expect PASS (the footer test in `tests/test_data_links.py` must still pass).
- [ ] **Step 5: Commit** "Datasette's own pages get the site's header".

### Task 2: The stylesheet

**Files:**
- Modify: `static/datasette/style.css`
- Create: `static/datasette/test/style.test.js`

**Interfaces:**
- Consumes: Task 1's linked stylesheet and `.site-header` markup.

- [ ] **Step 1: Write the failing test** `static/datasette/test/style.test.js` (run by `npm test`): the stylesheet's `:root` light tokens (`--bg`, `--fg`, `--muted`, `--line`, `--rule`, `--accent`) equal `static/common/base.css`'s light `:root`; it contains no `prefers-color-scheme`; it sets `color-scheme: light`.
- [ ] **Step 2: Run** `npm test`; expect FAIL.
- [ ] **Step 3: Implement the stylesheet.** Define the light tokens; body background `var(--bg)`, colour `var(--fg)`, font as `base.css`'s body; hide `header.hd` chrome by giving the `.site-header` wrapper the site's spacing and `section.content` a centred column of the site's width; `footer.ft` transparent with no gradient and `var(--muted)` text and links; links `var(--fg)` underlined as on the site; results table, filters, facets, parameter form and buttons: only borders, header cells, hover rows and the grey panels (`p.zero-results`) moved to `var(--line)` / `var(--bg)`, no size or spacing changes.
- [ ] **Step 4: Run** `npm test` and `uv run pytest -q`; expect PASS.
- [ ] **Step 5: Look at it** on a spare port (`uv run datasette --port 8818 .`, never 8808): `/-/`, `/t100`, a table with filters and facets, a canned query with parameters, a row and an error page, at desktop and 390px widths; fix what looks wrong. Stop the server.
- [ ] **Step 6: Commit** "Datasette's own pages: white, in the site's colours, compact tables kept".

### Task 3: Docs

**Files:**
- Modify: `README.md` (the `templates/` and `static/` descriptions), `docs/site-coherence.md` (mark the backlog item done), `CLAUDE.md` (the `templates/` line: `base.html` is Datasette's, `t100_base.html` is the site's)

- [ ] **Step 1:** Make those edits; leave `templates/changelog.html` alone and say in the summary that the change may merit an entry.
- [ ] **Step 2: Run** `uv run pytest -q` and `npm test`; expect PASS.
- [ ] **Step 3: Commit** "Document the Datasette page styling".
