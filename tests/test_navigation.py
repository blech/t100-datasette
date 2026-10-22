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


def test_a_route_has_over_time_and_table_views_keeping_the_year():
    assert views("/airports/SFO/LHR") == [("Over time", "/airports/SFO/LHR", True), ("Table", "/airports/SFO/LHR/table", False)]
    assert views("/airports/atl/lax/2024/table") == [("Over time", "/airports/ATL/LAX/2024", False), ("Table", "/airports/ATL/LAX/2024/table", True)]
    assert views_for("/airports/SFO/LHR/2019/x") == [] and views_for("/airports/SFO/LHR/table/2019") == []


def test_aircraft_and_airline_views():
    AIRCRAFT = [("Families", "/aircraft"), ("Makers", "/aircraft/makers"), ("Long-haul engines", "/aircraft/engines")]
    for i, (_, path) in enumerate(AIRCRAFT):
        assert views(path) == [(label, href, j == i) for j, (label, href) in enumerate(AIRCRAFT)], path
    A = [("Over time", "/airlines/delta"), ("Routes", "/airlines/delta/routes"), ("Changes", "/airlines/delta/changes"), ("Map", "/airlines/delta/globe")]
    for i, (_, path) in enumerate(A):
        assert views(path) == [(label, href, j == i) for j, (label, href) in enumerate(A)], path


def test_the_airline_pages_map_view_keeps_the_id_its_script_rewrites():
    assert [v["id"] for v in views_for("/airlines/delta")] == [None, None, None, "map-link"]


@pytest.mark.parametrize("path", ["/", "/aircraft/boeing-737", "/about", "/t100", "/-/derived", "/airports/SFO/LHR/2019/x"])
def test_pages_with_one_view_have_none(path):
    assert views_for(path) == []


def test_datasettes_own_pages_still_render_with_their_own_views_list(ds):
    r = get(ds, "/t100")
    assert r.status_code == 200
    assert 'id="views"' in r.text, "the database page's list of SQL views must not be overridden by the navigation's"


PAGES = {
    "/": (None, []),
    "/airports": ("airports", ["Busiest airports", "Map"]),
    "/airports/globe": ("airports", ["Busiest airports", "Map"]),
    "/airports/ATL": ("airports", ["Routes over time", "Map"]),
    "/airports/ATL/globe": ("airports", ["Routes over time", "Map"]),
    "/airports/ATL/LAX": ("airports", ["Over time", "Table"]),
    "/airports/ATL/LAX/table": ("airports", ["Over time", "Table"]),
    "/aircraft": ("aircraft", ["Families", "Makers", "Long-haul engines"]),
    "/aircraft/engines": ("aircraft", ["Families", "Makers", "Long-haul engines"]),
    "/aircraft/makers": ("aircraft", ["Families", "Makers", "Long-haul engines"]),
    "/airlines": ("airlines", ["Airlines", "Over time"]),
    "/airlines/over-time": ("airlines", ["Airlines", "Over time"]),
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
    assert re.search(r'<strong aria-current="page">Over time</strong> · <a href="/airlines/delta/routes">Routes</a> · <a href="/airlines/delta/changes">Changes</a> · <a href="/airlines/delta/globe" id="map-link">Map</a>', page)
    assert re.search(r'<a href="/airlines/delta">Over time</a> · <a href="/airlines/delta/routes">Routes</a> · <a href="/airlines/delta/changes">Changes</a> · <strong aria-current="page">Map</strong>', get(ds, "/airlines/delta/globe").text)


def test_a_route_links_to_more_from_its_origin(ds):
    html = get(ds, "/airports/ATL/LAX").text
    assert 'href="/airports/ATL"' in html and 'id="map-link"' in html


def test_the_airlines_table_and_matrix_are_two_views_of_the_section():
    assert [(v["label"], v["href"], v["current"]) for v in views_for("/airlines")] == [
        ("Airlines", "/airlines", True), ("Over time", "/airlines/over-time", False)]
    assert [v["current"] for v in views_for("/airlines/over-time")] == [False, True]
    assert [v["label"] for v in views_for("/airlines/delta")] == ["Over time", "Routes", "Changes", "Map"]  # an airline is still its own subject
