import re

from tests.helpers import get, get_json
from tests.test_rollup_queries import put

VIEWS = [("Busiest airports", "/airports"), ("Over time", "/airports/over-time"), ("Map", "/airports/globe")]


def totals(db_path):
    row = lambda year, origin, wac, deps: dict(year=year, origin=origin, origin_city_name=f"{origin} city", origin_wac=wac,
                                               deps=deps, seats=deps * 100, passengers=deps * 80, freight=deps * 10)
    put(db_path, "airport_year_totals", [row(2019, "ATL", 34, 400000), row(1990, "ATL", 34, 100),   # a busy airport keeps its quiet years
                                         row(2019, "LHR", 493, 50000),                              # outside the US
                                         row(2019, "ZZZ", 34, 364)])                                # never 365 departures in a year


def test_airport_by_year_gives_us_airports_that_ever_flew_365_times_with_all_their_years(ds, db_path):
    totals(db_path)
    rows = get_json(ds, "/t100/airport_by_year.json?_shape=objects&_size=max")["rows"]
    assert sorted((r["origin"], r["year"]) for r in rows) == [("ATL", 1990), ("ATL", 2019)]
    atl = next(r for r in rows if r["year"] == 2019)
    assert atl["city"] == "ATL city" and atl["deps"] == 400000 and atl["freight"] == 4000000


def test_the_airports_matrix_page(ds):
    r = get(ds, "/airports/over-time")
    assert r.status_code == 200
    assert 'data-kind="airports"' in r.text and 'id="matrix"' in r.text and "/static/charts/rollup.js" in r.text
    assert "Airports over time" in r.text
    sentence = re.search(r'<p class="chart-sentence">(.*?)</p>', r.text, re.S).group(1)
    assert re.findall(r'<select id="([^"]+)"', sentence) == ["matrix-measure", "matrix-n", "matrix-rank"]
    assert "airlines" not in sentence and "_airline_search" not in r.text and 'id="airline-search"' not in r.text


def test_the_airports_section_has_three_views(ds):
    for i, (_, path) in enumerate(VIEWS):
        line = re.search(r'<nav class="views".*?</nav>', get(ds, path).text, re.S).group(0)
        for j, (label, href) in enumerate(VIEWS):
            expected = f'<strong aria-current="page">{label}</strong>' if i == j else f'<a href="{href}">{label}</a>'
            assert expected in line, (path, label)


def test_the_matrix_breadcrumb_goes_back_to_the_table(ds):
    html = get(ds, "/airports/over-time").text
    assert '<a href="/airports">airports</a>' in html and 'aria-current="page">over time<' in html


def markets(db_path):
    totals(db_path)
    put(db_path, "airport_year_totals", [dict(year=2019, origin="LGA", origin_city_name="New York, NY", origin_wac=22, deps=50, seats=5000, passengers=4000, freight=0),
                                         dict(year=2019, origin="SMALL", origin_city_name="Tiny, AK", origin_wac=1, deps=1, seats=0, passengers=0, freight=0)])
    put(db_path, "airport_market", [dict(code="ATL", market_id="30397"), dict(code="LGA", market_id="31703"), dict(code="JFK", market_id="31703")])
    put(db_path, "route_year_totals", [dict(year=2019, origin=o, dest=d, deps=n, domestic_deps=n, seats=0, passengers=0, freight=0)
                                       for o, d, n in (("LGA", "MIA", 20), ("JFK", "MIA", 30), ("JFK", "LHR", 15), ("LGA", "ORD", 5))])


def test_top_airports_gives_every_us_airport_of_the_year_with_its_market(ds, db_path):
    markets(db_path)
    rows = {r["origin"]: r for r in get_json(ds, "/t100/top_airports.json?year=2019&_shape=objects&_size=max")["rows"]}
    assert set(rows) == {"ATL", "LGA", "SMALL", "ZZZ"}                   # every US airport, however small; not LHR
    assert rows["LGA"]["market_id"] == "31703" and rows["SMALL"]["market_id"] is None
    assert rows["LGA"]["dests"] == 1 and rows["LGA"]["market_dests"] == 2  # New York reaches MIA and LHR 12+ times, MIA counted once


def test_airport_by_year_gives_each_airport_its_market(ds, db_path):
    markets(db_path)
    rows = get_json(ds, "/t100/airport_by_year.json?_shape=objects&_size=max")["rows"]
    assert {r["origin"]: r["market_id"] for r in rows} == {"ATL": "30397"}
