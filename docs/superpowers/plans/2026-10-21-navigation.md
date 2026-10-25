# Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every page's header carries the four sections (current one bold). Under the breadcrumb, a views line shows the other views of the page's subject on a 1px rule. The theme chooser moves to a new footer, or to the maps' controls bar. This replaces the hand-written `.related` lines.

**Architecture:**
- Two pure functions in `plugins/t100_globe.py`, `section_of(path)` and `views_for(path)`, hold the rules.
- A Datasette `extra_template_vars` hook adds their results to every template, so no handler changes.
- `_nav.html` renders the sections and views. A new `_footer.html` holds the theme chooser.

**Tech Stack:** Datasette plugin (Python, Jinja), pytest, plain CSS; headless Playwright for the browser checks.

**Spec:** `docs/superpowers/specs/2026-10-21-navigation-design.md`

## Global Constraints

- **Sections:** in this order, **Airports · Aircraft · Airlines · About**, linking to `/airports`, `/aircraft`, `/airlines` and `/about`. The current one is bold and unlinked. The front page marks none.
- **Views line:** a full-width 1px rule in `var(--rule)`, then the views in `var(--muted)`, separated by " · ". The current view is bold, in `var(--fg)`, unlinked, with `aria-current="page"`. It's left out when a subject has fewer than two views.
- **Theme chooser:** keeps `id="theme"`. `static/nav/main.js` doesn't change.
- **Phones:** below 600px the header stacks, with the sections on their own line. The header never makes the page scroll sideways.
- **Branch:** `navigation`, off `main`. Never push.
- **Commits** end with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_0191mnN3iPgFXTdJ7jQemcY1
  ```

## Rulings made while planning

- **Context comes from a hook, not each handler.** `section` and `views` come from `extra_template_vars`, using `request.path`, instead of each handler passing them as the spec says. It's one place, can't be forgotten on a new page, and is driven by the same path the views table is keyed on. *Cost if wrong:* moving two lines into each handler.
- **`views_for(path)` takes only the path,** not `**ids`. Every id a view link needs is in the path itself.
- **Ids on view links.** The airline page's "Map" view keeps `id="map-link"`, because `static/charts/airline.js` rewrites its href. The route page's map link moves into the "More from {origin}" paragraph with `id="map-link"`, because `static/charts/routepage.js` rewrites it. The airport heat-map page's "Map" link loses its id, since no script uses it.

## Review Focus

1. **Upper- and lower-case codes:** `/airports/atl/lax/2024` must give views with upper-case codes and the reverse direction `/airports/LAX/ATL/2024`. (Task 1 tests.)
2. **Paths no view covers,** such as `/t100/...` (Datasette's own pages), `/-/derived` and `/airlines` itself: `section_of` and `views_for` must give the right section and no views, and must not raise. (Task 1 tests.)
3. **A narrow phone with a long airline name:** the breadcrumb wraps, the sections take their own line, and nothing makes the page wider than 390px. (Task 4 measures `scrollWidth`.)
4. **The theme chooser on a map page:** inside `#controls`, it must still switch the theme and be remembered. (Task 4.)
5. **Datasette's own pages** (table and query pages) use their own templates, not `_nav.html`. The hook must not break them. It returns context only, and unknown keys are ignored. (Task 1 renders `/t100`.)

---

### Task 1: Sections and views, as rules and template context

**Files:**
- Modify: `plugins/t100_globe.py`: add `section_of`, `views_for` and an `extra_template_vars` hook
- Create: `tests/test_navigation.py`

**Interfaces:**
- Produces:
  - `section_of(path) → 'airports' | 'aircraft' | 'airlines' | 'about' | None`;
  - `views_for(path) → [{'label', 'href', 'current', 'id'}]`, where `id` is `None` or a string;
  - template variables `section` and `views` on every page rendered with a request.

- [ ] **Step 0: Branch**

```bash
git checkout -b navigation main
```

- [ ] **Step 1: Write the failing tests**

Create `tests/test_navigation.py`:

```python
import pytest

from plugins.t100_globe import section_of, views_for
from tests.helpers import get


@pytest.mark.parametrize("path, section", [
    ("/", None), ("/airports", "airports"), ("/airports/globe", "airports"), ("/airports/ATL/LAX/2024", "airports"),
    ("/aircraft", "aircraft"), ("/aircraft/engines", "aircraft"), ("/aircraft/boeing-737", "aircraft"),
    ("/airlines", "airlines"), ("/airlines/delta/globe", "airlines"), ("/about", "about"),
    ("/t100/airports", None), ("/-/derived", None),
])
def test_section_of(path, section):
    assert section_of(path) == section


def views(path):
    return [(v["label"], v["href"], v["current"]) for v in views_for(path)]


def test_airports_views():
    assert views("/airports") == [("Busiest airports", "/airports", True), ("Map", "/airports/globe", False)]
    assert views("/airports/globe") == [("Busiest airports", "/airports", False), ("Map", "/airports/globe", True)]


def test_an_airports_views_use_upper_case_codes():
    assert views("/airports/sfo") == [("Routes over time", "/airports/SFO", True), ("Map", "/airports/SFO/globe", False)]
    assert views("/airports/SFO/globe") == [("Routes over time", "/airports/SFO", False), ("Map", "/airports/SFO/globe", True)]


def test_a_route_offers_its_other_direction_keeping_the_year():
    assert views("/airports/SFO/LHR") == [("SFO → LHR", "/airports/SFO/LHR", True), ("LHR → SFO", "/airports/LHR/SFO", False)]
    assert views("/airports/atl/lax/2024") == [("ATL → LAX", "/airports/ATL/LAX/2024", True), ("LAX → ATL", "/airports/LAX/ATL/2024", False)]


def test_aircraft_and_airline_views():
    assert views("/aircraft") == [("Families", "/aircraft", True), ("Long-haul engines", "/aircraft/engines", False)]
    assert views("/aircraft/engines") == [("Families", "/aircraft", False), ("Long-haul engines", "/aircraft/engines", True)]
    assert views("/airlines/delta") == [("Overview", "/airlines/delta", True), ("Map", "/airlines/delta/globe", False)]
    assert views("/airlines/delta/globe") == [("Overview", "/airlines/delta", False), ("Map", "/airlines/delta/globe", True)]


def test_the_airline_pages_map_view_keeps_the_id_its_script_rewrites():
    assert [v["id"] for v in views_for("/airlines/delta")] == [None, "map-link"]


@pytest.mark.parametrize("path", ["/", "/airlines", "/aircraft/boeing-737", "/about", "/t100", "/-/derived", "/airports/SFO/LHR/2019/x"])
def test_pages_with_one_view_have_none(path):
    assert views_for(path) == []


def test_datasettes_own_pages_still_render(ds):
    assert get(ds, "/t100").status_code == 200
```

Run: `uv run pytest -q tests/test_navigation.py`
Expected: FAIL with `ImportError: cannot import name 'section_of'`.

- [ ] **Step 2: Write the functions and the hook**

In `plugins/t100_globe.py`, add this after `def trail(...)`:

```python
SECTIONS = ("airports", "aircraft", "airlines", "about")
AIRPORT_CODE = re.compile(r"^[A-Za-z0-9]{3}$")


def section_of(path):
    """The site section a path belongs to, from its first segment; None for the front page and Datasette's own pages."""
    first = path.strip("/").split("/")[0]
    return first if first in SECTIONS else None


def views_for(path):
    """The other views of the subject a page shows, for the views line under the breadcrumb: [{label, href, current, id}].
    Empty when the subject has only one view (or the path is not one of the site's pages)."""
    parts = [p for p in path.strip("/").split("/") if p]

    def make(*items, current):
        return [{"label": label, "href": href, "current": i == current, "id": id_} for i, (label, href, id_) in enumerate(items)]

    match parts:
        case ["airports"]:
            return make(("Busiest airports", "/airports", None), ("Map", "/airports/globe", None), current=0)
        case ["airports", "globe"]:
            return make(("Busiest airports", "/airports", None), ("Map", "/airports/globe", None), current=1)
        case ["airports", code] if AIRPORT_CODE.match(code):
            c = code.upper()
            return make(("Routes over time", f"/airports/{c}", None), ("Map", f"/airports/{c}/globe", None), current=0)
        case ["airports", code, "globe"] if AIRPORT_CODE.match(code):
            c = code.upper()
            return make(("Routes over time", f"/airports/{c}", None), ("Map", f"/airports/{c}/globe", None), current=1)
        case ["airports", a, b, *rest] if AIRPORT_CODE.match(a) and AIRPORT_CODE.match(b) and len(rest) <= 1 and b.lower() != "globe":
            a, b = a.upper(), b.upper()
            year = f"/{rest[0]}" if rest else ""
            return make((f"{a} → {b}", f"/airports/{a}/{b}{year}", None), (f"{b} → {a}", f"/airports/{b}/{a}{year}", None), current=0)
        case ["aircraft"]:
            return make(("Families", "/aircraft", None), ("Long-haul engines", "/aircraft/engines", None), current=0)
        case ["aircraft", "engines"]:
            return make(("Families", "/aircraft", None), ("Long-haul engines", "/aircraft/engines", None), current=1)
        case ["airlines", slug]:
            return make(("Overview", f"/airlines/{slug}", None), ("Map", f"/airlines/{slug}/globe", "map-link"), current=0)
        case ["airlines", slug, "globe"]:
            return make(("Overview", f"/airlines/{slug}", None), ("Map", f"/airlines/{slug}/globe", None), current=1)
    return []


@hookimpl
def extra_template_vars(request):
    """The header's current section and the page's views, for every template rendered with a request."""
    if request is None:
        return {}
    return {"section": section_of(request.path), "views": views_for(request.path)}
```

`re` is already imported at the top of the file.

Run: `uv run pytest -q tests/test_navigation.py`
Expected: PASS.

Run: `uv run pytest -q`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add plugins/t100_globe.py tests/test_navigation.py
git commit -m "Navigation rules: which section a page is in, and the other views of its subject

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0191mnN3iPgFXTdJ7jQemcY1"
```

---

### Task 2: The header's sections and the views line

**Files:**
- Modify: `templates/_nav.html`
- Modify: `static/nav/style.css`
- Modify, removing the `.related` navigation lines:
  - `templates/engines.html:15`
  - `templates/family.html:15`
  - `templates/rollup.html:15`
  - `templates/routes.html:15`
  - `templates/airline.html:15`
  - `templates/route.html:15-18`
- Modify: `templates/route.html`: add the "More from {origin}" paragraph
- Modify: `templates/globe.html` and `templates/airline_globe.html`: their picker rows
- Modify: `tests/test_navigation.py` (page tests)

**Interfaces:**
- Consumes: `section`, `views` (Task 1).

- [ ] **Step 1: Write the failing page tests**

Append to `tests/test_navigation.py`:

```python
import re

PAGES = {
    "/": (None, []),
    "/airports": ("airports", ["Busiest airports", "Map"]),
    "/airports/globe": ("airports", ["Busiest airports", "Map"]),
    "/airports/ATL": ("airports", ["Routes over time", "Map"]),
    "/airports/ATL/globe": ("airports", ["Routes over time", "Map"]),
    "/airports/ATL/LAX": ("airports", ["ATL → LAX", "LAX → ATL"]),
    "/aircraft": ("aircraft", ["Families", "Long-haul engines"]),
    "/aircraft/engines": ("aircraft", ["Families", "Long-haul engines"]),
    "/airlines": ("airlines", []),
    "/about": ("about", []),
}


def sections_nav(html):
    return re.search(r'<nav class="sections".*?</nav>', html, re.S).group(0)


@pytest.mark.parametrize("path", PAGES)
def test_every_page_lists_the_sections_with_the_current_one_marked(ds, path):
    nav = sections_nav(get(ds, path).text)
    assert re.findall(r">(Airports|Aircraft|Airlines|About)<", nav) == ["Airports", "Aircraft", "Airlines", "About"]
    current = re.findall(r'aria-current="[^"]+">(\w+)<', nav)
    assert current == ([PAGES[path][0].capitalize()] if PAGES[path][0] else [])


@pytest.mark.parametrize("path", PAGES)
def test_the_views_line_lists_the_subjects_views(ds, path):
    html = get(ds, path).text
    m = re.search(r'<nav class="views".*?</nav>', html, re.S)
    labels = re.findall(r">([^<>]+)</(?:a|strong)>", m.group(0)) if m else []
    assert labels == PAGES[path][1]


def test_no_page_keeps_a_hand_written_related_line(ds):
    for path in [*PAGES, "/aircraft/boeing-737", "/airlines/delta", "/airlines/delta/globe", "/airports/ATL/LAX/2024"]:
        html = get(ds, path).text
        assert not re.search(r'<p class="related">\s*<a', html), path


def test_a_route_links_to_more_from_its_origin(ds):
    html = get(ds, "/airports/ATL/LAX").text
    assert 'href="/airports/ATL"' in html and 'id="map-link"' in html
```

`/aircraft/boeing-737` and `/airlines/delta` depend on fixture data. Check `tests/conftest.py` for an aircraft family and an airline the fixture database has, and use those slugs. Earlier tests in `tests/test_rollup_pages.py` show which ones resolve.

Run: `uv run pytest -q tests/test_navigation.py`
Expected: FAIL, because there's no `<nav class="sections">`.

- [ ] **Step 2: The header**

Replace `templates/_nav.html` with:

```html
<div class="site-header">
  <nav class="crumbs" aria-label="Breadcrumb"><ol>
    {%- for c in crumbs %}
    {% if c.href %}<li><a href="{{ c.href }}">{{ c.label }}</a></li>{% else %}<li aria-current="page">{{ c.label }}</li>{% endif %}
    {%- endfor %}
  </ol></nav>
  <nav class="sections" aria-label="Sections"><ul>
    {%- for key, label in [("airports", "Airports"), ("aircraft", "Aircraft"), ("airlines", "Airlines"), ("about", "About")] %}
    {% if key == section %}<li><strong aria-current="{{ 'page' if request.path.rstrip('/') == '/' ~ key else 'true' }}">{{ label }}</strong></li>{% else %}<li><a href="/{{ key }}">{{ label }}</a></li>{% endif %}
    {%- endfor %}
  </ul></nav>
  <select id="theme" aria-label="Theme"></select>
</div>
{% if views %}<nav class="views" aria-label="Views">
  {%- for v in views %}{% if not loop.first %} · {% endif %}{% if v.current %}<strong aria-current="page">{{ v.label }}</strong>{% else %}<a href="{{ v.href }}"{% if v.id %} id="{{ v.id }}"{% endif %}>{{ v.label }}</a>{% endif %}{% endfor -%}
</nav>{% endif %}
```

`#theme` stays here for now; Task 3 moves it.

The test's current-section regex looks for `aria-current="…">Label<`, and the `<strong>` above matches it.

- [ ] **Step 3: Remove the hand-written lines, and add the route's paragraph**

Delete line 15 (the `<p class="related">…</p>`) from:
- `engines.html`
- `family.html`
- `rollup.html`
- `routes.html`
- `airline.html`. Its `id="map-link"` now lives on the views line's "Map". Leave the second `.related`, `#full-name`, alone.

In `route.html`, delete lines 15–18 (the `.related` block). Then add this directly after `<nav id="years" aria-label="Years"></nav>`:

```html
    <p class="note">Each direction is a route of its own. More from {{ origin }}: <a href="/airports/{{ origin }}">routes over time</a> · <a href="/airports/{{ origin }}/globe" id="map-link">map</a>.</p>
```

In `globe.html`, delete `{% if origin %}<a href="/airports/{{ origin }}" class="plain">Routes over time</a>{% endif %}` from the picker row.

In `airline_globe.html`, delete `<a href="/airlines/{{ own }}" class="plain">All charts for this airline</a>` from the picker row. Keep `#table-link`.

- [ ] **Step 4: Styles**

Append to `static/nav/style.css`:

```css
.site-header { flex-wrap:wrap; }
.sections ul { display:flex; gap:14px; list-style:none; margin:0; padding:0; font-size:15px; }
.sections a { color:var(--muted); text-decoration:none; }
.sections a:hover, .sections a:focus-visible { color:var(--fg); text-decoration:underline; }
.sections strong { color:var(--fg); }
.views { border-top:1px solid var(--rule); padding-top:6px; margin:0 0 16px; font-size:14px; color:var(--muted); }
.views a { color:var(--muted); }
.views strong { color:var(--fg); }
@media (max-width:600px) { .site-header .sections { order:3; flex-basis:100%; } }
```

The header is already `display:flex; justify-content:space-between`. On phones, `order:3` with `flex-basis:100%` puts the sections on a line of their own after the breadcrumb and theme chooser. Task 3 removes the chooser, leaving the breadcrumb, then the sections.

`--rule` exists on every theme, from the front-page work.

- [ ] **Step 5: Run the tests, then commit**

Run: `uv run pytest -q`
Expected: all pass. Update any existing test that still asserts a removed link. `tests/test_routes_page.py` and `tests/test_rollup_pages.py` are the likely ones: change the assertion to the link's new home, not delete it.

Run: `npm test 2>&1 | grep -E "^ℹ (pass|fail)"`
Expected: `fail 0`.

```bash
git add templates static/nav/style.css tests
git commit -m "Header: the four sections on every page, and a views line under the breadcrumb in place of hand-picked links

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0191mnN3iPgFXTdJ7jQemcY1"
```

Run `git status` before committing, and stage only the files above. `templates/` also holds untracked `query-t100-*.html` files that aren't part of this work. Add the changed templates by name, not the directory.

---

### Task 3: The footer, and the theme chooser's move

**Files:**
- Create: `templates/_footer.html`
- Modify: `templates/_nav.html` (remove `#theme`)
- Modify, adding `{% include "_footer.html" %}` just before `</main>`:
  - `home.html`
  - `airports.html`
  - `rollup.html`
  - `engines.html`
  - `family.html`
  - `airline.html`
  - `routes.html`
  - `route.html`
  - `about.html`
- Modify: `templates/globe.html` and `templates/airline_globe.html`: `#theme` at the end of `#controls`'s second `.row`
- Modify: `static/nav/style.css`
- Modify: `tests/test_nav.py` (`test_every_page_has_one_theme_chooser_and_the_shared_scripts`)

- [ ] **Step 1: Write the failing test**

In `tests/test_nav.py`, replace `test_every_page_has_one_theme_chooser_and_the_shared_scripts` with:

```python
SCROLLING = ["/", "/airports", "/aircraft", "/aircraft/engines", "/airlines", "/airports/ATL", "/airports/ATL/LAX", "/about"]
MAPS = ["/airports/globe", "/airports/ATL/globe"]


def test_every_page_has_one_theme_chooser_and_the_shared_scripts(ds):
    for path in SCROLLING + MAPS:
        html = get(ds, path).text
        assert html.count('id="theme"') == 1, path
        assert "/static/nav/main.js" in html and "/static/nav/style.css" in html, path


def test_the_theme_chooser_is_in_the_footer_or_on_a_map_in_its_controls(ds):
    for path in SCROLLING:
        footer = re.search(r'<footer class="site-footer".*?</footer>', get(ds, path).text, re.S)
        assert footer and 'id="theme"' in footer.group(0), path
    for path in MAPS:
        html = get(ds, path).text
        controls = html[html.index('<div id="controls">'):]
        assert 'id="theme"' in controls and '<footer class="site-footer"' not in html, path
```

Run: `uv run pytest -q tests/test_nav.py`
Expected: FAIL, because there's no `site-footer`.

- [ ] **Step 2: The footer, and move the chooser**

Create `templates/_footer.html`:

```html
<footer class="site-footer">
  <label>Theme <select id="theme" aria-label="Theme"></select></label> ·
  Data: the US Department of Transportation's T-100 segment tables ·
  <a href="/about">About the data</a>
</footer>
```

- In `_nav.html`, delete `<select id="theme" aria-label="Theme"></select>`.
- Add `{% include "_footer.html" %}` on its own line just before `</main>` in each of the nine scrolling templates listed above.
- In `globe.html` and `airline_globe.html`, add `<select id="theme" aria-label="Theme"></select>` as the last child of the second `<div class="row">` inside `#controls`, after `<select id="width" …>` or `<select id="colour" …>`.

- [ ] **Step 3: Styles**

Append to `static/nav/style.css`:

```css
.site-footer { border-top:1px solid var(--rule); margin:40px 0 0; padding:8px 0 24px; font-size:13px; color:var(--muted); }
.site-footer a { color:var(--muted); }
.site-footer select { font-size:13px; color:var(--muted); padding:2px 8px; }
```

The old `.site-header select` rule is now unused, so delete it.

- [ ] **Step 4: Run the tests, then commit**

Run: `uv run pytest -q` and `npm test 2>&1 | grep -E "^ℹ (pass|fail)"`
Expected: all pass; `fail 0`.

Stage by name, not the directory, so the untracked `query-t100-*.html` files stay out:

```bash
git add templates/_footer.html templates/_nav.html templates/home.html templates/airports.html templates/rollup.html templates/engines.html templates/family.html templates/airline.html templates/routes.html templates/route.html templates/about.html templates/globe.html templates/airline_globe.html static/nav/style.css tests/test_nav.py
git commit -m "Footer with the theme chooser on every scrolling page; on the maps it joins the controls

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0191mnN3iPgFXTdJ7jQemcY1"
```

---

### Task 4: In a browser

**Files:**
- Create (scratchpad, not committed): `nav_check.py`

- [ ] **Step 1: Restart the scratch server**

```bash
pkill -f "port 8811"; (nohup uv run datasette serve t100.db --config datasette.yml --plugins-dir plugins --template-dir templates --static static:static --port 8811 >/dev/null 2>&1 &)
```

- [ ] **Step 2: Check the header, views and theme**

`nav_check.py` uses Playwright and Chromium against `http://localhost:8811`.

1. **Phone header.** At 390×844, for `/airlines/delta` and `/airports/SFO/LHR/2019`:
   - print `document.documentElement.scrollWidth`. Expected: 390.
   - print whether the `.sections` box's top is below the `.crumbs` box's bottom. Expected: true.
2. **Desktop header.** At 1280, for `/airports/SFO`:
   - the `.sections` and `.crumbs` boxes share a top, within 6px;
   - the `.views` element has a 1px top border;
   - its `strong` reads "Routes over time".
3. **Theme from the footer.** On `/aircraft`:
   - select "dark" in `#theme`. Expected: `document.documentElement.dataset.scheme` is `dark`;
   - go to `/airlines`. Expected: still `dark`.
4. **Theme on a map.** On `/airports/SFO/globe`:
   - `#theme` is inside `#controls`;
   - selecting "light" makes `dataset.scheme` `light`.
5. **Errors:** collect page errors throughout. Expected: none.

Run: `uv run --no-project --with playwright python nav_check.py`
Expected: every line matches its "Expected".

- [ ] **Step 3: Screenshots**

Take screenshots of the top 300px of `/`, `/airports/SFO`, `/airports/SFO/LHR/2019`, `/aircraft/engines`, `/airlines/delta` and `/airports/SFO/globe`, in light and dark, at 1280 and 390. Also take one of the bottom of `/aircraft`, showing the footer.

Read them and check by eye:
- the sections sit at the top right on desktop, and on their own line on a phone;
- the views line's rule runs full width, with the current view in bold;
- the footer reads cleanly in both themes;
- the theme chooser fits into the map's controls bar.

- [ ] **Step 4: The full suites, and a commit if anything changed**

Run: `uv run pytest -q` and `npm test 2>&1 | grep -E "^ℹ (pass|fail)"`
Expected: all pass; `fail 0`.

If the screenshots led to CSS fixes, commit them by name:

```bash
git add static/nav/style.css
git commit -m "Navigation: fixes from the screenshot pass

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0191mnN3iPgFXTdJ7jQemcY1"
```
