"""Yearly bar charts as SVG strings, for print: no plotting library, so they stay small and crisp."""

import math
from html import escape

from scripts.book.format import MILLIONS, _digits

# static/common/palette.js, light theme, kind
PASSENGER_COLOR = "#e36d2a"
FREIGHT_COLOR = "#64748b"

HEIGHT = 180
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


# The full-width charts: 820 units across the page's text width, so 12-unit type comes out the size of the bar charts'
WIDE = 820
COLORS = {"passengers": PASSENGER_COLOR, "freight": FREIGHT_COLOR}
LABELS = {"passengers": "Passengers", "freight": "Freight"}
TRACK = "#f4f4f5"


def _svg(height, cls):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {WIDE} {height:g}" width="100%" class="chart {cls}">'


def _text(cls, x, y, body, anchor="start", size=12, fill=MUTED, extra=""):
    return (f'<text class="{cls}" x="{x:.2f}" y="{y:.2f}" text-anchor="{anchor}" {FONT} font-size="{size}" fill="{fill}"{extra}>'
            f'{body}</text>')


def _runs(points, x_of, y_of):
    """A path through (year, value) points, broken where a value is None: "M x,y L x,y ..." with an M for each run."""
    d, drawing = [], False
    for year, v in points:
        if v is None:
            drawing = False
            continue
        d.append(f"{'L' if drawing else 'M'}{x_of(year):.2f},{y_of(v):.2f}")
        drawing = True
    return "".join(d)


def _year_labels(first_year, last_year, x_of, y):
    years = sorted({y for y in range(first_year, last_year + 1) if y % 10 == 0} | {first_year, last_year})
    return [_text("x-label", x_of(year), y, year, anchor="middle") for year in years]


RANK_FLOOR = 50   # the book's own cut: the chart shows ranks 1 to 50 only


def rank_chart(series, *, first_year, last_year):
    """series: measure -> [(year, rank or None)], the page's measure first, drawn solid; the other dotted. Rank 1 at the top,
    50 at the foot; a year ranked below 50 breaks the line, like a year without a rank."""
    height, left, right, top, bottom = 130, 34, 18, 22, 20
    floor = RANK_FLOOR
    ticks = [1] + list(range(10, floor + 1, 10))
    series = {m: [(y, r if r and r <= floor else None) for y, r in points] for m, points in series.items()}
    slot = (WIDE - left - right) / (last_year - first_year + 1)
    plot_h = height - top - bottom

    def x_of(year):
        return left + (year - first_year + 0.5) * slot

    def y_of(r):
        return top + (r - 1) / (floor - 1) * plot_h

    out = [_svg(height, "ranks")]
    for tick in ticks:
        y = y_of(tick)
        out.append(f'<line class="grid" x1="{left}" x2="{WIDE - right}" y1="{y:.2f}" y2="{y:.2f}" stroke="{RULE}" stroke-width="0.8"/>')
        out.append(_text("y-label", left - 6, y + 3, tick, anchor="end"))
    x = left   # the legend, along the top
    for i, (measure, points) in enumerate(series.items()):
        dots = ' stroke-dasharray="0.1 4.5"' if i else ""
        style = f'fill="none" stroke="{COLORS[measure]}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"{dots}'
        out.append(f'<path class="line line-{measure}" d="{_runs(points, x_of, y_of)}" {style}/>')
        out.append(f'<line class="key" x1="{x:.2f}" x2="{x + 18:.2f}" y1="8" y2="8" stroke="{COLORS[measure]}" stroke-width="2.2" '
                   f'stroke-linecap="round"{dots}/>')
        out.append(_text("legend", x + 24, 12, LABELS[measure], fill=INK))
        x += 24 + len(LABELS[measure]) * 6.6 + 18
    out.extend(_year_labels(first_year, last_year, x_of, height - 4))
    out.append("</svg>")
    return "".join(out)


def airline_sparklines(history, *, first_year, last_year, color):
    """A row per airline, then the others: its name, its share of the airport's traffic year by year as a line with 0 at the
    row's foot and 100% at its head, and the last year's share."""
    from scripts.book.format import share

    name_w, share_w, row_h, gap, foot = 190, 60, 20, 5, 18
    lines = list(history.lines) + ([history.others] if history.others else [])
    height = len(lines) * (row_h + gap) + foot
    left, right = name_w, WIDE - share_w
    slot = (right - left) / (last_year - first_year + 1)

    def x_of(year):
        return left + (year - first_year + 0.5) * slot

    out = [_svg(height, "airlines")]
    for i, line in enumerate(lines):
        top = i * (row_h + gap)
        name = f"Others ({history.others_count:,})" if line is history.others else line.name
        out.append(_text("airline", 0, top + row_h / 2 + 4, escape(name), fill=INK))
        out.append(f'<rect class="row" x="{left}" y="{top}" width="{right - left}" height="{row_h}" fill="{TRACK}"/>')
        points = [(y, line.shares.get(y)) for y in range(first_year, last_year + 1)]
        d = _runs(points, x_of, lambda s, top=top: top + (1 - s) * row_h)
        out.append(f'<path class="line" d="{d}" fill="none" stroke="{color}" stroke-width="1.6" stroke-linejoin="round" '
                   f'stroke-linecap="round"/>')
        out.append(_text("share", WIDE, top + row_h / 2 + 4, share(line.last_share), anchor="end", fill=INK))
    out.extend(_year_labels(first_year, last_year, x_of, height - 4))
    out.append("</svg>")
    return "".join(out)


DISTANCE_ROW, DISTANCE_FOOT = 52, 18
LABEL_EM = 6.2   # a generous average width of a 12-unit character, for keeping labels apart


def distance_rows_height(n: int) -> int:
    """The distance rows' height in SVG units, n rows and the scale under them (render.py places them at the page's foot by it)."""
    return n * DISTANCE_ROW + DISTANCE_FOOT


def distance_rows(rows, *, scale, color):
    """A row per year: a track from 0 to `scale` miles with the shortest route, the median and the longest marked, the ends
    named above the track and the median below it."""
    from scripts.book.format import miles

    year_w, row_h = 44, DISTANCE_ROW
    left, right = year_w, WIDE - 8
    height = distance_rows_height(len(rows))

    def x_of(m):
        return left + m / scale * (right - left)

    out = [_svg(height, "distances")]
    for i, row in enumerate(rows):
        track_y = i * row_h + 26
        out.append(_text("year", 0, track_y + 4, row.year, fill=INK, extra=' font-weight="700"'))
        out.append(f'<line class="track" x1="{left}" x2="{right}" y1="{track_y}" y2="{track_y}" stroke="{RULE}" stroke-width="3" '
                   f'stroke-linecap="round"/>')
        if row.shortest and row.longest:
            x1, x2 = x_of(row.shortest.miles), x_of(row.longest.miles)
            out.append(f'<line class="span" x1="{x1:.2f}" x2="{x2:.2f}" y1="{track_y}" y2="{track_y}" stroke="{color}" '
                       f'stroke-width="3" stroke-opacity="0.35"/>')
        short_end = None   # where the shortest's label ends, so the longest's can keep clear of it
        for kind, end, anchor in (("shortest", row.shortest, "start"), ("longest", row.longest, "end")):
            if not end:
                continue
            x = x_of(end.miles)
            out.append(f'<circle class="mark {kind}" cx="{x:.2f}" cy="{track_y}" r="3.5" fill="{color}"/>')
            plain = f"{end.code} {end.label}, {miles(round(end.miles))}"
            width = len(plain) * LABEL_EM
            label_x = x
            if kind == "shortest":
                short_end = x + width
            elif short_end is not None and x - width < short_end + 12:
                anchor, label_x = "start", short_end + 12   # too close to the shortest's: after it instead
            body = (f'<tspan font-weight="700" fill="{INK}">{escape(end.code)}</tspan> {escape(end.label)}, '
                    f'{miles(round(end.miles))}')
            out.append(_text(f"end {kind}", label_x, track_y - 9, body, anchor=anchor))
        if row.median is not None:
            x = x_of(row.median)
            out.append(f'<circle class="mark median" cx="{x:.2f}" cy="{track_y}" r="3.5" fill="#fff" stroke="{color}" stroke-width="2"/>')
            out.append(_text("median", x, track_y + 17, f"median {miles(round(row.median))}", anchor="middle"))
    tick = _step(scale)
    for m in range(0, int(scale) + 1, int(tick)):
        out.append(_text("x-label", x_of(m), height - 4, f"{m:,}" + (" miles" if m + tick > scale else ""),
                         anchor="start" if m == 0 else "end" if m + tick > scale else "middle"))
    out.append("</svg>")
    return "".join(out)
