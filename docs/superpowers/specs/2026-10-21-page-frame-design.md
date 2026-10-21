# Page frame

## Purpose

The scrolling pages and the full-window maps grew separate layout rules:
- **Base styles in the wrong file.** The base for every scrolling page lives in `static/landing/style.css`, named after the old front page and still holding the busiest-airports table's own rules. The maps have their own base in `static/globe/style.css`.
- **Theme colours defined three times:** in both stylesheets, as fallbacks for before the theme script runs, and in `static/globe/src/themes.js`, which `static/nav/main.js` applies.
- **Titles at different sizes:** 32px on scrolling pages (phones too), 28px on the maps, and 22px on a phone map.
- **Two pages scroll sideways on a 390px phone:**
  - **`/airports`, at 637px:** its scrolling table box (`.scroll`) contains hidden "More detail" header text. It's absolutely positioned with no positioned ancestor, so it escapes the box.
  - **An airline's page, at 849px:** its "What changed" table isn't in a scrolling box at all.

This change puts what both kinds of page share into one base stylesheet, loaded first on every page. Page stylesheets keep only their own rules, titles follow one scale, and neither page scrolls sideways. It is bucket 6 of `docs/site-coherence.md`.

## `static/common/base.css`

This new file holds:

- **Theme fallbacks, defined once.** `:root` gets `--bg`, `--fg`, `--muted`, `--line`, `--rule`, `--panel` and `--accent` with the light theme's values, and a `@media (prefers-color-scheme: dark)` block gets the dark theme's. The values are the current ones:

  | Token | Light | Dark |
  |---|---|---|
  | `--bg` | `#ffffff` | `#09090b` |
  | `--fg` | `#09090b` | `#fafafa` |
  | `--muted` | `#71717a` | `#a1a1aa` |
  | `--line` | `#d4d4d4` | `#343435` |
  | `--rule` | `#8c8c8d` | `#767677` |
  | `--panel` | `rgba(255,255,255,.85)` | `rgba(9,9,11,.8)` |
  | `--accent` | `#e36d2a` | `#ec863f` |

  `--bg`, `--fg`, `--muted`, `--panel` and `--accent` must equal the matching values in `themes.js`, and a test holds them to it. `--line` and `--rule` are the nearest flat colours to the `color-mix()` the theme script uses.

- **Reset and base type:**
  - `* { box-sizing: border-box; }` and `[hidden] { display: none !important; }`;
  - `body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.5 <the current stack>; }`;
  - `a { color: var(--fg); }`.
- **Title scale:**
  - `h1, #title { font-size: 32px; font-weight: 600; letter-spacing: -.01em; }`, which becomes 26px below 600px wide (`@media (max-width: 600px)`);
  - `h1 { margin: 0 0 8px; }`;
  - `h2 { font-size: 18px; margin: 0; }`.
  - `#title` is the maps' title element, so maps and scrolling pages share one scale. Maps go from 28px to 32px on desktop, and from 22px to 26px on phones.
- **The content column:** `main { max-width: 960px; margin: 0 auto; padding: max(24px, env(safe-area-inset-top)) 16px 48px; }`. The maps' header already uses the same numbers.
- **Controls:** the shared `select` rule (`font: inherit; color: var(--fg); background: transparent; border: 1px solid var(--muted); border-radius: 8px; padding: 3px 8px;`).
- **Tables:**
  - `.scroll { overflow-x: auto; position: relative; }`. The new `position: relative` keeps absolutely positioned content inside the box.
  - The shared table rules move here from `landing/style.css`: `table`, `th, td`, `th.num, td.num` and `th`.
- **Shared text:** `.intro`, and `.note`.
- **`.visually-hidden`,** moved from `static/nav/style.css`.

## What each page stylesheet keeps

- **`static/landing/style.css`:** only the busiest-airports page's own rules:
  - the sortable headers (`th button…`, `th[aria-sort]…`);
  - `td.code`, `td.city` and `.bar`;
  - `#status`.

  Only `airports.html` loads it. The other scrolling pages no longer do.
- **`static/home/style.css`:** gains `.section` and `.section > h2`, the front page's rule-above-heading pattern, which today sits in `landing/style.css`.
- **`static/globe/style.css`:** keeps the map's layout: canvas, header, picker, chooser, panel, controls, legend chips and range. It loses the tokens, the reset and the `#title` size. Its `html, body` rule keeps only what makes the map fill the window: `height: 100%; overflow: hidden; font-size: 14px; line-height: 1.4`. Its own `button, select` rule stays, since the map's controls are a little larger.
- **`static/nav/style.css`:** loses `.visually-hidden`.
- **`static/charts/style.css`:** drops the `var(--muted, #777)` and `var(--bg, #fff)` fallbacks; the tokens are always defined now.
- **`static/about/style.css`:** unchanged.

## Templates

- Every page template links `/static/common/base.css` first, before any other stylesheet: `home`, `airports`, `rollup`, `engines`, `family`, `airline`, `routes`, `route`, `about`, `globe` and `airline_globe`.
- `landing/style.css` stays only in `airports.html`.
- `templates/airline.html` wraps `#change-table` in `<div class="scroll">`.

## Out of scope

- Renaming `static/landing/` to `static/airports/`.
- Generating the CSS fallbacks from `themes.js`.
- Visual redesign beyond the title scale.
- The maps' header block layout (title, stats, picker) other than its title size.

## Testing

**Python (pytest):** every page template's `<head>` links `/static/common/base.css` before any other stylesheet, and no template other than `airports.html` links `/static/landing/style.css`.

**JavaScript (`node --test`):** a test reads `static/common/base.css`, parses the light `:root` block and the dark `@media` block, and checks that `--bg`, `--fg`, `--muted`, `--panel` and `--accent` equal `THEMES.light` and `THEMES.dark` in `themes.js`: `bg`, `ui.fg`, `ui.muted`, `ui.panel`, `ui.accent`.

**In a browser (headless Playwright):**
- At 390×844, `document.documentElement.scrollWidth` is 390 on `/`, `/airports`, `/aircraft`, `/aircraft/engines`, `/aircraft/boeing-737`, `/airlines`, `/airlines/delta`, `/airports/SFO`, `/airports/SFO/LHR/2019`, `/about`, `/airports/globe` and `/airports/SFO/globe`.
- The title's computed font size is 32px at 1280 and 26px at 390, on `/aircraft/boeing-737` and on `/airports/SFO/globe`.
- Before-and-after screenshots of those pages, in light and dark at 1280: only the intended changes differ (the map titles, and the two tables).
