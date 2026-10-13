from tests.helpers import get


def test_routes_over_time_page_renders_with_origin_and_assets(ds):
    r = get(ds, "/routes/ATL")
    assert r.status_code == 200
    assert 'data-origin="ATL"' in r.text
    assert "/static/charts/routes.js" in r.text


def test_lowercase_is_normalised(ds):
    assert 'data-origin="ATL"' in get(ds, "/routes/atl").text


def test_bad_codes_are_404(ds):
    assert get(ds, "/routes/toolong").status_code == 404
    assert get(ds, "/routes").status_code == 404


def test_globe_page_links_to_routes_over_time(ds):
    assert 'href="/routes/ATL"' in get(ds, "/globe/ATL").text
    assert "/routes/" not in get(ds, "/globe").text


def test_page_offers_the_city_grouping(ds):
    html = get(ds, "/routes/ATL").text
    assert '<option value="city">' in html and 'id="heat-group"' in html
