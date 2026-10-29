from tests.helpers import get


def test_route_page_renders_with_origin_and_destination(ds):
    r = get(ds, "/airports/SFO/LHR")
    assert r.status_code == 200
    assert 'data-origin="SFO"' in r.text and 'data-dest="LHR"' in r.text and 'data-year=""' in r.text
    assert "/static/charts/routepage.js" in r.text


def test_route_year_page_carries_the_year(ds):
    r = get(ds, "/airports/SFO/LHR/2019")
    assert r.status_code == 200 and 'data-year="2019"' in r.text
    assert "SFO ↔ LHR in 2019" in r.text


def test_codes_are_normalised(ds):
    r = get(ds, "/airports/sfo/lhr/2019")
    assert 'data-origin="SFO"' in r.text and 'data-dest="LHR"' in r.text


def test_bad_paths_are_404(ds):
    for path in ("/airports/SFO/LH", "/airports/SFO/LHR/201", "/airports/SFO/LHR/20x9", "/airports/SFO/LHR/2019/01"):
        assert get(ds, path).status_code == 404, path


def _route_fixture(db_path, rows):
    from tests.helpers import add_segments, _insert
    _insert(db_path, "aircraft_types", [dict(ac_typeid="614", ac_group="6", name="Boeing 737-800")])
    add_segments(db_path, "t100_domestic", [dict(year=2019, month=1, origin=o, dest=d, carrier_entity="X", aircraft_type="614",
                                                 departures_performed=n, passengers=n * 100, seats=n * 150, freight=0) for o, d, n in rows])


def _deps(ds, query, dir):
    from tests.helpers import get_json
    return sum(r["deps"] for r in get_json(ds, f"/t100/{query}.json?_shape=objects&origin=ATL&dest=LAX&year=2019&dir={dir}")["rows"])


def test_route_both_ways_by_default(ds, db_path):
    _route_fixture(db_path, [("ATL", "LAX", 10), ("LAX", "ATL", 7)])
    for query in ("route", "route_year"):
        assert (_deps(ds, query, ""), _deps(ds, query, "out"), _deps(ds, query, "in")) == (17, 10, 7), query


def code_link(code, dir="", year=""):
    query = "&amp;".join(f"{k}={v}" for k, v in (("dir", dir), ("year", year)) if v)
    return f'<a href="/airports/{code}/destinations{f"?{query}" if query else ""}" title="{code}">{code}</a>'


def test_heading_codes_open_each_airports_destinations_in_the_same_direction(ds):
    for view, year in (("", ""), ("/2019", "2019"), ("/table", ""), ("/2019/table", "2019")):
        page = get(ds, f"/airports/ATL/LAX{view}?dir=out").text
        assert f'{code_link("ATL", "out", year)} → {code_link("LAX", "out", year)}' in page, view   # LAX's departures, not its arrivals from ATL
        assert "<title>ATL → LAX" in page, view


def test_a_route_years_heading_codes_open_each_matrix_ranked_by_that_year(ds):
    page = get(ds, "/airports/ATL/LAX/2015?dir=out").text
    assert 'href="/airports/ATL/destinations?dir=out&amp;year=2015"' in page and 'href="/airports/LAX/destinations?dir=out&amp;year=2015"' in page
    page = get(ds, "/airports/ATL/LAX/2015/table").text
    assert 'href="/airports/ATL/destinations?year=2015"' in page


def test_route_page_heading_follows_dir(ds):
    page = get(ds, "/airports/ATL/LAX").text
    assert f'<h1 id="title">{code_link("ATL")} ↔ {code_link("LAX")}</h1>' in page and "<title>ATL ↔ LAX · T-100</title>" in page and 'data-dir=""' in page
    page = get(ds, "/airports/ATL/LAX/2019?dir=in").text
    assert f'<h1 id="title">{code_link("LAX", "in", "2019")} → {code_link("ATL", "in", "2019")} in 2019</h1>' in page and 'data-dir="in"' in page
    assert 'id="chart-dir"' in page and "LAX → ATL</option>" in page


def test_route_page_unknown_dir_is_both(ds):
    r = get(ds, "/airports/ATL/LAX?dir=sideways")
    assert r.status_code == 200 and f'<h1 id="title">{code_link("ATL")} ↔ {code_link("LAX")}</h1>' in r.text


def test_one_direction_only_route(ds, db_path):
    _route_fixture(db_path, [("ATL", "LAX", 10)])
    assert _deps(ds, "route", "in") == 0
    r = get(ds, "/airports/ATL/LAX?dir=in")
    assert r.status_code == 200 and 'data-dir="in"' in r.text


def test_reverse_link_only_in_one_way_mode(ds):
    for view in ("", "/table"):
        assert 'id="reverse-link"' not in get(ds, f"/airports/ATL/LAX{view}").text, view
        assert 'id="reverse-link"' in get(ds, f"/airports/ATL/LAX{view}?dir=out").text, view


def test_reverse_link_names_and_keeps_the_other_direction(ds):
    page = get(ds, "/airports/ATL/LAX?dir=in").text  # showing LAX → ATL; the other way is ATL → LAX, which /LAX/ATL calls in
    assert '<a href="/airports/LAX/ATL?dir=in" id="reverse-link">ATL → LAX</a>' in page
    page = get(ds, "/airports/ATL/LAX/2019/table?dir=out").text
    assert '<a href="/airports/LAX/ATL/2019/table?dir=out" id="reverse-link">LAX → ATL</a>' in page
