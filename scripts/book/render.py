"""The whole book as one HTML document, for WeasyPrint: title, front endpaper, contents, a data page (left) and poster page
(right) for each airport, then credits, back endpaper and back cover."""

import math
import re
from pathlib import Path
from typing import Callable

from jinja2 import Environment, FileSystemLoader
from markupsafe import Markup

from scripts.book.charts import FREIGHT_COLOR, PASSENGER_COLOR, bar_chart, chart_width
from scripts.book.data import AirportFacts, BookAirport
from scripts.book.format import DASH, dense_count, rank, share, tons
from scripts.book.posters import reprefix

TEMPLATES = Path(__file__).resolve().parent / "templates"

PAGE_SIZES = {"letter": ("8.5in", "11in"), "half-letter": ("5.5in", "8.5in")}
# the type scales with the page, so half-letter needs no second stylesheet
ROOT_SIZES = {"letter": "11pt", "half-letter": "7.5pt"}
ENDPAPERS = ("posters", "diagrams", "codes")

FREIGHT_FIRST_YEAR = 2003   # freight's chart starts here: BTS added domestic all-cargo airlines in October 2002 (about.html)
CHART_GAP = 4   # % of the page's width between the two charts


def _label(d):
    """A destination's name, with its country if it's outside the US."""
    return f"{d.label}, {d.country}" if d.country else d.label


def _airlines(f, book):
    """The top airlines and the rest together, as a table so the shares line up: the facts table's last row, the only one
    that runs over several lines."""
    rows = list(f.top_airlines) + ([("Others", f.other_airlines_share)] if f.other_airlines_share else [])
    if not rows:
        return DASH
    cells = Markup("").join(Markup('<tr><td>{}</td><td class="num">{}</td></tr>').format(name, share(s)) for name, s in rows)
    return Markup('<table class="airlines">{}</table>').format(cells)


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
    ("Top airlines", _airlines),
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


def _page(entry: BookAirport, f: AirportFacts, poster: str, book: dict):
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
        rank_years=(f.first_year, f.last_year),
        ranks=[("Passenger", rank(f.passenger_rank_first), rank(f.passenger_rank_last)),
               ("Freight", rank(f.freight_rank_first), rank(f.freight_rank_last))],
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
              diagrams: dict[str, str] | None = None, poster_offsets: dict[str, float] | None = None) -> str:
    """poster_offsets: code -> px to move the poster down its page (pdf.poster_offsets measures them from a first layout)."""
    if page_size not in PAGE_SIZES:
        raise ValueError(f"unknown page size {page_size!r}: one of {', '.join(PAGE_SIZES)}")
    for kind in endpapers:
        if kind not in ENDPAPERS:
            raise ValueError(f"unknown endpaper {kind!r}: one of {', '.join(ENDPAPERS)}")
    codes = [e.code for e, _ in airports]
    if "diagrams" in endpapers and not (diagrams and all(c in diagrams for c in codes)):
        raise ValueError("diagram endpapers need a diagram for every airport")
    env = Environment(loader=FileSystemLoader(TEMPLATES), autoescape=True)
    grid = grid_shape(len(codes), page_size) if codes else (1, 1)
    css = env.get_template("book.css").render(
        page_width=PAGE_SIZES[page_size][0], page_height=PAGE_SIZES[page_size][1], root_size=ROOT_SIZES[page_size],
        poster_offsets=poster_offsets or {}, code_tile_padding=code_tile_padding(grid[1], page_size),
    )
    book = dict.fromkeys(codes)
    first = airports[0][1] if airports else None
    return env.get_template("book.html").render(
        css=Markup(css), title=title, subtitle=subtitle,
        first_year=first.first_year if first else "", last_year=first.last_year if first else "",
        pages=[_page(e, f, posters[e.code], book) for e, f in airports],
        grid=grid,
        alphabetical=sorted(codes),   # the endpapers: an index in their own order, not the contents again
        endpapers=[dict(side=side, kind=kind, tiles=_tiles(kind, side, sorted(codes), posters, diagrams))
                   for side, kind in zip(("front", "back"), endpapers)],
    )
