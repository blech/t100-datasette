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
