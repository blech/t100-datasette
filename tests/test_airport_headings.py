import re

import pytest

from tests.helpers import _insert, add_airports, add_overrides, get

# every airport page heads itself the same way: the code and the page, then the airport's name and its city beneath
PAGES = [("/airports/SFO", "SFO: over time"), ("/airports/SFO/destinations", "SFO: destinations over time"),
         ("/airports/SFO/changes", "SFO: what changed"), ("/airports/SFO/globe", "SFO: route map")]


def sfo(db_path, place="San Francisco, CA"):
    add_airports(db_path, [dict(iata_code="SFO", name="San Francisco International Airport", city="San Francisco",
                                country="United States", latitude=37.6, longitude=-122.4)])
    if place:
        _insert(db_path, "airport_names", [dict(code="SFO", name=place)])


def heading(html):
    return re.search(r'id="title">([^<]*)<', html).group(1)


def subtitle(html):
    return re.search(r'id="subtitle">([^<]*)<', html).group(1).strip()


@pytest.mark.parametrize("path,title", PAGES)
def test_the_heading_is_the_code_and_the_page(ds, db_path, path, title):
    sfo(db_path)
    assert heading(get(ds, path).text) == title


@pytest.mark.parametrize("path", [p for p, _ in PAGES])
def test_beneath_it_the_airports_name_and_city(ds, db_path, path):
    sfo(db_path)
    assert subtitle(get(ds, path).text) == "San Francisco International Airport · San Francisco, CA"


@pytest.mark.parametrize("path", [p for p, _ in PAGES])
def test_the_name_sits_straight_under_the_heading(ds, db_path, path):
    sfo(db_path)
    assert re.search(r'id="title">[^<]*</(h1|div)>\s*(\{%[^%]*%\})?\s*<(p|div)[^>]*id="subtitle"', get(ds, path).text), path


def test_without_a_bts_name_the_city_and_country_stand_in(ds, db_path):
    sfo(db_path, place=None)
    assert subtitle(get(ds, "/airports/SFO").text) == "San Francisco International Airport · San Francisco, United States"


def test_an_override_names_the_airport(ds, db_path):
    add_overrides(db_path, [dict(code="XXA", name="Override Field", city="Somewhere", country="United States", latitude=1, longitude=2)])
    assert subtitle(get(ds, "/airports/XXA").text) == "Override Field · Somewhere, United States"


def test_with_only_a_city_the_city_alone(ds, db_path):
    _insert(db_path, "airport_names", [dict(code="ZZZ", name="Nowhere, NV")])
    assert subtitle(get(ds, "/airports/ZZZ/changes").text) == "Nowhere, NV"


def test_an_unknown_airport_has_no_subtitle(ds):
    assert subtitle(get(ds, "/airports/QQQ/destinations").text) == ""


def test_the_scripts_leave_the_heading_alone():
    for script in ("static/charts/routes.js", "static/globe/main.js"):
        js = open(script).read()
        assert "$('title').textContent = `${origin}" not in js and "$('subtitle')" not in js, script


def test_the_destinations_warning_has_its_own_place(ds):
    assert 'id="truncated"' in get(ds, "/airports/SFO/destinations").text
    assert "$('truncated')" in open("static/charts/routes.js").read()


# a route's pages name both ends the same way, beneath the heading
ROUTES = ["/airports/SFO/JFK", "/airports/SFO/JFK/2019", "/airports/SFO/JFK/table"]


def jfk(db_path):
    add_airports(db_path, [dict(iata_code="JFK", name="John F Kennedy International Airport", city="New York",
                                country="United States", latitude=40.6, longitude=-73.8)])
    _insert(db_path, "airport_names", [dict(code="JFK", name="New York, NY")])


@pytest.mark.parametrize("path", ROUTES)
def test_a_route_names_both_its_airports(ds, db_path, path):
    sfo(db_path)
    jfk(db_path)
    html = get(ds, path).text
    assert subtitle(html) == "San Francisco International Airport · San Francisco, CA and John F Kennedy International Airport · New York, NY"
    assert subtitle(get(ds, path + "?dir=in").text) == "John F Kennedy International Airport · New York, NY to San Francisco International Airport · San Francisco, CA"
    assert re.search(r'id="title">(?:[^<]|<a [^>]*>[^<]*</a>)*</h1>\s*<p[^>]*id="subtitle"', html), path


def test_an_unknown_end_of_a_route_is_its_code(ds, db_path):
    sfo(db_path)
    assert subtitle(get(ds, "/airports/SFO/QQQ?dir=out").text) == "San Francisco International Airport · San Francisco, CA to QQQ"


def test_the_route_script_leaves_the_subtitle_alone():
    assert "$('subtitle')" not in open("static/charts/routepage.js").read()


def test_the_name_line_sits_close_under_the_heading():
    css = open("static/common/base.css").read()
    assert re.search(r"h1:has\(\+ #subtitle\)\s*\{\s*margin-bottom:\s*0;", css)
    assert re.search(r"h1 \+ #subtitle\s*\{\s*margin-top:\s*0;", css)
