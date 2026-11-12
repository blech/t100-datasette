from tests.helpers import get


def test_airport_page_renders_with_origin_and_assets(ds):
    r = get(ds, "/airports/ATL/globe")
    assert r.status_code == 200
    assert 'data-origin="ATL"' in r.text
    assert "/static/globe/main.js" in r.text
    assert "/static/globe/style.css" in r.text


def test_lowercase_is_normalised(ds):
    assert 'data-origin="ATL"' in get(ds, "/airports/atl/globe").text


def test_the_airports_map_is_the_busiest_routes_map(ds):
    r = get(ds, "/airports/globe")
    assert r.status_code == 200 and "/static/charts/airportsglobe.js" in r.text and 'id="n"' in r.text
    assert "data-origin" not in r.text and 'id="chooser"' not in r.text


def test_the_airports_map_has_no_sea_menu_or_routes_table_link(ds):
    html = get(ds, "/airports/globe").text
    assert 'id="sea"' not in html and 'href="/airports/routes">The routes table' not in html


def test_where_the_airports_map_was_tried_out_redirects_keeping_its_settings(ds):
    r = get(ds, "/airports/globe/routes?year=2019&proj=flat")
    assert r.status_code == 301 and r.headers["location"] == "/airports/globe?year=2019&proj=flat"


def test_the_airports_map_points_at_its_data_without_javascript(ds):
    html = get(ds, "/airports/globe").text
    assert '<noscript><p>This map needs JavaScript.' in html and "/t100/busiest_routes_year?year=2025" in html


def test_bad_code_is_404(ds):
    assert get(ds, "/airports/toolong/globe").status_code == 404
    r = get(ds, "/airports/%3Cscript%3E/globe")
    if r.status_code == 302:  # Datasette first redirects percent-encoded paths to its own tilde encoding
        r = get(ds, r.headers["location"])
    assert r.status_code == 404


def test_static_assets_are_served(ds):
    r = get(ds, "/static/globe/src/state.js")
    assert r.status_code == 200 and "parseState" in r.text
    assert "javascript" in r.headers["content-type"]


def test_width_menu_offers_freight(ds):
    assert '<option value="freight">' in get(ds, "/airports/ATL/globe").text


def test_map_has_year_comparison_colour_choice_and_legend(ds):
    html = get(ds, "/airports/ATL/globe").text
    for el in ('id="year-from"', 'id="year"', 'id="range-fill"', 'id="colour"', 'id="legend-chips"'):
        assert el in html, el
    assert 'id="service"' not in html


def test_chart_assets_are_served(ds):
    for path in ("/static/charts/routepage.js", "/static/charts/src/series.js", "/static/charts/vendor/plot.js"):
        assert get(ds, path).status_code == 200


def test_the_airports_map_knows_the_latest_year(ds):
    assert 'data-max-year="2025"' in get(ds, "/airports/globe").text
