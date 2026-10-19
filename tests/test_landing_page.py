from tests.helpers import get


def test_airports_is_the_busiest_airports_table_with_the_configured_year_range(ds):
    r = get(ds, "/airports")
    assert r.status_code == 200
    assert 'data-min-year="1990"' in r.text and 'data-max-year="2025"' in r.text
    assert "/static/landing/main.js" in r.text and 'id="airports"' in r.text
    assert 'href="/airports/globe"' in r.text


def test_root_is_no_longer_the_table(ds):
    assert "/static/landing/main.js" not in get(ds, "/").text


def test_datasette_index_is_still_reachable(ds):
    r = get(ds, "/-/")
    assert r.status_code == 200 and "data-min-year" not in r.text
    assert get(ds, "/.json").status_code == 200
