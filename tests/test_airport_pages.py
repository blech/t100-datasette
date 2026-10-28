import re

import pytest

from tests.helpers import get
from tests.test_foreign_note import NOTE, load
from tests.test_nav import crumbs
from tests.test_rollup_queries import put

VIEWS = [("Over time", "/airports/SFO"), ("Destinations", "/airports/SFO/destinations"), ("Changes", "/airports/SFO/changes"), ("Map", "/airports/SFO/globe")]


def years(db_path):
    put(db_path, "airport_dir_year", [dict(year=y, airport="SFO", deps=d, arrs=0) for y, d in ((1994, 0), (1995, 10), (2025, 20))])


def test_the_charts_are_the_airports_default_page(ds, db_path):
    years(db_path)
    r = get(ds, "/airports/SFO")
    assert r.status_code == 200
    assert 'id="size-chart"' in r.text and 'id="places-chart"' in r.text and 'id="ap-split"' in r.text
    assert "SFO: over time" in r.text and "/static/charts/airport.js" in r.text
    assert 'id="matrix"' not in r.text and 'id="change-table"' not in r.text


def test_the_matrix_has_moved_to_destinations(ds):
    r = get(ds, "/airports/SFO/destinations")
    assert r.status_code == 200
    assert 'id="matrix"' in r.text and "SFO: destinations over time" in r.text and "/static/charts/routes.js" in r.text
    assert 'data-origin="SFO"' in get(ds, "/airports/sfo/destinations").text


def test_the_changes_page(ds, db_path):
    years(db_path)
    r = get(ds, "/airports/SFO/changes")
    assert r.status_code == 200
    assert 'id="change-table"' in r.text and 'id="ap-show"' in r.text and 'id="ap-a"' in r.text and "SFO: what changed" in r.text
    assert re.search(r'<div class="scroll">\s*<table id="change-table">', r.text)
    assert 'id="size-chart"' not in r.text and "/static/charts/airport.js" in r.text


def test_each_page_has_the_four_views_with_its_own_current(ds):
    for i, (_, path) in enumerate(VIEWS):
        html = get(ds, path).text
        line = re.search(r'<nav class="views".*?</nav>', html, re.S).group(0)
        expected = " · ".join(f'<strong aria-current="page">{label}</strong>' if j == i else f'<a href="{href}">{label}</a>'
                              for j, (label, href) in enumerate(VIEWS))
        assert expected in line, path


def test_crumbs(ds):
    site, airports = ("t100.husk.org", "/"), ("airports", "/airports")
    assert crumbs(ds, "/airports/SFO") == [site, airports, ("SFO", None)]
    assert crumbs(ds, "/airports/SFO/destinations") == [site, airports, ("SFO", "/airports/SFO"), ("destinations", None)]
    assert crumbs(ds, "/airports/sfo/changes") == [site, airports, ("SFO", "/airports/SFO"), ("changes", None)]


def test_first_and_last_years_come_from_the_airports_totals(ds, db_path):
    years(db_path)
    for path in ("/airports/SFO", "/airports/SFO/changes"):
        html = get(ds, path).text
        assert 'data-first-year="1995"' in html and 'data-last-year="2025"' in html, path


def test_an_airport_with_no_flights_still_renders_each_page(ds):
    for path in ("/airports/ZZZ", "/airports/ZZZ/destinations", "/airports/ZZZ/changes"):
        r = get(ds, path)
        assert r.status_code == 200, path
    assert 'data-first-year=""' in get(ds, "/airports/ZZZ").text and 'data-last-year=""' in get(ds, "/airports/ZZZ/changes").text


@pytest.mark.parametrize("q", ["n=50", "group=city", "rank=latest", "scale=year", "open=NYC", "measure=deps&n=50"])
def test_matrix_settings_go_to_the_matrix(ds, q):
    r = get(ds, f"/airports/SFO?{q}")
    assert r.status_code == 301
    assert r.headers["location"] == f"/airports/SFO/destinations?{q}"


@pytest.mark.parametrize("q", ["", "measure=seats", "service=domestic", "theme=dark"])
def test_shared_settings_stay_on_the_charts(ds, q):
    assert get(ds, f"/airports/SFO?{q}").status_code == 200


def test_bad_codes_are_404_on_the_new_paths(ds):
    for path in ("/airports/toolong/changes", "/airports/toolong/destinations", "/airports/SFO/nowhere"):
        assert get(ds, path).status_code == 404, path


def test_a_foreign_airport_has_its_note_on_each_page(ds, db_path):
    load(db_path)
    for path in ("/airports/LHR", "/airports/LHR/destinations", "/airports/LHR/changes"):
        html = get(ds, path).text
        assert NOTE in html and 'data-foreign="1"' in html, path
    assert NOTE not in get(ds, "/airports/ATL/changes").text


def test_a_routes_note_offers_the_airports_charts_and_matrix_by_their_names(ds):
    for path in ("/airports/ATL/LAX", "/airports/ATL/LAX/2024/table"):
        html = get(ds, path).text
        assert 'More from ATL: <a href="/airports/ATL">over time</a> · <a href="/airports/ATL/destinations">destinations</a> · ' in html, path
        assert "routes over time" not in html, path


@pytest.mark.parametrize("path", ["/airports/ATL", "/airports/ATL/destinations", "/airports/ATL/changes", "/airports/ATL/globe"])
def test_airport_pages_offer_a_direction_and_say_which_they_count(ds, path):
    page = get(ds, path).text
    choice = re.search(r'<select id="dir"[^>]*>(.*?)</select>', page, re.S)
    assert choice and choice.group(1).count("<option") == 3
    assert 'data-dir=""' in page and "to and from ATL" in page and "departing <em>from</em>" not in page
    page = get(ds, f"{path}?dir=in").text
    assert 'data-dir="in"' in page and "arriving at ATL" in page and '<option value="in" selected>' in page
    assert "departing ATL" in get(ds, f"{path}?dir=out").text


def test_an_airport_with_only_arrivals_has_years(ds, db_path):
    put(db_path, "airport_dir_year", [dict(year=2001, airport="LHR", deps=0, arrs=5), dict(year=2003, airport="LHR", deps=0, arrs=2)])
    page = get(ds, "/airports/LHR").text
    assert 'data-first-year="2001"' in page and 'data-last-year="2003"' in page
