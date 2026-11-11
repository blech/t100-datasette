import re
import sqlite3

import build_database
from build_database import (rebuild_airport_dir_year, rebuild_airport_market, rebuild_pair_distance, rebuild_route_year_totals,
                            rebuild_top_market_year)
from tests.helpers import add_segments, get, get_json

# two markets of two airports each, one of a single airport with no market, and a flight within a market
CITY = {"LAX": ("32575", "Los Angeles, CA"), "BUR": ("32575", "Burbank, CA"), "SFO": ("32457", "San Francisco, CA"),
        "OAK": ("32457", "Oakland, CA"), "JFK": ("31703", "New York, NY"), "EWR": ("31703", "Newark, NJ")}


def seg(origin, dest, year, pax, distance=300):
    om, oc = CITY.get(origin, (None, f"{origin} town, XX"))
    dm, dc = CITY.get(dest, (None, f"{dest} town, XX"))
    return dict(year=year, month=1, origin=origin, dest=dest, distance=distance, departures_performed=max(1, pax // 10), seats=pax * 2,
                passengers=pax, freight=0, origin_city_market_id=om, origin_city_name=oc, dest_city_market_id=dm, dest_city_name=dc)


def load(db_path, monkeypatch, top=1):
    """With a top of 1: Los Angeles to the Bay Area is the busiest short market pair, made of LAX-SFO and BUR-OAK; New York
    to Los Angeles the busiest long one (Newark's flights more than JFK's, but JFK's passengers more); ZZZ to LAX the second
    short one, kept only with a longer list."""
    monkeypatch.setattr(build_database, "TOP_ROUTES", top)
    add_segments(db_path, "t100_domestic", [
        seg("LAX", "SFO", 2024, 500, distance=337), seg("SFO", "LAX", 2024, 500, distance=337), seg("BUR", "OAK", 2024, 100, distance=325),
        seg("LAX", "BUR", 2024, 999, distance=20),
        seg("JFK", "LAX", 2024, 400, distance=2475), seg("EWR", "LAX", 2024, 5, distance=2454), seg("EWR", "BUR", 2024, 5, distance=2450),
        *(seg("EWR", "JFK", 2024, 1, distance=21) for _ in range(40)),
        seg("ZZZ", "LAX", 2024, 50, distance=400)])
    conn = sqlite3.connect(db_path)
    for rebuild in (rebuild_route_year_totals, rebuild_pair_distance, rebuild_airport_market, rebuild_airport_dir_year, rebuild_top_market_year):
        rebuild(conn)
    conn.close()


# a page's markup with the links inside its heading taken out, to read the heading as words
plain = lambda html: re.sub(r"<h1>(.*?)</h1>", lambda m: f"<h1>{re.sub(r'<[^>]+>', '', m.group(1))}</h1>", html, flags=re.S)


def table(db_path, sql):
    conn = sqlite3.connect(db_path)
    rows = conn.execute(sql).fetchall()
    conn.close()
    return rows


def test_market_name_is_the_city_its_airports_carry_most_passengers_under(db_path, monkeypatch):
    load(db_path, monkeypatch)
    assert dict(table(db_path, "SELECT market_id, name FROM market_name")) == {
        "32575": "Los Angeles, CA", "32457": "San Francisco, CA", "31703": "New York, NY", "solo:ZZZ": "ZZZ town, XX"}


def test_top_market_year_ranks_market_pairs_in_one_band_by_their_weighted_distance(db_path, monkeypatch):
    load(db_path, monkeypatch)
    # flights within a market (LAX-BUR, EWR-JFK) are left out; LA to the Bay Area is 1,000 passengers at 337 miles and 100 at 325
    assert table(db_path, "SELECT ma, mb, year, service, distance, band, passengers, year_rank, overall_rank FROM top_market_year ORDER BY ma") == [
        ("31703", "32575", 2024, "domestic", 2474, 1500, 410, 1, 1), ("32457", "32575", 2024, "domestic", 336, 0, 1100, 1, 1)]
    assert table(db_path, "SELECT year, band, passengers FROM market_band_year ORDER BY band") == [(2024, 0, 1150), (2024, 1500, 410)]


def test_top_market_year_keeps_more_with_a_longer_list(db_path, monkeypatch):
    load(db_path, monkeypatch, top=2)
    assert table(db_path, "SELECT ma, mb, year_rank FROM top_market_year WHERE ma LIKE 'solo:%' OR mb LIKE 'solo:%'") == [("32575", "solo:ZZZ", 2)]


def test_top_markets_by_year_gives_the_market_pairs_with_names_then_the_totals(ds, db_path, monkeypatch):
    load(db_path, monkeypatch)
    body = get_json(ds, "/t100/top_markets_by_year.json?_shape=objects&year=2024")
    assert body["truncated"] is False
    assert [(r["name_a"], r["name_b"], r["distance"], r["passengers"], r["rest"]) for r in body["rows"]] == [
        ("San Francisco, CA", "Los Angeles, CA", 336, 1100, 0), ("New York, NY", "Los Angeles, CA", 2474, 410, 0),
        ("", "", 0, 1150, 1), ("", "", 1500, 410, 1)]


def test_market_pairs_by_year_lists_a_market_pairs_airport_pairs_turned_to_the_market_given_first(ds, db_path, monkeypatch):
    load(db_path, monkeypatch)
    got = lambda ma, mb: [(r["origin"], r["dest"], r["distance"], r["passengers"])
                          for r in get_json(ds, f"/t100/market_pairs_by_year.json?_shape=objects&ma={ma}&mb={mb}")["rows"]]
    assert got("31703", "32575") == [("JFK", "LAX", 2475, 400), ("EWR", "BUR", 2450, 5), ("EWR", "LAX", 2454, 5)]
    assert got("32575", "31703") == [("LAX", "JFK", 2475, 400), ("BUR", "EWR", 2450, 5), ("LAX", "EWR", 2454, 5)]


def test_a_city_pair_page_names_its_cities_and_airports_in_the_order_given(ds, db_path, monkeypatch):
    load(db_path, monkeypatch)
    r = get(ds, "/airports/cities/32575/31703")
    assert r.status_code == 200
    assert "<h1>Los Angeles ↔ New York</h1>" in plain(r.text) and 'data-kind="citypair"' in r.text
    assert 'data-ma="32575" data-mb="31703"' in r.text
    intro = re.sub(r"<[^>]+>", "", r.text)  # each name a link, each code marked with its airport on hover
    assert "Los Angeles, CA (LAX, BUR) and New York, NY (JFK, EWR)" in intro and "2,474 miles" in r.text
    assert re.search(r'<abbr title="[^"]*LAX[^"]*">LAX</abbr>', r.text)
    # each city links to its own page, and the trail runs through the first, as a route's does through its origin
    assert '<a href="/airports/cities/32575">Los Angeles, CA</a>' in r.text and '<a href="/airports/cities/31703">New York, NY</a>' in r.text
    assert ('<li><a href="/airports">airports</a></li> <li><a href="/airports/cities">cities</a></li> '
            '<li><a href="/airports/cities/32575">Los Angeles</a></li>') in re.sub(r"\s+", " ", r.text)
    assert 'aria-current="page">New York<' in r.text
    # the cities settle domestic or international, and three pairs need no top-N menu
    sentence = re.search(r'<p class="chart-sentence">(.*?)</p>', r.text, re.S).group(1)
    assert re.findall(r'<select id="([^"]+)"', sentence) == ["matrix-measure", "matrix-rank"]
    words = lambda html: re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", html))
    assert "for all 3 routes," in words(sentence)
    assert "for both routes," in words(get(ds, "/airports/cities/32575/32457").text)
    assert '<strong aria-current="true">Airports</strong>' in r.text  # a page of the airports section


def test_any_two_cities_with_flights_between_them_have_a_page_and_no_others(ds, db_path, monkeypatch):
    load(db_path, monkeypatch)
    # New York to the Bay Area is too small for the routes matrix (top 1), but is flown
    add_segments(db_path, "t100_domestic", [seg("JFK", "SFO", 2024, 20, distance=2586)])
    conn = sqlite3.connect(db_path)
    rebuild_route_year_totals(conn)
    rebuild_pair_distance(conn)
    conn.close()
    assert table(db_path, "SELECT COUNT(*) FROM top_market_year WHERE mb = '32457'") == [(0,)]
    r = get(ds, "/airports/cities/31703/32457")
    assert r.status_code == 200 and "<h1>New York ↔ San Francisco</h1>" in plain(r.text) and "2,586 miles" in r.text
    assert get(ds, "/airports/cities/32457/99999").status_code == 404  # no such market
    assert get(ds, "/airports/cities/32575/32575").status_code == 404
    assert get(ds, "/airports/cities/32575/99999").status_code == 404
    assert get(ds, "/airports/cities/32575/LAX").status_code == 404


def test_the_cities_are_the_busiest_airports_table_by_city_at_their_own_address(ds):
    html = get(ds, "/airports/cities").text
    assert 'data-group="city"' in html and 'data-region="us"' in html and "<h1>Busiest US cities</h1>" in html
    assert "<title>Busiest cities, " in html
    assert re.search(r'<li><a href="/airports">airports</a></li>\s*<li aria-current="page">cities</li>', html)
    assert '<strong aria-current="page">Busiest airports</strong>' in html  # in the views line, the table grouped another way
    assert "<h1>Busiest cities abroad</h1>" in get(ds, "/airports/cities?region=abroad").text
    # its first address, the table's ?group=city, moves here with its other settings
    r = get(ds, "/airports?group=city&sort=freight&year=2020")
    assert r.status_code == 301 and r.headers["location"] == "/airports/cities?sort=freight&year=2020"
    r = get(ds, "/airports?region=abroad&group=city")
    assert r.status_code == 301 and r.headers["location"] == "/airports/cities?region=abroad"


def test_the_city_pages_first_addresses_move_to_the_airports_section(ds):
    # /cities/... was where they were first built; each keeps its settings
    for old, new in (("/cities", "/airports/cities"), ("/cities/32575", "/airports/cities/32575"),
                     ("/cities/32575/31703?b=EWR&year=2024", "/airports/cities/32575/31703?b=EWR&year=2024")):
        r = get(ds, old)
        assert r.status_code == 301 and r.headers["location"] == new, old


def test_a_city_pair_with_more_than_ten_airport_pairs_offers_the_shorter_top_ns_then_all_of_them(ds, db_path, monkeypatch):
    # five Los Angeles airports by three New York ones: fifteen pairs, so top 10 or all 15
    CITY.update({c: ("32575", "Los Angeles, CA") for c in ("LGB", "ONT", "SNA")} | {"LGA": ("31703", "New York, NY")})
    try:
        add_segments(db_path, "t100_domestic", [seg(a, b, 2024, 100, distance=2400)
                                                for a in ("LAX", "BUR", "LGB", "ONT", "SNA") for b in ("JFK", "EWR", "LGA")])
        conn = sqlite3.connect(db_path)
        for rebuild in (rebuild_route_year_totals, rebuild_pair_distance, rebuild_airport_market, rebuild_airport_dir_year, rebuild_top_market_year):
            rebuild(conn)
        conn.close()
    finally:
        for c in ("LGB", "ONT", "SNA", "LGA"):
            CITY.pop(c)
    menu = re.search(r'<select id="matrix-n"[^>]*>(.*?)</select>', get(ds, "/airports/cities/32575/31703").text, re.S).group(1)
    assert re.findall(r'<option value="(\d+)"[^>]*>([^<]+)</option>', menu) == [("10", "top 10"), ("50", "all 15")]
    assert '<option value="50" selected>all 15</option>' in menu


def test_market_routes_by_year_counts_all_a_markets_airports_together_leaving_out_flights_between_them(ds, db_path, monkeypatch):
    load(db_path, monkeypatch)
    rows = get_json(ds, "/t100/market_routes_by_year.json?_shape=objects&market=32575&dir=&min_deps=1")["rows"]
    # LAX and BUR together, without LAX-BUR; EWR's distance weighs LAX's 2,454 miles and BUR's 2,450 by passengers
    assert {r["dest"]: (r["market_id"], r["distance"], r["passengers"]) for r in rows} == {
        "SFO": ("32457", 337, 1000), "OAK": ("32457", 325, 100), "JFK": ("31703", 2475, 400), "EWR": ("31703", 2452, 10),
        "ZZZ": (None, 400, 50)}
    out = get_json(ds, "/t100/market_routes_by_year.json?_shape=objects&market=32575&dir=out&min_deps=1")["rows"]
    assert {r["dest"]: r["passengers"] for r in out} == {"SFO": 500, "OAK": 100}  # LAX-SFO and BUR-OAK, flown that way


def test_a_city_page_lists_its_airports_then_draws_their_destinations(ds, db_path, monkeypatch):
    load(db_path, monkeypatch)
    r = get(ds, "/airports/cities/32575")
    assert r.status_code == 200
    assert "<h1 id=\"title\">Los Angeles: destinations over time</h1>" in r.text
    assert 'data-market="32575" data-name="Los Angeles"' in r.text and "/static/charts/routes.js" in r.text
    # its airports, busiest first, each opening its own page, named on hover
    assert re.findall(r'<a href="/airports/([A-Z]{3})"><abbr title="[^"]*">\1</abbr></a>', r.text) == ["LAX", "BUR"]
    assert re.search(r'<li><a href="/airports">airports</a></li>\s*<li><a href="/airports/cities">cities</a></li>\s*'
                     r'<li aria-current="page">Los Angeles</li>', r.text)  # under the airports' cities
    assert '<strong aria-current="true">Airports</strong>' in r.text
    assert get(ds, "/airports/cities/99999").status_code == 404


def test_an_airports_city_links_to_its_city_page(ds, db_path, monkeypatch):
    load(db_path, monkeypatch)
    conn = sqlite3.connect(db_path)
    build_database.rebuild_airport_names(conn)
    conn.close()
    for path in ("/airports/BUR", "/airports/BUR/destinations", "/airports/BUR/LAX"):
        assert '<a href="/airports/cities/32575">Burbank, CA</a>' in get(ds, path).text, path
    assert 'href="/airports/cities/' not in get(ds, "/airports/ZZZ").text  # an airport with no market has no city page


def test_a_city_pair_narrowed_to_one_airport_on_a_side(ds, db_path, monkeypatch):
    load(db_path, monkeypatch)
    r = get(ds, "/airports/cities/32575/31703?b=ewr&year=2024")  # Los Angeles ↔ just Newark, in any case
    assert r.status_code == 200 and "<h1>Los Angeles ↔ EWR</h1>" in plain(r.text)
    assert 'data-b="EWR"' in r.text and 'data-a=""' in r.text
    # EWR is marked, JFK narrows to itself instead, LAX narrows the other side as well; the year is kept
    assert re.search(r'<strong><abbr title="[^"]*">EWR</abbr></strong>', r.text)
    assert '<a href="/airports/cities/32575/31703?year=2024&amp;b=JFK">' in r.text
    assert '<a href="/airports/cities/32575/31703?year=2024&amp;b=EWR&amp;a=LAX">' in r.text
    assert '<a href="/airports/cities/32575/31703?year=2024">all New York airports</a>' in r.text
    assert "2,452 miles" in r.text  # EWR's pairs alone: 2,454 and 2,450 miles, five passengers each
    assert re.search(r'<li><a href="/airports/cities/32575/31703">New York</a></li>\s*<li aria-current="page">EWR</li>', r.text)
    # a code not on that side is ignored; one airport on each side is a route
    assert "<h1>Los Angeles ↔ New York</h1>" in plain(get(ds, "/airports/cities/32575/31703?b=LAX").text)
    r = get(ds, "/airports/cities/32575/31703?a=BUR&b=EWR&year=2024")
    assert r.status_code == 302 and r.headers["location"] == "/airports/BUR/EWR?year=2024"


def test_a_city_pairs_heading_opens_each_side(ds, db_path, monkeypatch):
    load(db_path, monkeypatch)
    h1 = lambda path: re.search(r"<h1>(.*?)</h1>", get(ds, path).text, re.S).group(1)
    # the first city up a level, the second across to its own page, each named in full on hover
    assert re.findall(r'<a href="([^"]+)" title="([^"]+)">([^<]+)</a>', h1("/airports/cities/32575/31703")) == [
        ("/airports/cities/32575", "Los Angeles, CA", "Los Angeles"), ("/airports/cities/31703", "New York, NY", "New York")]
    # narrowed, that side is its airport, opening its destinations
    assert re.findall(r'<a href="([^"]+)"', h1("/airports/cities/32575/31703?b=EWR")) == ["/airports/cities/32575", "/airports/EWR/destinations"]
