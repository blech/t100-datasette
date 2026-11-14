import re
from dataclasses import replace
from pathlib import Path

import pytest

from scripts.book.data import AirportFacts, BookAirport, Destination, YearFigures
from scripts.book.render import TABLE_ROWS, book_html

FONTS = Path(__file__).resolve().parent.parent / "static" / "common" / "fonts"


def facts(code="ATL", **kw):
    base = AirportFacts(
        code=code, name=f"{code} International", place=f"{code.title()}ville, GA", market=None, market_airports=[],
        first_year=1990, last_year=2025, passengers_first=48_000_000, passengers_last=103_000_000,
        freight_first_lb=800_000_000, freight_last_lb=1_500_000_000, passenger_rank_first=2, passenger_rank_last=1,
        freight_rank_first=10, freight_rank_last=12, peak_year=2019, peak_passengers=110_000_000, passengers_2020=43_000_000,
        places=220, airline_groups=30, top_airlines=[("Delta Air Lines", 0.72), ("Southwest Airlines", 0.08)],
        international_share=0.11, busiest_international=Destination("CUN", "Cancun International", 900_000, 0),
        longest_route=("JNB", 8439),
        destinations=[Destination("MCO", "Orlando International", 2_700_000, 5_000_000), Destination("LGA", "LaGuardia", 2_200_000, 600_000)],
        destinations_by="passengers", series=[YearFigures(y, 1_000_000 * (y - 1980), 10_000_000) for y in range(1990, 2026)],
    )
    return replace(base, **kw)


def entry(code="ATL"):
    return BookAirport(code, 1, 12, True, True)


def poster(code):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1260"><path id="{code}-r1" d="M0 0"/></svg>'


def render(airports=None, **kw):
    airports = airports or [(entry("ATL"), facts("ATL")), (entry("MEM"), facts("MEM"))]
    return book_html(airports, {e.code: poster(e.code) for e, _ in airports}, fonts_dir=FONTS, **kw)


def _section(html, id_):
    start = html.index(f'id="{id_}"')
    end = html.find("<section", start)
    return html[start:end if end != -1 else None]


def test_sections_in_book_order():
    ids = re.findall(r'<section[^>]*\bid="([^"]+)"', render())
    assert ids == ["title", "blank", "contents", "data-ATL", "poster-ATL", "data-MEM", "poster-MEM", "credits"]


def test_contents_links_every_airport():
    contents = _section(render(), "contents")
    assert re.findall(r'href="#data-(\w+)"', contents) == ["ATL", "MEM"]


def test_table_rows_follow_table_rows():
    data = _section(render(), "data-ATL")
    shown = re.findall(r'<tr class="fact"><th>(.*?)</th>', data)
    expected = [label.format(first=1990, last=2025) for label, value in TABLE_ROWS if value(facts("ATL")) != ""]
    assert shown == expected
    assert "City market" not in data
    assert "City market" in _section(render([(entry(), facts(market="New York area", market_airports=["JFK", "LGA"]))]), "data-ATL")


def test_missing_first_year_shows_dash():
    data = _section(render([(entry(), facts(passengers_first=None))]), "data-ATL")
    assert re.search(r"<th>Passengers 1990</th><td>—</td>", data)


def test_freight_ranked_destinations_put_freight_first():
    data = _section(render([(entry(), facts(destinations_by="freight"))]), "data-ATL")
    table = data[data.index('class="destinations"'):]
    assert table.index("Freight") < table.index("Passengers")
    data = _section(render(), "data-ATL")
    table = data[data.index('class="destinations"'):]
    assert table.index("Passengers") < table.index("Freight")


def test_poster_is_inlined_once():
    html = render()
    assert html.count('id="ATL-r1"') == 1
    assert 'id="ATL-r1"' in _section(html, "poster-ATL")


def test_half_letter_page_size():
    assert "size: 5.5in 8.5in" in render(page_size="half-letter")
    assert "size: 8.5in 11in" in render()
    with pytest.raises(ValueError):
        render(page_size="a4")


def test_text_is_escaped():
    html = render([(entry(), facts(name="Fish & Chips Field"))])
    assert "Fish &amp; Chips Field" in html


def test_charts_on_the_data_page():
    data = _section(render(), "data-ATL")
    assert data.count('class="chart"') == 2
