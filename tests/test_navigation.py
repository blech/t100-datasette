import pytest

from plugins.t100_globe import section_of, views_for
from tests.helpers import get


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
