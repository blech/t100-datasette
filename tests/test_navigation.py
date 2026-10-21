import re

import pytest

from plugins.t100_globe import section_of, views_for
from tests.helpers import get
from tests.test_rollup_pages import fam, put


@pytest.mark.parametrize("path, section", [
    ("/", None), ("/airports", "airports"), ("/airports/globe", "airports"), ("/airports/ATL/LAX/2024", "airports"),
    ("/aircraft", "aircraft"), ("/aircraft/engines", "aircraft"), ("/aircraft/boeing-737", "aircraft"),
    ("/airlines", "airlines"), ("/airlines/delta/globe", "airlines"), ("/about", "about"),
    ("/t100/airports", None), ("/-/derived", None),
])
def test_section_of(path, section):
    assert section_of(path) == section


def views(path):
    return [(v["label"], v["href"], v["current"]) for v in views_for(path)]


def test_airports_views():
    assert views("/airports") == [("Busiest airports", "/airports", True), ("Map", "/airports/globe", False)]
    assert views("/airports/globe") == [("Busiest airports", "/airports", False), ("Map", "/airports/globe", True)]


def test_an_airports_views_use_upper_case_codes():
    assert views("/airports/sfo") == [("Routes over time", "/airports/SFO", True), ("Map", "/airports/SFO/globe", False)]
    assert views("/airports/SFO/globe") == [("Routes over time", "/airports/SFO", False), ("Map", "/airports/SFO/globe", True)]


def test_a_route_offers_its_other_direction_keeping_the_year():
    assert views("/airports/SFO/LHR") == [("SFO → LHR", "/airports/SFO/LHR", True), ("LHR → SFO", "/airports/LHR/SFO", False)]
    assert views("/airports/atl/lax/2024") == [("ATL → LAX", "/airports/ATL/LAX/2024", True), ("LAX → ATL", "/airports/LAX/ATL/2024", False)]


def test_aircraft_and_airline_views():
    assert views("/aircraft") == [("Families", "/aircraft", True), ("Long-haul engines", "/aircraft/engines", False)]
    assert views("/aircraft/engines") == [("Families", "/aircraft", False), ("Long-haul engines", "/aircraft/engines", True)]
    assert views("/airlines/delta") == [("Overview", "/airlines/delta", True), ("Map", "/airlines/delta/globe", False)]
    assert views("/airlines/delta/globe") == [("Overview", "/airlines/delta", False), ("Map", "/airlines/delta/globe", True)]


def test_the_airline_pages_map_view_keeps_the_id_its_script_rewrites():
    assert [v["id"] for v in views_for("/airlines/delta")] == [None, "map-link"]


@pytest.mark.parametrize("path", ["/", "/airlines", "/aircraft/boeing-737", "/about", "/t100", "/-/derived", "/airports/SFO/LHR/2019/x"])
def test_pages_with_one_view_have_none(path):
    assert views_for(path) == []


def test_datasettes_own_pages_still_render(ds):
    assert get(ds, "/t100").status_code == 200


PAGES = {
    "/": (None, []),
    "/airports": ("airports", ["Busiest airports", "Map"]),
    "/airports/globe": ("airports", ["Busiest airports", "Map"]),
    "/airports/ATL": ("airports", ["Routes over time", "Map"]),
    "/airports/ATL/globe": ("airports", ["Routes over time", "Map"]),
    "/airports/ATL/LAX": ("airports", ["ATL → LAX", "LAX → ATL"]),
    "/aircraft": ("aircraft", ["Families", "Long-haul engines"]),
    "/aircraft/engines": ("aircraft", ["Families", "Long-haul engines"]),
    "/airlines": ("airlines", []),
    "/about": ("about", []),
}


def sections_nav(html):
    return re.search(r'<nav class="sections".*?</nav>', html, re.S).group(0)


@pytest.mark.parametrize("path", PAGES)
def test_every_page_lists_the_sections_with_the_current_one_marked(ds, path):
    nav = sections_nav(get(ds, path).text)
    assert re.findall(r">(Airports|Aircraft|Airlines|About)<", nav) == ["Airports", "Aircraft", "Airlines", "About"]
    current = re.findall(r'aria-current="[^"]+">(\w+)<', nav)
    assert current == ([PAGES[path][0].capitalize()] if PAGES[path][0] else [])


@pytest.mark.parametrize("path", PAGES)
def test_the_views_line_lists_the_subjects_views(ds, path):
    html = get(ds, path).text
    m = re.search(r'<nav class="views".*?</nav>', html, re.S)
    labels = re.findall(r">([^<>]+)</(?:a|strong)>", m.group(0)) if m else []
    assert labels == PAGES[path][1]


def seed_family_and_airline(db_path):
    put(db_path, "family_year", [fam(2019, "DC-9 / MD-80 / MD-90", 1, "F", 3)])
    put(db_path, "carrier_group_year", [dict(year=2019, airline_id="19790", group_id="delta", group_name="Delta (incl. Northwest)", domestic=1,
                                             service_class="F", deps=4, seats=400, passengers=300, freight=0)])


def test_no_page_keeps_a_hand_written_related_line(ds, db_path):
    seed_family_and_airline(db_path)
    for path in [*PAGES, "/aircraft/dc-9-md-80-md-90", "/airlines/delta", "/airlines/delta/globe", "/airports/ATL/LAX/2024"]:
        r = get(ds, path)
        assert r.status_code == 200, path
        assert not re.search(r'<p class="related">\s*<a', r.text), path


def test_an_airlines_page_and_map_have_overview_and_map_views(ds, db_path):
    seed_family_and_airline(db_path)
    page = get(ds, "/airlines/delta").text
    assert re.search(r'<strong aria-current="page">Overview</strong> · <a href="/airlines/delta/globe" id="map-link">Map</a>', page)
    assert re.search(r'<a href="/airlines/delta">Overview</a> · <strong aria-current="page">Map</strong>', get(ds, "/airlines/delta/globe").text)


def test_a_route_links_to_more_from_its_origin(ds):
    html = get(ds, "/airports/ATL/LAX").text
    assert 'href="/airports/ATL"' in html and 'id="map-link"' in html
