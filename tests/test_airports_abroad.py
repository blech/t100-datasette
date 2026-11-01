import re

from tests.helpers import get

ABROAD = "/airports?region=abroad"


def sentence(html):
    return " ".join(re.search(r'<p class="chart-sentence">(.*?)</p>', html, re.S).group(1).split())


def test_the_airports_sentence_offers_us_airports_or_airports_abroad(ds):
    text = sentence(get(ds, "/airports").text)
    assert re.findall(r'<select id="([^"]+)"', text) == ["table-n", "table-group", "table-region", "table-service", "table-rank", "dir"]
    assert '<option value="us" selected>in the US</option><option value="abroad">abroad</option>' in text
    assert '<option value="" selected>both directions</option><option value="out">departing</option><option value="in">arriving</option>' in text


def test_abroad_the_flights_menu_is_fixed_text_and_the_directions_are_to_and_from_the_us(ds):
    text = sentence(get(ds, ABROAD).text)
    assert re.findall(r'<select id="([^"]+)"', text) == ["table-n", "table-group", "table-region", "table-rank", "dir"]
    assert '<option value="abroad" selected>abroad</option>' in text
    assert 'for <span id="table-service">international flights</span>' in text
    assert '<option value="" selected>to and from the US</option><option value="out">to the US</option><option value="in">from the US</option>' in text
    assert "counting flights" in text and "in <select id=\"dir\"" not in text


def test_abroad_the_page_says_it_counts_only_flights_to_and_from_the_us(ds):
    html = get(ds, ABROAD).text
    assert "<h1>Busiest airports abroad</h1>" in html
    assert 'id="abroad-note"' in html and "outside the US" in html and "only their flights to and from the US" in html
    assert 'data-region="abroad"' in html
    us = get(ds, "/airports").text
    assert "<h1>Busiest US airports</h1>" in us and 'id="abroad-note"' not in us and 'data-region="us"' in us


def test_abroad_the_flight_count_column_says_which_way(ds):
    heading = lambda path: re.search(r'data-sort="deps"><button type="button">([^<]*)<', get(ds, path).text).group(1)
    assert [heading(f"{ABROAD}&dir={d}") for d in ("", "out", "in")] == ["Flights", "Flights to the US", "Flights from the US"]
    assert [heading(f"/airports?dir={d}") for d in ("", "out", "in")] == ["Flights", "Departures", "Arrivals"]


def test_abroad_destinations_are_us_airports(ds):
    note = get(ds, ABROAD).text
    assert "Destinations counts US airports" in note and "Destinations counts other airports" not in note
    assert "Destinations counts other airports" in get(ds, "/airports").text


def test_over_time_has_no_region_menu(ds):
    assert "region" not in sentence(get(ds, "/airports/over-time").text)
