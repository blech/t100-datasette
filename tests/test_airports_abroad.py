import re
import sqlite3

from tests.helpers import get, get_json
from tests.test_top_airports import abroad

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


def test_over_time_has_the_same_region_menu_and_abroad_the_same_words(ds):
    us = get(ds, "/airports/over-time").text
    assert re.findall(r'<select id="([^"]+)"', sentence(us)) == ["matrix-measure", "matrix-n", "matrix-group", "matrix-region", "matrix-service", "matrix-rank", "dir"]
    assert '<option value="us" selected>in the US</option>' in us and "countries" not in us
    abroad_page = get(ds, "/airports/over-time?region=abroad").text
    assert re.findall(r'<select id="([^"]+)"', sentence(abroad_page)) == ["matrix-measure", "matrix-n", "matrix-group", "matrix-region", "matrix-rank", "dir"]
    assert '<option value="abroad" selected>abroad</option>' in abroad_page and '<option value="country">countries</option>' in abroad_page
    assert '<span id="matrix-service">international flights</span>' in abroad_page and "to the US" in abroad_page
    assert 'data-region="abroad"' in abroad_page and "Every airport outside the US" in abroad_page


def test_airport_by_year_region_abroad_gives_the_airports_outside_the_us(ds, db_path):
    from tests.test_airports_matrix import totals
    totals(db_path)
    abroad_rows = get_json(ds, "/t100/airport_by_year.json?_shape=objects&_size=max&region=abroad")["rows"]
    assert {r["airport"] for r in abroad_rows} == {"LHR"}
    assert {r["airport"] for r in get_json(ds, "/t100/airport_by_year.json?_shape=objects&_size=max")["rows"]} == {"ATL"}


def test_countries_are_a_grouping_only_abroad(ds):
    abroad = get(ds, ABROAD).text
    assert '<option value="country">countries</option>' in abroad
    assert "countries" not in get(ds, "/airports").text


def test_a_country_has_a_page_and_unknown_ones_are_not_found(ds, db_path):
    abroad(db_path)
    abroad_page = get(ds, "/airports/countries/united-kingdom")
    assert abroad_page.status_code == 200 and "<h1>Airports in United Kingdom</h1>" in abroad_page.text
    assert 'data-country="United Kingdom"' in abroad_page.text
    assert get(ds, "/airports/countries/atlantis").status_code == 404


def test_the_countries_are_the_airports_table_grouped_by_country_abroad_at_their_own_address(ds):
    html = get(ds, "/airports/countries").text
    assert 'data-group="country"' in html and 'data-region="abroad"' in html and "<h1>Busiest countries</h1>" in html
    assert '<option value="abroad" selected>abroad</option>' in sentence(html)
    assert re.search(r'<li><a href="/airports">airports</a></li>\s*<li aria-current="page">countries</li>', html)


def test_the_country_pages_first_addresses_move_to_the_airports_section(ds):
    for old, new in (("/countries", "/airports/countries"), ("/countries/united-kingdom?dir=out", "/airports/countries/united-kingdom?dir=out"),
                     ("/airports?region=abroad&group=country&sort=freight", "/airports/countries?sort=freight")):
        r = get(ds, old)
        assert r.status_code == 301 and r.headers["location"] == new, old
    assert get(ds, "/airports?group=country").status_code == 200   # countries are only abroad: this is just the airports


def test_a_countrys_trail_runs_through_the_countries(ds, db_path):
    abroad(db_path)
    html = get(ds, "/airports/countries/united-kingdom").text
    assert re.search(r'<li><a href="/airports">airports</a></li>\s*<li><a href="/airports/countries">countries</a></li>\s*'
                     r'<li aria-current="page">United Kingdom</li>', html)
    assert '<a href="/airports/countries">All countries</a>' in html
    assert '<strong aria-current="true">Airports</strong>' in html


def test_country_slugs_drop_accents_and_punctuation():
    from plugins.t100_globe import country_slug
    assert [country_slug(n) for n in ("United Kingdom", "Congo (Kinshasa)", "Cote d'Ivoire", "Côte d'Ivoire", "U.S.S.R.")] == [
        "united-kingdom", "congo-kinshasa", "cote-d-ivoire", "cote-d-ivoire", "u-s-s-r"]


def test_a_country_page_switches_between_airports_and_cities(ds, db_path):
    abroad(db_path)
    text = get(ds, "/airports/countries/united-kingdom").text
    assert '<select id="group" aria-label="Airports or cities"><option value="airport">airports</option><option value="city">cities</option></select> in United Kingdom' in text


def test_a_foreign_airports_country_links_to_its_page_and_a_us_airports_does_not(ds, db_path):
    abroad(db_path)
    conn = sqlite3.connect(db_path)
    conn.execute("INSERT OR REPLACE INTO airport_names (code, name) VALUES ('LHR', 'London, United Kingdom')")
    conn.commit()
    conn.close()
    page = get(ds, "/airports/LHR").text
    assert '<a href="/airports/countries/united-kingdom">United Kingdom</a>' in page
    assert "/countries/" not in get(ds, "/airports/JFK").text


def test_a_route_page_links_the_country_of_each_foreign_end(ds, db_path):
    abroad(db_path)
    conn = sqlite3.connect(db_path)
    conn.execute("INSERT OR REPLACE INTO airport_names (code, name) VALUES ('LHR', 'London, United Kingdom')")
    conn.commit()
    conn.close()
    for path in ("/airports/LHR/JFK", "/airports/JFK/LHR", "/airports/LHR/JFK?dir=out"):
        page = get(ds, path).text
        assert page.count('<a href="/airports/countries/united-kingdom">United Kingdom</a>') == 1, path
