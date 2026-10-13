from tests.helpers import get


def test_airport_page_renders_with_origin_and_assets(ds):
    r = get(ds, "/globe/ATL")
    assert r.status_code == 200
    assert 'data-origin="ATL"' in r.text
    assert "/static/globe/main.js" in r.text
    assert "/static/globe/style.css" in r.text


def test_lowercase_is_normalised(ds):
    assert 'data-origin="ATL"' in get(ds, "/globe/atl").text


def test_no_airport_shows_chooser_page(ds):
    r = get(ds, "/globe")
    assert r.status_code == 200 and 'data-origin=""' in r.text


def test_bad_code_is_404(ds):
    assert get(ds, "/globe/toolong").status_code == 404
    r = get(ds, "/globe/%3Cscript%3E")
    if r.status_code == 302:  # Datasette first redirects percent-encoded paths to its own tilde encoding
        r = get(ds, r.headers["location"])
    assert r.status_code == 404


def test_static_assets_are_served(ds):
    r = get(ds, "/static/globe/src/state.js")
    assert r.status_code == 200 and "parseState" in r.text
    assert "javascript" in r.headers["content-type"]


def test_width_menu_offers_freight(ds):
    assert '<option value="freight">' in get(ds, "/globe/ATL").text


def test_service_menu_offers_all_domestic_international(ds):
    html = get(ds, "/globe/ATL").text
    for v in ("all", "domestic", "international"):
        assert f'<option value="{v}">' in html


def test_route_page_includes_the_chart_script(ds):
    r = get(ds, "/t100/route?origin=SFO&dest=LHR")
    assert r.status_code == 200
    assert "/static/charts/route.js" in r.text and 'id="route-chart"' in r.text


def test_chart_assets_are_served(ds):
    for path in ("/static/charts/route.js", "/static/charts/src/series.js", "/static/charts/vendor/plot.js"):
        assert get(ds, path).status_code == 200
