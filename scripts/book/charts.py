"""Yearly bar charts as SVG strings, for print: no plotting library, so they stay small and crisp."""

import math
from html import escape

from scripts.book.format import dense_count

# static/common/palette.js, light theme, kind
PASSENGER_COLOR = "#e36d2a"
FREIGHT_COLOR = "#64748b"

WIDTH, HEIGHT = 600, 200
LEFT, RIGHT, TOP, BOTTOM = 70, 6, 22, 18


def _step(top):
    """The smallest 1, 2 or 5 × 10ⁿ that puts at most five ticks (0 included) under `top`."""
    if top <= 0:
        return 1
    raw = top / 4
    power = 10 ** math.floor(math.log10(raw))
    return next(m * power for m in (1, 2, 5, 10) if m * power >= raw)


def bar_chart(points, *, first_year, last_year, color, label, scale=1.0):
    """points: (year, value or None). Values are in the data's units; the axis shows value / scale (2000 turns pounds into tons)."""
    values = {y: v / scale for y, v in points if v is not None}
    top = max(values.values(), default=0)
    step = _step(top)
    ceiling = max(top, step)
    years = last_year - first_year + 1
    plot_w, plot_h = WIDTH - LEFT - RIGHT, HEIGHT - TOP - BOTTOM
    slot = plot_w / years
    base = TOP + plot_h

    def y_of(v):
        return base - v / ceiling * plot_h

    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {WIDTH} {HEIGHT}" width="100%" class="chart">',
           f'<text class="title" x="0" y="12">{escape(label)}</text>']
    tick = 0
    while tick <= ceiling + 1e-9:
        y = y_of(tick)
        out.append(f'<line class="grid" x1="{LEFT}" x2="{WIDTH - RIGHT}" y1="{y:.2f}" y2="{y:.2f}"/>')
        out.append(f'<text class="y-label" x="{LEFT - 6}" y="{y + 3:.2f}" text-anchor="end">{escape(dense_count(tick))}</text>')
        tick += step
    for year, v in sorted(values.items()):
        if v <= 0:
            continue
        x = LEFT + (year - first_year) * slot + slot * 0.1
        out.append(f'<rect class="bar" x="{x:.2f}" y="{y_of(v):.2f}" width="{slot * 0.8:.2f}" height="{base - y_of(v):.2f}" fill="{color}"/>')
    out.append(f'<line class="baseline" x1="{LEFT}" x2="{WIDTH - RIGHT}" y1="{base}" y2="{base}"/>')
    for year in sorted({y for y in range(first_year, last_year + 1) if y % 10 == 0} | {first_year, last_year}):
        x = LEFT + (year - first_year + 0.5) * slot
        out.append(f'<text class="x-label" x="{x:.2f}" y="{HEIGHT - 4}" text-anchor="middle">{year}</text>')
    out.append("</svg>")
    return "".join(out)
