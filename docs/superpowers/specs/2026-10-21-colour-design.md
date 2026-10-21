# Colour

## Purpose

The site uses seven palettes, each chosen where it's used:
- Plot's tableau10 on the family and route charts;
- blues and greys on the engine chart;
- two blues on an airline's size chart;
- blue and orange for domestic and international on the maps;
- green and magenta for added and dropped;
- YlOrRd on the heat maps;
- livery colours on the front page;
- plus the AirTrail blue accent.

Two problems follow. The same meaning has different colours (domestic is sky blue on the maps but light blue on an airline's chart), and nothing reads as one design.

This change defines the data colours once, by role, in a palette built around one warm family, **Ember**, and uses it everywhere. It's bucket 5 of `docs/site-coherence.md`. The choices were made in the visual companion; the screens are in `.superpowers/brainstorm/`.

## The palette, by role

| Role | Used for | Light theme | Dark theme |
|---|---|---|---|
| `series` | stacked series: route and family charts | Ember, 8 steps, deep to light: `#7f1d1d #9e261f #be301e #d44c23 #e36d2a #ef9048 #f7bb82 #fae4b8` | lifted Ember: `#c53a2a #d04d2c #da5f2d #e4712f #ec863f #f0a05c #f3b976 #f5d290` |
| `other` | "Other" in any stack | `#a1a1aa` | `#a1a1aa` |
| `service` | domestic / international: maps, an airline's size chart | `#0d9488` / `#e36d2a` | `#2bb39a` / `#ec863f` |
| `kind` | passenger / freight: an airline's size chart | `#e36d2a` / `#64748b` | `#ec863f` / `#94a3b8` |
| `single` | one-series bars: an airline's airport pairs | `#e36d2a` | `#ec863f` |
| `engines` | twin, tri, quad, turboprop, piston and helicopter | `#be301e #ef9048 #fae4b8 #969696 #d0d0d0` | `#da5f2d #f0a05c #f5d290 #8a8a8a #5e5e5e` |
| `change` | added / dropped on the maps (unchanged) | `#4dac26` / `#c51b7d` | same |
| `accent` | interface accent: the map's year slider, hover borders | `#e36d2a` | `#ec863f` |

- **Ember's steps** were chosen to be evenly spaced in OKLab. The dark ramp is "lifted": it starts at a brighter red and stops short of the palest sand, so no step sinks into the black background or glares.
- **Order follows size.** The biggest series is the deepest colour, at the bottom of the stack, and steps get lighter towards the top. "Other" goes on top in grey, matching the stack order from the popovers work.
- **The engine chart's dark propellers** are darker greys, so they stay quieter than the jets on black.
- **Domestic is teal for now.** The owner is choosing between teal and slate (`#64748b` / `#94a3b8`) and will decide on the real site. Swapping is a one-row change in the palette.

**Deliberately unchanged:**
- **Heat maps** keep YlOrRd. No page shows a heat map and a stacked chart together, so the two warm scales never meet.
- **The front page's airline chart** keeps its livery colours.
- **Airport dots on the maps** keep the theme's emerald, `#10b981`.

## Pieces

**`static/common/palette.js`** is a new, pure module:
- `PALETTE = { light: {…}, dark: {…} }`, with the roles above;
- `palette(dark)` returns one theme's set;
- `seriesColours(series, dark)` returns `{ domain, range }` for a Plot colour scale. The series take Ember steps in the order given (biggest first); "Other" gets `other`. More than eight named series reuse the last step, though no chart has more than eight plus "Other".
- `isDark()` reads `document.documentElement.dataset.scheme === 'dark'`, which `static/nav/main.js` already sets.

**Call sites:**

| File | Now | Becomes |
|---|---|---|
| `static/charts/routepage.js` | `scheme: 'tableau10'` | `seriesColours(res.series, isDark())` |
| `static/charts/family.js` | `SERIES_COLORS` / `OTHER_COLOR` | `seriesColours(res.series, isDark())` |
| `static/charts/src/rollup.js` | `SERIES_COLORS`, `OTHER_COLOR`, `ENGINE_COLORS` | removed; callers use the palette |
| `static/charts/engines.js`, `static/home/main.js` (engine chart) | `ENGINE_COLORS` | `palette(isDark()).engines` |
| `static/charts/airline.js` | `['#4292c6', '#08306b']`, `'#4292c6'` | `service` or `kind` by split; `single` for airport pairs |
| `static/globe/src/scale.js` | `SERVICE_COLOURS` | `palette(dark).service`, with dark from the theme being drawn |
| `static/globe/src/routestyle.js` | `CHANGE_COLOURS` | `palette(dark).change` (same values) |
| `static/globe/src/themes.js` | `accent: '#3b82f6'`, unused `trail` | `accent` from the palette; `trail` removed |
| `static/landing/style.css`, `static/globe/style.css` | `--accent:#3b82f6` fallbacks | the palette's accents |

**Redrawing on a theme change.** The family, route, airline, engine and front-page charts listen for `t100:theme`, which `static/nav/main.js` already sends, and redraw, as the maps already do. A redraw rebuilds the chart's popover too (popovers work), so the colour keys follow.

## Out of scope

- The heat-map scale.
- The livery colours.
- The map's land, ocean and airport colours.
- Text and interface colours other than the accent.

## Testing

**JavaScript (`node --test`):**
- `PALETTE` has the same roles in light and dark;
- `series` has 8 steps in each theme, every value is a 6-digit hex, and the light and dark values differ where the table says they do;
- `seriesColours`: the order given; "Other" gets `other` wherever it appears; nine named series reuse the last step;
- a guard test: no `#rrggbb` literal or Plot `scheme:` remains in `static/**/*.js`. The exceptions are `static/common/palette.js`, `static/globe/src/themes.js`, the `LIVERY` and `FALLBACK` lists in `static/home/src/airlines.js`, `scheme: 'YlOrRd'` in the heat-map files, and test and vendor files.

**In a browser (headless Playwright):**
- a route page and a family page in light and dark: the bottom segment of the biggest stack is the first Ember step for that theme, and "Other" is grey;
- switching the theme on a family page recolours the chart without a reload;
- an airline's size chart uses teal and ember for domestic and international;
- an airport map draws domestic routes in teal;
- screenshots of the front page, `/aircraft/engines`, a family page, an airline page, a route page and an airport map, in light and dark.
