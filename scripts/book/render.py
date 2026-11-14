"""The whole book as one HTML document, for WeasyPrint: title, blank, contents, a data page (left) and poster page (right)
for each airport, then credits."""

from pathlib import Path
from typing import Callable

from jinja2 import Environment, FileSystemLoader
from markupsafe import Markup

from scripts.book.charts import FREIGHT_COLOR, PASSENGER_COLOR, bar_chart
from scripts.book.data import AirportFacts, BookAirport
from scripts.book.format import DASH, dense_count, miles, rank, share, tons

TEMPLATES = Path(__file__).resolve().parent / "templates"

PAGE_SIZES = {"letter": ("8.5in", "11in"), "half-letter": ("5.5in", "8.5in")}
# the type scales with the page, so half-letter needs no second stylesheet
ROOT_SIZES = {"letter": "11pt", "half-letter": "7.5pt"}


def _airlines(f):
    return " · ".join(f"{name} {share(s)}" for name, s in f.top_airlines) or DASH


def _peak(f):
    return f"{f.peak_year} ({dense_count(f.peak_passengers)})" if f.peak_year else DASH


def _international(f):
    """In the page's measure: passengers, or tons where the destinations are ranked by freight."""
    d = f.busiest_international
    if not d:
        return DASH
    amount = tons(d.freight_lb) if f.destinations_by == "freight" else dense_count(d.passengers)
    return f"{d.code} {d.label} ({amount})"


def _longest(f):
    return f"{f.longest_route[0]}, {miles(f.longest_route[1])}" if f.longest_route else DASH


def _market(f):
    return f"{f.market} (with {', '.join(f.market_airports)})" if f.market else ""


# The table, in order: (label, value). Labels may use {first} and {last} for the years. A value of "" leaves the row out.
# Cut or reorder rows here.
TABLE_ROWS: list[tuple[str, Callable[[AirportFacts], str]]] = [
    ("Passengers {first}", lambda f: dense_count(f.passengers_first)),
    ("Passengers {last}", lambda f: dense_count(f.passengers_last)),
    ("Freight {first}", lambda f: tons(f.freight_first_lb)),
    ("Freight {last}", lambda f: tons(f.freight_last_lb)),
    ("Passenger rank {first}", lambda f: rank(f.passenger_rank_first)),
    ("Passenger rank {last}", lambda f: rank(f.passenger_rank_last)),
    ("Freight rank {first}", lambda f: rank(f.freight_rank_first)),
    ("Freight rank {last}", lambda f: rank(f.freight_rank_last)),
    ("Peak passenger year", _peak),
    ("Passengers in 2020", lambda f: dense_count(f.passengers_2020)),
    ("Places served (24+ flights)", lambda f: f"{f.places:,}"),
    ("Airline groups", lambda f: f"{f.airline_groups:,}"),
    ("Top airlines", _airlines),
    ("International share", lambda f: share(f.international_share)),
    ("Busiest international destination", _international),
    ("Longest route", _longest),
    ("City market", _market),
]


def _page(entry: BookAirport, f: AirportFacts, poster: str):
    rows = [(label.format(first=f.first_year, last=f.last_year), value(f)) for label, value in TABLE_ROWS]
    columns = [("Passengers", lambda d: dense_count(d.passengers)), ("Freight", lambda d: tons(d.freight_lb))]
    if f.destinations_by == "freight":
        columns.reverse()
    span = dict(first_year=f.first_year, last_year=f.last_year)
    return dict(
        code=f.code, name=f.name, place=f.place, rows=[(label, value) for label, value in rows if value != ""],
        destinations_by=f.destinations_by,
        columns=[name for name, _ in columns],
        destinations=[(d.code, d.label, [cell(d) for _, cell in columns]) for d in f.destinations],
        passenger_chart=Markup(bar_chart([(s.year, s.passengers) for s in f.series], color=PASSENGER_COLOR, label="Passengers", **span)),
        freight_chart=Markup(bar_chart([(s.year, s.freight_lb) for s in f.series], color=FREIGHT_COLOR, label="Freight (tons)",
                                       scale=2000, **span)),
        poster=Markup(poster),
    )


def book_html(airports: list[tuple[BookAirport, AirportFacts]], posters: dict[str, str], *, page_size: str = "letter",
              title: str = "US airports", subtitle: str = "") -> str:
    if page_size not in PAGE_SIZES:
        raise ValueError(f"unknown page size {page_size!r}: one of {', '.join(PAGE_SIZES)}")
    env = Environment(loader=FileSystemLoader(TEMPLATES), autoescape=True)
    css = env.get_template("book.css").render(
        page_width=PAGE_SIZES[page_size][0], page_height=PAGE_SIZES[page_size][1], root_size=ROOT_SIZES[page_size],
    )
    first = airports[0][1] if airports else None
    return env.get_template("book.html").render(
        css=Markup(css), title=title, subtitle=subtitle,
        first_year=first.first_year if first else "", last_year=first.last_year if first else "",
        pages=[_page(e, f, posters[e.code]) for e, f in airports],
    )
