import re
from dataclasses import replace

import pytest

from scripts.book.data import AirportFacts, BookAirport, Destination, YearFigures
from scripts.book.charts import chart_width
from scripts.book.render import TABLE_ROWS, book_html, code_tile_padding, grid_shape, label_for



def facts(code="ATL", **kw):
    base = AirportFacts(
        code=code, name=f"{code} International", place=f"{code.title()}ville, GA", market=None, market_airports=[],
        first_year=1990, last_year=2025, passenger_rank_first=2, passenger_rank_last=1,
        freight_rank_first=10, freight_rank_last=12,
        places=220, airline_groups=30, top_airlines=[("Delta Air Lines", 0.72), ("Southwest Airlines", 0.08)], other_airlines_share=None,
        destinations=[Destination("MCO", "Orlando International", 2_700_000, 5_000_000), Destination("LGA", "LaGuardia", 2_200_000, 600_000)],
        measure="passengers", series=[YearFigures(y, 1_000_000 * (y - 1980), 10_000_000) for y in range(1990, 2026)],
    )
    return replace(base, **kw)


def entry(code="ATL"):
    return BookAirport(code, 1, 12, True, True)


def poster(code):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1260"><path id="{code}-r1" d="M0 0"/></svg>'


def render(airports=None, **kw):
    airports = airports or [(entry("ATL"), facts("ATL")), (entry("MEM"), facts("MEM"))]
    posters = {e.code: poster(e.code) for e, _ in airports}
    return book_html(airports, posters, **{"endpaper_posters": posters, **kw})


def _section(html, id_):
    start = html.index(f'id="{id_}"')
    end = html.find("<section", start)
    return html[start:end if end != -1 else None]


def test_sections_in_book_order():
    ids = re.findall(r'<section[^>]*\bid="([^"]+)"', render())
    assert ids == ["title", "endpaper-front", "contents", "data-ATL", "poster-ATL", "data-MEM", "poster-MEM", "credits", "endpaper-back",
                   "back-cover"]


def test_contents_links_every_airport():
    contents = _section(render(), "contents")
    assert re.findall(r'href="#data-(\w+)"', contents) == ["ATL", "MEM"]


def test_table_rows_follow_table_rows():
    data = _section(render(), "data-ATL")
    shown = re.findall(r'<tr class="fact[^"]*"><th>(.*?)</th>', data)
    expected = [label_for(label, facts("ATL")) for label, value in TABLE_ROWS if value(facts("ATL"), {}) != ""]
    assert shown == expected
    assert "Metropolitan area" not in data
    assert "Metropolitan area" in _section(render([(entry(), facts(market="New York area", market_airports=["JFK", "LGA"]))]), "data-ATL")


def test_facts_table_rows():
    data = _section(render(), "data-ATL")
    assert re.findall(r'<tr class="fact[^"]*"><th>(.*?)</th>', data) == [
        "Places served (24+ flights)", "Airlines at this airport, 2025", "Top airlines"]
    assert "Busiest international" not in data


def test_rank_over_time_table_above_the_charts():
    data = _section(render([(entry(), facts(passenger_rank_first=None))]), "data-ATL")
    table = data[data.index("<h2>Rank over time</h2>"):data.index('class="charts"')]
    assert data.index('class="destinations"') < data.index("<h2>Rank over time</h2>")
    cells = [re.sub(r"<[^>]+>", "", c) for c in re.findall(r"<t[hd][^>]*>.*?</t[hd]>", table)]
    assert cells == ["", "1990", "2025", "Passenger", "—", "1st", "Freight", "10th", "12th"]


def test_freight_ranked_destinations_put_freight_first():
    data = _section(render([(entry(), facts(measure="freight"))]), "data-ATL")
    table = data[data.index('class="destinations"'):]
    assert table.index("Freight") < table.index("Passengers")
    data = _section(render(), "data-ATL")
    table = data[data.index('class="destinations"'):]
    assert table.index("Passengers") < table.index("Freight")


def test_contents_page_numbers_follow_the_links():
    html = render()
    assert "target-counter(attr(href url), page)" in html
    rule = re.search(r"section\.contents a \{([^}]*)\}", html).group(1)
    assert "flex" not in rule   # WeasyPrint resolves no target-counter inside a flex link: every page number reads 0


def test_destinations_abroad_name_their_country():
    f = facts(destinations=[Destination("YYZ", "Toronto Pearson", 1_000_000, 0, "Canada"), Destination("LGA", "LaGuardia", 900_000, 0)])
    data = _section(render([(entry(), f)]), "data-ATL")
    assert "<td>Toronto Pearson, Canada</td>" in data and "<td>LaGuardia</td>" in data


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


def test_poster_page_has_only_the_poster_and_its_number():
    html = render()
    page = _section(html, "poster-ATL")
    assert not re.search(r"<p[ >]", page) and "Atlville" not in page
    # a bleed page has no margin for the number, so it sits over the poster, on white
    assert '<span class="folio" data-page="#poster-ATL"></span>' in page
    assert re.search(r"section\.poster \.folio \{[^}]*background: #fff", html)


def test_top_airlines_a_table_of_four_then_the_others():
    f = facts(top_airlines=[("Delta Air Lines", 0.72), ("Fish & Chips Air", 0.08)], other_airlines_share=0.2)
    data = _section(render([(entry(), f)]), "data-ATL")
    table = data[data.index("<th>Top airlines</th>"):]
    table = table[:table.index("</table>")]
    assert re.findall(r'<tr><td>([^<]*)</td><td class="num">(.*?)</td>', table) == [
        ("Delta Air Lines", "72.0%"), ("Fish &amp; Chips Air", "8.0%"), ("Others", "20.0%")]
    plain = _section(render(), "data-ATL")
    assert "Others" not in plain


def test_freight_page_chart_order():
    data = _section(render([(entry(), facts(measure="freight"))]), "data-ATL")
    charts = data[data.index('class="charts"'):]
    assert charts.index("Freight (tons)") < charts.index(">Passengers<")
    passenger = _section(render(), "data-ATL")
    charts = passenger[passenger.index('class="charts"'):]
    assert charts.index(">Passengers<") < charts.index("Freight (tons)")


def test_freight_chart_from_2003_with_bars_as_wide_as_the_passenger_chart():
    data = _section(render(), "data-ATL")
    boxes = re.findall(r'<div class="chart-box" style="width: ([\d.]+)%">(.*?)</svg>', data, re.S)
    (pax_width, pax), (freight_width, freight) = boxes
    assert re.findall(r'class="x-label"[^>]*>(\d+)<', freight)[0] == "2003"
    assert re.findall(r'class="x-label"[^>]*>(\d+)<', pax)[0] == "1990"
    assert float(pax_width) / float(freight_width) == pytest.approx(chart_width(1990, 2025) / chart_width(2003, 2025), rel=1e-3)


def test_market_airports_in_the_book_get_page_numbers():
    f = facts(market="Memphis area", market_airports=["MEM", "NQA"])
    data = _section(render([(entry(), f), (entry("MEM"), facts("MEM"))]), "data-ATL")
    assert 'Memphis area (with <a class="ref" href="#data-MEM">MEM</a>, NQA)' in data


def test_destination_headers_padded_like_their_cells():
    assert re.search(r"table\.destinations th, table\.destinations td \{[^}]*padding", render())


def test_credits_name_the_sources_and_the_scale():
    credits = _section(render(), "credits")
    assert "same scale" in credits
    assert "openstreetmap.org" in credits and "transtats.bts.gov" in credits


@pytest.mark.parametrize("n, size, shape", [
    (63, "letter", (7, 9)),        # full, and 9:7 is near Letter's 11:8.5
    (64, "letter", (8, 8)),        # full, though squarer than the page: 7 x 10 would leave six cells empty
    (61, "letter", (7, 9)),        # a prime: a short last row rather than one long column
    (30, "half-letter", (5, 6)),
    (2, "letter", (1, 2)),
])
def test_grid_shape_fills_the_page(n, size, shape):
    assert grid_shape(n, size) == shape


def test_poster_endpapers_reprefix_ids():
    html = render(endpapers=("posters", "posters"))
    ids = re.findall(r'id="([^"]+)"', html)
    assert len(ids) == len(set(ids))
    front = _section(html, "endpaper-front")
    assert 'id="front-ATL-r1"' in front and 'id="front-MEM-r1"' in front


def test_code_endpaper_links_every_airport():
    back = _section(render(endpapers=("posters", "codes")), "endpaper-back")
    assert re.findall(r'href="#data-(\w+)"', back) == ["ATL", "MEM"]


def test_diagram_endpaper_uses_the_diagrams():
    diagrams = {"ATL": '<svg viewBox="0 0 400 400"><path class="ac-runway" d="M0 0"/></svg>', "MEM": '<svg viewBox="0 0 400 400"></svg>'}
    front = _section(render(endpapers=("diagrams", "codes"), diagrams=diagrams), "endpaper-front")
    assert front.count("<svg") == 2 and "ac-runway" in front


def test_diagram_endpaper_needs_diagrams():
    with pytest.raises(ValueError):
        render(endpapers=("diagrams", "codes"))


def test_page_numbers_in_the_outer_bottom_corners_but_not_on_the_cover_pages():
    html = render()
    assert re.search(r"@page :left \{[^}]*@bottom-left \{ content: counter\(page\)", html)
    assert re.search(r"@page :right \{[^}]*@bottom-right \{ content: counter\(page\)", html)
    for section in ("title", "back-cover"):
        assert re.search(rf"section\.{section} \{{ page: bare; \}}", html)
    assert re.search(r"section\.endpaper, section\.poster \{ page: bleed; \}", html)


def test_endpapers_bleed_to_the_page_edge():
    html = render()
    assert re.search(r"@page bleed \{ margin: 0;", html)
    front = _section(html, "endpaper-front")
    assert "grid-template-columns: repeat(1, minmax(0, 1fr)); grid-template-rows: repeat(2, minmax(0, 1fr))" in front


def test_endpaper_tiles_cover_their_cells():
    front = _section(render(endpapers=("posters", "codes")), "endpaper-front")
    roots = re.findall(r"<svg\b[^>]*>", front)
    assert len(roots) == 2 and all('preserveAspectRatio="xMidYMid slice"' in r for r in roots)


def test_code_tiles_centred_by_padding():
    assert code_tile_padding(9, "letter") == "24.7pt"   # 88pt cells, 38.6pt of text
    assert f"padding-top: {code_tile_padding(2, 'letter')}" in render()   # the test book's two airports: 1 x 2
    assert code_tile_padding(200, "letter") == "0.0pt"   # never negative


def test_endpapers_are_alphabetical_unlike_the_contents():
    html = render([(entry("MEM"), facts("MEM")), (entry("ATL"), facts("ATL"))], endpapers=("posters", "codes"))
    assert re.findall(r'href="#data-(\w+)"', _section(html, "contents")) == ["MEM", "ATL"]
    assert re.findall(r'href="#data-(\w+)"', _section(html, "endpaper-back")) == ["ATL", "MEM"]
    assert re.findall(r'id="front-(\w+)-r1"', _section(html, "endpaper-front")) == ["ATL", "MEM"]


def test_the_print_posters_face_their_data_and_the_endpaper_has_its_own():
    airports = [(entry("ATL"), facts("ATL")), (entry("MEM"), facts("MEM"))]
    prints = {c: poster(c).replace(f"{c}-r1", f"{c}-print") for c in ("ATL", "MEM")}
    html = book_html(airports, prints, endpaper_posters={c: poster(c) for c in ("ATL", "MEM")}, endpapers=("posters", "codes"))
    assert 'id="ATL-print"' in _section(html, "poster-ATL")
    front = _section(html, "endpaper-front")
    assert "ATL-print" not in front and 'id="front-ATL-r1"' in front


def test_poster_endpapers_need_the_endpaper_posters():
    airports = [(entry("ATL"), facts("ATL"))]
    with pytest.raises(ValueError, match="poster endpapers"):
        book_html(airports, {"ATL": poster("ATL")}, endpapers=("posters", "codes"))
    assert book_html(airports, {"ATL": poster("ATL")}, endpapers=("codes", "codes"))


@pytest.mark.parametrize("page_size, view_box", [("letter", "113.18 0 973.64 1260"), ("half-letter", "192.35 0 815.29 1260")])
def test_posters_fill_their_pages_cropped_to_the_page_shape(page_size, view_box):
    html = render(page_size=page_size)
    assert re.search(r"@page bleed \{ margin: 0;", html)
    assert re.search(r"section\.endpaper, section\.poster \{ page: bleed; \}", html)
    assert f'viewBox="{view_box}"' in _section(html, "poster-ATL")
