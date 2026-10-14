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


def test_routes_index_goes_to_the_landing_page_keeping_the_query(ds):
    r = get(ds, "/routes?theme=night&measure=deps")
    assert r.status_code == 302
    assert r.headers["location"] == "/?theme=night&measure=deps"
    assert get(ds, "/routes").headers["location"] == "/"


def test_globe_page_links_to_routes_over_time(ds):
    assert 'href="/routes/ATL"' in get(ds, "/globe/ATL").text
    assert "/routes/" not in get(ds, "/globe").text


def test_page_offers_the_city_grouping(ds):
    html = get(ds, "/routes/ATL").text
    assert '<option value="city">' in html and 'id="heat-group"' in html


def test_page_has_the_label_tooltip_element(ds):
    assert 'id="label-tip"' in get(ds, "/routes/ATL").text


def test_page_offers_ranking_by_the_latest_full_year(ds):
    html = get(ds, "/routes/ATL").text
    assert 'id="heat-rank"' in html and '<option value="latest">' in html
    assert 'data-latest-year="2025"' in html


def test_page_offers_colouring_by_share_of_each_year(ds):
    html = get(ds, "/routes/ATL").text
    assert 'id="heat-scale"' in html and '<option value="year">' in html
    assert '<option value="busiest">Compared to top destination</option>' in html
    assert 'id="scale-note"' in html
