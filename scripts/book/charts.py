"""Yearly bar charts as SVG strings, for print: no plotting library, so they stay small and crisp."""

import math
from html import escape

from scripts.book.format import MILLIONS, _digits

# static/common/palette.js, light theme, kind
PASSENGER_COLOR = "#e36d2a"
FREIGHT_COLOR = "#64748b"

HEIGHT = 230
LEFT, RIGHT, TOP, BOTTOM = 78, 18, 26, 20   # room on the right for half the last year's label
# each year's slot is the same in every chart, so a chart's width follows its span: 1990-2025 is 400 units wide, and two
# charts set side by side at widths in proportion to these have bars of one width (render.py)
SLOT = (400 - LEFT - RIGHT) / 36
# WeasyPrint doesn't apply the page's CSS inside inline SVG, so the look is set on the elements themselves
FONT = 'font-family="Helvetica Neue, Helvetica, Arial, sans-serif"'
INK, MUTED, RULE = "#18181b", "#52525b", "#e4e4e7"


def _step(top):
    """The smallest 1, 2 or 5 × 10ⁿ that puts at most five ticks (0 included) under `top`."""
    if top <= 0:
        return 1
    raw = top / 4
    power = 10 ** math.floor(math.log10(raw))
    return next(m * power for m in (1, 2, 5, 10) if m * power >= raw)


def _tick_label(v, step):
    """Whole numbers, one style up an axis: whole millions when the step is a million or more (20 million), else in full,
    millions too (500,000 / 1,000,000). Not dense_count's three figures, which made 20.0 million and 1.00 million."""
    if step >= 1e6 and v:
        return f"{round(v / 1e6):,}{MILLIONS}"
    return _digits(v)


def chart_width(first_year: int, last_year: int) -> float:
    return LEFT + (last_year - first_year + 1) * SLOT + RIGHT


def bar_chart(points, *, first_year, last_year, color, label, scale=1.0):
    """points: (year, value or None). Values are in the data's units; the axis shows value / scale (2000 turns pounds into tons)."""
    values = {y: v / scale for y, v in points if v is not None and first_year <= y <= last_year}
    top = max(values.values(), default=0)
    step = _step(top)
    ceiling = max(top, step)
    width = chart_width(first_year, last_year)
    plot_h = HEIGHT - TOP - BOTTOM
    slot = SLOT
    base = TOP + plot_h

    def y_of(v):
        return base - v / ceiling * plot_h

    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width:g} {HEIGHT}" width="100%" class="chart">',
           f'<text class="title" x="0" y="13" {FONT} font-size="14" font-weight="700" fill="{INK}">{escape(label)}</text>']
    tick = 0
    while tick <= ceiling + 1e-9:
        y = y_of(tick)
        out.append(f'<line class="grid" x1="{LEFT}" x2="{width - RIGHT:.2f}" y1="{y:.2f}" y2="{y:.2f}" stroke="{RULE}" stroke-width="0.8"/>')
        out.append(f'<text class="y-label" x="{LEFT - 6}" y="{y + 3:.2f}" text-anchor="end" {FONT} font-size="12" fill="{MUTED}">{escape(_tick_label(tick, step))}</text>')
        tick += step
    for year, v in sorted(values.items()):
        if v <= 0:
            continue
        x = LEFT + (year - first_year) * slot + slot * 0.1
        out.append(f'<rect class="bar" x="{x:.2f}" y="{y_of(v):.2f}" width="{slot * 0.8:.2f}" height="{base - y_of(v):.2f}" fill="{color}"/>')
    out.append(f'<line class="baseline" x1="{LEFT}" x2="{width - RIGHT:.2f}" y1="{base}" y2="{base}" stroke="{MUTED}" stroke-width="1"/>')
    for year in sorted({y for y in range(first_year, last_year + 1) if y % 10 == 0} | {first_year, last_year}):
        x = LEFT + (year - first_year + 0.5) * slot
        out.append(f'<text class="x-label" x="{x:.2f}" y="{HEIGHT - 4}" text-anchor="middle" {FONT} font-size="12" fill="{MUTED}">{year}</text>')
    out.append("</svg>")
    return "".join(out)
