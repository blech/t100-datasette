"""The whole book as one HTML document, for WeasyPrint: title, front endpaper, contents, a data page (left) and poster page
(right) for each airport, then credits, back endpaper and back cover."""

import math
import re
from pathlib import Path
from typing import Callable

from jinja2 import Environment, FileSystemLoader
from markupsafe import Markup

from scripts.book.charts import (COLORS, FREIGHT_COLOR, PASSENGER_COLOR, WIDE, airline_sparklines, bar_chart, chart_width,
                                 distance_rows, distance_rows_height, rank_chart)
from scripts.book.data import AirportFacts, BookAirport
from scripts.book.format import dense_count, tons
from scripts.book.history import FREIGHT_FIRST_YEAR
from scripts.book.posters import crop, reprefix

TEMPLATES = Path(__file__).resolve().parent / "templates"

PAGE_SIZES = {"letter": ("8.5in", "11in"), "half-letter": ("5.5in", "8.5in")}
# the type scales with the page, so half-letter needs no second stylesheet
ROOT_SIZES = {"letter": "11pt", "half-letter": "7.5pt"}
PAGE_MARGIN = 0.5   # inches, top and bottom (book.css's @page)
INNER_MARGIN = 0.75   # inches, the binding side (book.css's :left and :right)
H2_LINES = 0.95 * (1.3 + 0.3)   # a data page h2 with no top margin, in root ems: its size, line height and bottom margin (book.css)


def distances_top(page_size: str) -> float:
    """Where the distance rows start, in inches below the data page's top, so they end at the foot of its text area.
    WeasyPrint places an absolutely positioned box by the content's height, not the page's, so bottom: 0 won't do."""
    width, height = (_inches(x) for x in PAGE_SIZES[page_size])
    text_width = width - PAGE_MARGIN - INNER_MARGIN
    svg = text_width * distance_rows_height(2) / WIDE
    h2 = H2_LINES * float(ROOT_SIZES[page_size].removesuffix("pt")) / 72
    return height - 2 * PAGE_MARGIN - svg - h2
ENDPAPERS = ("posters", "diagrams", "codes")
# where the distance rows go: at the foot of the data page, just above its number, or straight after the charts
DISTANCES = ("foot", "flow")
DISTANCE_SCALE = 10_000   # miles, unless a route in the book is longer
DISTANCE_TITLES = {"passengers": "How far its passengers fly", "freight": "How far its freight flies"}

CHART_GAP = 4   # % of the page's width between the two charts


def _label(d):
    """A destination's name, with its country if it's outside the US."""
    return f"{d.label}, {d.country}" if d.country else d.label


def _market(f, book):
    """The market's other airports, those in the book linked to their page (the page number is added by the CSS)."""
    if not f.market:
        return ""
    others = Markup(", ").join(Markup('<a class="ref" href="#data-{0}">{0}</a>').format(c) if c in book else c
                               for c in f.market_airports)
    return Markup("{} (with {})").format(f.market, others)


# The facts table, in order: (label, value(facts, codes in the book)). Labels may use {first} and {last} for the years. A
# value of "" leaves the row out. Cut or reorder rows here; the ranks and the yearly figures have tables and charts of their own.
TABLE_ROWS: list[tuple[str, Callable[[AirportFacts, dict], str]]] = [
    ("Places served (24+ flights)", lambda f, book: f"{f.places:,}"),
    ("Metropolitan area", _market),   # BTS's city market, named only when it has other airports
    ("Airlines at this airport, {last}", lambda f, book: f"{f.airline_groups:,}"),
]


def label_for(label: str, f: AirportFacts) -> str:
    return label.format(first=f.first_year, last=f.last_year)


def _inches(length: str) -> float:
    return float(length.removesuffix("in"))


def grid_shape(n: int, page_size: str) -> tuple[int, int]:
    """(columns, rows) for an endpaper grid of n tiles filling the whole page: cells as near square as the page allows, each
    empty cell in the last row costing as much as a 10% stretch."""
    width, height = (_inches(x) for x in PAGE_SIZES[page_size])

    def cost(columns):
        rows = math.ceil(n / columns)
        return abs(math.log((rows / columns) / (height / width))) + 0.1 * (rows * columns - n)

    columns = min(range(1, n + 1), key=cost)
    return columns, math.ceil(n / columns)


# a code tile's text, in em of the root size: the code (1.9em) and its page number (0.8em), at line-height 1.3
CODE_TILE_EM = (1.9 + 0.8) * 1.3


def code_tile_padding(rows: int, page_size: str) -> str:
    """The top padding that centres a code tile's text in its cell. WeasyPrint centres nothing vertically inside a grid
    cell, by flex or grid, so it's worked out here."""
    cell = _inches(PAGE_SIZES[page_size][1]) * 72 / rows
    text = CODE_TILE_EM * float(ROOT_SIZES[page_size].removesuffix("pt"))
    return f"{max(0.0, (cell - text) / 2):.1f}pt"


_SVG_ROOT = re.compile(r"<svg\b")


def _cover(svg: str) -> str:
    """Scaled to fill its cell and cropped at the cell's edges, like CSS's object-fit: cover."""
    return _SVG_ROOT.sub('<svg preserveAspectRatio="xMidYMid slice"', svg, count=1)


def _history(f: AirportFacts, distance_scale: float) -> dict:
    """The year-by-year parts: ranks, airlines' shares and distances, all in the page's measure (ranks in both, when the
    airport is in the book by both)."""
    h = f.history
    if h is None:
        return dict(rank_chart=None, airlines_chart=None, distances_chart=None)
    first = min((points[0][0] for points in h.ranks.values() if points), default=f.first_year)
    airline_first = max(f.first_year, FREIGHT_FIRST_YEAR) if f.measure == "freight" else f.first_year
    color = COLORS[f.measure]
    return dict(
        rank_chart=Markup(rank_chart(h.ranks, first_year=first, last_year=f.last_year)),
        airlines_chart=Markup(airline_sparklines(h.airlines, first_year=airline_first, last_year=f.last_year, color=color))
        if h.airlines.lines else None,
        distances_chart=Markup(distance_rows(h.distances, scale=distance_scale, color=color)) if h.distances else None,
        distances_title=DISTANCE_TITLES[f.measure],
    )


def distance_scale(airports) -> float:
    """DISTANCE_SCALE, or the longest route on any page if that's further, so every page's rows share one scale."""
    longest = [d.longest.miles for _, f in airports if f.history for d in f.history.distances if d.longest]
    return max([DISTANCE_SCALE, *longest])


def _page(entry: BookAirport, f: AirportFacts, poster: str, book: dict, scale: float = DISTANCE_SCALE):
    rows = [(label_for(label, f), value(f, book)) for label, value in TABLE_ROWS]
    columns = [("Passengers", lambda d: dense_count(d.passengers)), ("Freight", lambda d: tons(d.freight_lb))]
    freight_first = max(f.first_year, FREIGHT_FIRST_YEAR)
    charts = [
        (chart_width(f.first_year, f.last_year),
         bar_chart([(s.year, s.passengers) for s in f.series], color=PASSENGER_COLOR, label="Passengers",
                   first_year=f.first_year, last_year=f.last_year)),
        (chart_width(freight_first, f.last_year),
         bar_chart([(s.year, s.freight_lb) for s in f.series], color=FREIGHT_COLOR, label="Freight (tons)", scale=2000,
                   first_year=freight_first, last_year=f.last_year)),
    ]
    if f.measure == "freight":   # the page's measure first
        columns.reverse()
        charts.reverse()
    total = sum(w for w, _ in charts)
    return dict(
        code=f.code, name=f.name, place=f.place, rows=[(label, value) for label, value in rows if value != ""],
        destinations_by=f.measure,
        columns=[name for name, _ in columns],
        destinations=[(d.code, _label(d), [cell(d) for _, cell in columns]) for d in f.destinations],
        **_history(f, scale),
        # widths in proportion to the charts' own, so their bars come out the same width (charts.SLOT)
        charts=[dict(width=f"{w / total * (100 - CHART_GAP):.3f}", svg=Markup(svg)) for w, svg in charts],
        poster=Markup(poster),
    )


def _tiles(kind, side, codes, posters, diagrams):
    if kind == "posters":
        return [Markup(_cover(reprefix(posters[c], c, f"{side}-"))) for c in codes]
    if kind == "diagrams":
        return [Markup(_cover(diagrams[c])) for c in codes]
    return None   # codes: the template writes them


def book_html(airports: list[tuple[BookAirport, AirportFacts]], posters: dict[str, str], *, page_size: str = "letter",
              title: str = "US airports", subtitle: str = "", endpapers: tuple[str, str] = ("posters", "codes"),
              diagrams: dict[str, str] | None = None, endpaper_posters: dict[str, str] | None = None,
              distances: str = "foot") -> str:
    """posters: code -> the poster facing its data page, cropped here to the page's shape to fill it. endpaper_posters:
    code -> the plainer one for a poster endpaper (aeroways and roads, no railways or labels). distances: where the
    distance rows go (DISTANCES)."""
    if page_size not in PAGE_SIZES:
        raise ValueError(f"unknown page size {page_size!r}: one of {', '.join(PAGE_SIZES)}")
    if distances not in DISTANCES:
        raise ValueError(f"unknown distances position {distances!r}: one of {', '.join(DISTANCES)}")
    for kind in endpapers:
        if kind not in ENDPAPERS:
            raise ValueError(f"unknown endpaper {kind!r}: one of {', '.join(ENDPAPERS)}")
    codes = [e.code for e, _ in airports]
    if "diagrams" in endpapers and not (diagrams and all(c in diagrams for c in codes)):
        raise ValueError("diagram endpapers need a diagram for every airport")
    if "posters" in endpapers and not (endpaper_posters and all(c in endpaper_posters for c in codes)):
        raise ValueError("poster endpapers need an endpaper poster for every airport")
    width, height = PAGE_SIZES[page_size]
    env = Environment(loader=FileSystemLoader(TEMPLATES), autoescape=True)
    grid = grid_shape(len(codes), page_size) if codes else (1, 1)
    css = env.get_template("book.css").render(
        page_width=width, page_height=height, root_size=ROOT_SIZES[page_size],
        content_height=f"{_inches(height) - 2 * PAGE_MARGIN:g}in",
        distances_top=f"{distances_top(page_size):.3f}in",
        code_tile_padding=code_tile_padding(grid[1], page_size),
    )
    book = dict.fromkeys(codes)
    first = airports[0][1] if airports else None
    return env.get_template("book.html").render(
        css=Markup(css), title=title, subtitle=subtitle,
        first_year=first.first_year if first else "", last_year=first.last_year if first else "",
        pages=[_page(e, f, crop(posters[e.code], _inches(width) / _inches(height)), book, distance_scale(airports))
               for e, f in airports],
        distances=distances,
        grid=grid,
        alphabetical=sorted(codes),   # the endpapers: an index in their own order, not the contents again
        endpapers=[dict(side=side, kind=kind, tiles=_tiles(kind, side, sorted(codes), endpaper_posters, diagrams))
                   for side, kind in zip(("front", "back"), endpapers)],
    )
