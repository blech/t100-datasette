from tests.helpers import get


def test_root_is_the_landing_page_with_the_configured_year_range(ds):
    r = get(ds, "/")
    assert r.status_code == 200
    assert 'data-min-year="1990"' in r.text and 'data-max-year="2025"' in r.text
    assert "/static/landing/main.js" in r.text


def test_datasette_index_is_still_reachable(ds):
    r = get(ds, "/-/")
    assert r.status_code == 200 and "data-min-year" not in r.text
    assert get(ds, "/.json").status_code == 200
