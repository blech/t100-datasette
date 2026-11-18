import re

import pytest

from tests.helpers import get
from tests.test_foreign_note import NOTE, load
from tests.test_nav import crumbs
from tests.test_rollup_queries import put

VIEWS = [("Over time", "/airports/SFO"), ("Destinations", "/airports/SFO/destinations"), ("Distances", "/airports/SFO/distances"), ("Changes", "/airports/SFO/changes"), ("Map", "/airports/SFO/globe")]


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


def test_the_distances_page(ds, db_path):
    years(db_path)
    r = get(ds, "/airports/SFO/distances")
    assert r.status_code == 200
    assert 'id="distance-chart"' in r.text and 'id="ds-measure"' in r.text and 'id="ds-bars"' in r.text and "SFO: distances" in r.text
    for attr in ('data-axis-max="0"', 'data-bin="250"', 'data-ratio="0.1"', 'data-miles="50"', 'data-year="2025"'):
        assert attr in r.text, attr
    assert "/static/charts/distances.js" in r.text
    assert "Distances of flight segments from and to SFO in <span id=\"distance-year\">2025</span>" in r.text


def test_the_overall_distances_page(ds, db_path):
    years(db_path)
    r = get(ds, "/airports/distances")
    assert r.status_code == 200
    assert 'id="distance-chart"' in r.text and 'id="ds-measure"' in r.text and 'id="ds-bars"' in r.text
    assert "<h1 id=\"title\">Distances</h1>" in r.text
    assert "Distances of all flight segments in <span id=\"distance-year\">2025</span>" in r.text
    for attr in ('data-axis-max="0"', 'data-ratio="0.1"', 'data-miles="50"', 'data-year="2025"'):
        assert attr in r.text, attr
    assert "data-origin" not in r.text and 'id="dir"' not in r.text  # every segment once: no airport, no direction
    assert "/static/charts/distances.js" in r.text


def test_the_distances_page_lowercase_and_one_way(ds, db_path):
    years(db_path)
    r = get(ds, "/airports/sfo/distances?dir=in")
    assert 'data-origin="SFO"' in r.text and 'data-dir="in"' in r.text
    assert "Distances of flight segments to SFO in <span id=\"distance-year\">2025</span>" in r.text


def test_each_page_has_the_five_views_with_its_own_current(ds):
    for i, (_, path) in enumerate(VIEWS):
        html = get(ds, path).text
        line = re.search(r'<nav class="views".*?</nav>', html, re.S).group(0)
        expected = " · ".join(f'<strong aria-current="page">{label}</strong>' if j == i
                              else f'<a href="{href}"{" id=\"changes-link\"" if label == "Changes" else ""}>{label}</a>'
                              for j, (label, href) in enumerate(VIEWS))
        assert expected in line, path


def test_crumbs(ds):
    site, airports = ("t100.husk.org", "/"), ("airports", "/airports")
    assert crumbs(ds, "/airports/SFO") == [site, airports, ("SFO", None)]
    assert crumbs(ds, "/airports/SFO/destinations") == [site, airports, ("SFO", "/airports/SFO"), ("destinations", None)]
    assert crumbs(ds, "/airports/sfo/changes") == [site, airports, ("SFO", "/airports/SFO"), ("changes", None)]
    assert crumbs(ds, "/airports/SFO/distances") == [site, airports, ("SFO", "/airports/SFO"), ("distances", None)]
    assert crumbs(ds, "/airports/distances") == [site, airports, ("distances", None)]


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


@pytest.mark.parametrize("q", ["n=50", "group=city", "rank=latest", "year=2015", "flown=dropped", "scale=year", "open=NYC", "measure=deps&n=50"])
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
        assert re.search(r'More from <abbr title="[^"]*ATL[^"]*">ATL</abbr>: <a href="/airports/ATL">over time</a>', html), path
        assert ': <a href="/airports/ATL">over time</a> · <a href="/airports/ATL/destinations">destinations</a> · ' in html, path
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


def test_the_airports_map_counts_both_directions_whatever_dir_is_carried(ds):
    page = get(ds, "/airports/globe?dir=out").text
    assert "both directions together" in page and "12 departures" not in page


@pytest.mark.parametrize("path", ["/airports/ATL", "/airports/ATL/changes"])
def test_the_at_least_choices_are_written_with_the_counted_number(ds, path):
    choice = lambda q: re.search(r'<select id="ap-min"[^>]*>(.*?)</select>', get(ds, path + q).text, re.S).group(1)
    assert re.findall(r'<option value="(\d+)"[^>]*>([^<]+)</option>', choice("")) == [("1", "once"), ("12", "24 times"), ("52", "104 times"), ("365", "730 times")]
    assert re.findall(r'<option value="(\d+)"[^>]*>([^<]+)</option>', choice("?dir=in"))[1] == ("12", "12 times")


def test_an_airports_diagram_sits_on_its_over_time_page_only(ds):
    r = get(ds, "/airports/atl")
    assert '<figure class="airport-diagram"><svg' in r.text and 'aria-label="ATL airport diagram' in r.text
    # the credit sits with the intro, before the direction choice
    credit = r.text.index('<p class="note diagram-credit">Airport diagram data from <a href="https://www.openstreetmap.org/">OpenStreetMap</a>.</p>')
    assert r.text.index('id="subtitle"') < credit < r.text.index('id="dir"')
    # floated beside the heading, cleared before the charts
    assert r.text.index('class="airport-diagram"') < r.text.index('id="title"') < r.text.index('<h2 class="after-diagram">How big</h2>')
    assert "airport-diagram" not in get(ds, "/airports/ATL/destinations").text
    assert "airport-diagram" not in get(ds, "/airports/ATL/changes").text


def test_an_airport_without_a_diagram_has_no_figure(ds):
    page = get(ds, "/airports/BUR").text
    assert "airport-diagram" not in page and "diagram-credit" not in page


def test_the_distances_pages_years_are_the_airports_or_every_year(ds, db_path):
    years(db_path)
    html = get(ds, "/airports/SFO/distances").text
    assert 'data-first-year="1995"' in html and 'data-last-year="2025"' in html and 'data-year="2025"' in html
    html = get(ds, "/airports/distances").text
    assert 'data-first-year="1990"' in html and 'data-last-year="2025"' in html and 'data-year="2025"' in html


@pytest.mark.parametrize("path", ["/airports/SFO/distances", "/airports/distances"])
def test_the_distances_pages_take_a_year(ds, db_path, path):
    years(db_path)
    html = get(ds, f"{path}?year=1999").text
    assert 'data-year="1999"' in html and '<span id="distance-year">1999</span>' in html


@pytest.mark.parametrize("year", ["1890", "2031", "x", ""])
def test_a_year_out_of_range_or_not_a_year_is_the_latest(ds, db_path, year):
    years(db_path)
    for path in ("/airports/SFO/distances", "/airports/distances"):
        assert 'data-year="2025"' in get(ds, f"{path}?year={year}").text, path
    assert 'data-year="2025"' in get(ds, "/airports/SFO/distances?year=1994").text  # before SFO's first year


def test_an_airport_that_stopped_flying_opens_on_its_last_year(ds, db_path):
    put(db_path, "airport_dir_year", [dict(year=y, airport="OLD", deps=5, arrs=0) for y in (1995, 2001)])
    assert 'data-year="2001"' in get(ds, "/airports/OLD/distances").text


def test_the_distances_pages_have_the_year_bar(ds, db_path):
    years(db_path)
    for path in ("/airports/SFO/distances", "/airports/distances"):
        html = get(ds, path).text
        for id_ in ("play", "range", "range-fill", "year-from", "year", "year-label", "ds-scale"):
            assert f'id="{id_}"' in html, (path, id_)
        assert "/static/common/yearbar.css" in html


def test_the_maps_load_the_shared_year_bar_style(ds):
    for path in ("/airports/SFO/globe", "/airports/globe"):
        assert "/static/common/yearbar.css" in get(ds, path).text, path


def test_the_distances_pages_small_print_is_the_same_in_every_year(ds, db_path):
    years(db_path)
    for path in ("/airports/SFO/distances", "/airports/distances"):
        html = get(ds, path).text
        assert "Pairs whose BTS distance disagrees with the airports' coordinates, or that have no distance, are left out." in html, path
        assert "any segment beyond the scale counts in the last bar" in html, path
