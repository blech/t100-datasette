"""The whole book as one HTML document, for WeasyPrint: title, front endpaper, contents, a data page (left) and poster page
(right) for each airport, then credits, back endpaper and back cover."""

import math
from pathlib import Path
from typing import Callable

from jinja2 import Environment, FileSystemLoader
from markupsafe import Markup, escape

from scripts.book.charts import FREIGHT_COLOR, PASSENGER_COLOR, bar_chart
from scripts.book.data import AirportFacts, BookAirport
from scripts.book.format import DASH, dense_count, miles, rank, share, tons
from scripts.book.posters import reprefix

TEMPLATES = Path(__file__).resolve().parent / "templates"

PAGE_SIZES = {"letter": ("8.5in", "11in"), "half-letter": ("5.5in", "8.5in")}
# the type scales with the page, so half-letter needs no second stylesheet
ROOT_SIZES = {"letter": "11pt", "half-letter": "7.5pt"}
ENDPAPERS = ("posters", "diagrams", "codes")

# words for the page's measure, for the labels: {noun}, {nouns}, {Nouns}
_WORDS = {"passengers": dict(noun="passenger", nouns="passengers", Nouns="Passengers"),
          "freight": dict(noun="freight", nouns="freight", Nouns="Freight")}


def _amount(f, value):
    """A value in the page's measure: passengers, or lb shown as tons."""
    if value is None:
        return DASH
    return dense_count(value) if f.measure == "passengers" else tons(value)


def _airlines(f, book):
    """One airline a line: the table's last row, as it's the one that runs over several."""
    return Markup("<br>").join(f"{name} {share(s)}" for name, s in f.top_airlines) or DASH


def _peak(f, book):
    return f"{f.peak_year} ({_amount(f, f.peak_value)})" if f.peak_year else DASH


def _international(f, book):
    """In the page's measure: passengers, or tons where the destinations are ranked by freight."""
    d = f.busiest_international
    if not d:
        return DASH
    amount = tons(d.freight_lb) if f.measure == "freight" else dense_count(d.passengers)
    return f"{d.code} {d.label} ({amount})"


def _longest(f, book):
    return f"{f.longest_route[0]}, {miles(f.longest_route[1])}" if f.longest_route else DASH


def _market(f, book):
    """The market's other airports, those in the book linked to their page (the page number is added by the CSS)."""
    if not f.market:
        return ""
    others = Markup(", ").join(Markup('<a class="ref" href="#data-{0}">{0}</a>').format(c) if c in book else c
                               for c in f.market_airports)
    return Markup("{} (with {})").format(f.market, others)


# The table, in order: (label, value(facts, codes in the book)). Labels may use {first} and {last} for the years, and {noun},
# {nouns} or {Nouns} for the page's measure. A value of "" leaves the row out. Cut or reorder rows here.
TABLE_ROWS: list[tuple[str, Callable[[AirportFacts, dict], str]]] = [
    ("Passengers {first}", lambda f, book: dense_count(f.passengers_first)),
    ("Passengers {last}", lambda f, book: dense_count(f.passengers_last)),
    ("Freight {first}", lambda f, book: tons(f.freight_first_lb)),
    ("Freight {last}", lambda f, book: tons(f.freight_last_lb)),
    ("Passenger rank {first}", lambda f, book: rank(f.passenger_rank_first)),
    ("Passenger rank {last}", lambda f, book: rank(f.passenger_rank_last)),
    ("Freight rank {first}", lambda f, book: rank(f.freight_rank_first)),
    ("Freight rank {last}", lambda f, book: rank(f.freight_rank_last)),
    ("Peak {noun} year", _peak),
    ("{Nouns} in 2020", lambda f, book: _amount(f, f.value_2020)),
    ("Places served (24+ flights)", lambda f, book: f"{f.places:,}"),
    ("Airline groups", lambda f, book: f"{f.airline_groups:,}"),
    ("International share of {nouns}", lambda f, book: share(f.international_share)),
    ("Busiest international destination", _international),
    ("Longest route", _longest),
    ("City market", _market),
    ("Top airlines", _airlines),
]


def label_for(label: str, f: AirportFacts) -> str:
    return label.format(first=f.first_year, last=f.last_year, **_WORDS[f.measure])


def grid_columns(n: int) -> int:
    """Columns for an endpaper grid of n roughly square tiles: the fewest whose rows still fit the page's height."""
    return next(c for c in range(1, n + 1) if math.ceil(n / c) * 1.15 <= c * 1.3)


def _page(entry: BookAirport, f: AirportFacts, poster: str, book: dict):
    rows = [(label_for(label, f), value(f, book)) for label, value in TABLE_ROWS]
    columns = [("Passengers", lambda d: dense_count(d.passengers)), ("Freight", lambda d: tons(d.freight_lb))]
    span = dict(first_year=f.first_year, last_year=f.last_year)
    charts = [
        Markup(bar_chart([(s.year, s.passengers) for s in f.series], color=PASSENGER_COLOR, label="Passengers", **span)),
        Markup(bar_chart([(s.year, s.freight_lb) for s in f.series], color=FREIGHT_COLOR, label="Freight (tons)", scale=2000, **span)),
    ]
    if f.measure == "freight":   # the page's measure first
        columns.reverse()
        charts.reverse()
    return dict(
        code=f.code, name=f.name, place=f.place, rows=[(label, value) for label, value in rows if value != ""],
        destinations_by=f.measure,
        columns=[name for name, _ in columns],
        destinations=[(d.code, d.label, [cell(d) for _, cell in columns]) for d in f.destinations],
        charts=charts,
        poster=Markup(poster),
    )


def _tiles(kind, side, codes, posters, diagrams):
    if kind == "posters":
        return [Markup(reprefix(posters[c], c, f"{side}-")) for c in codes]
    if kind == "diagrams":
        return [Markup(diagrams[c]) for c in codes]
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
    css = env.get_template("book.css").render(
        page_width=PAGE_SIZES[page_size][0], page_height=PAGE_SIZES[page_size][1], root_size=ROOT_SIZES[page_size],
        poster_offsets=poster_offsets or {},
    )
    book = dict.fromkeys(codes)
    first = airports[0][1] if airports else None
    return env.get_template("book.html").render(
        css=Markup(css), title=title, subtitle=subtitle,
        first_year=first.first_year if first else "", last_year=first.last_year if first else "",
        pages=[_page(e, f, posters[e.code], book) for e, f in airports],
        columns=grid_columns(len(codes)) if codes else 1,
        endpapers=[dict(side=side, kind=kind, tiles=_tiles(kind, side, codes, posters, diagrams))
                   for side, kind in zip(("front", "back"), endpapers)],
    )
