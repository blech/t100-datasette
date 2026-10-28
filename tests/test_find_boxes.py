import re

import pytest

from tests.helpers import get, get_json, put_airport_years
from tests.test_rollup_pages import aircraft_fixtures
from tests.test_rollup_queries import put
from tests.test_views_pages import delta

# Each section's pages other than its tables carry one find box, which opens a subject's page; the tables filter their own rows instead
FIND = {
    "airline": ["/airlines/over-time", "/airlines/delta", "/airlines/delta/routes", "/airlines/delta/aircraft", "/airlines/delta/changes", "/airlines/delta/globe"],
    "airport": ["/airports/over-time", "/airports/SFO", "/airports/SFO/destinations", "/airports/SFO/changes", "/airports/SFO/JFK",
                "/airports/SFO/JFK/table", "/airports/SFO/JFK/2019"],
    "aircraft": ["/aircraft/over-time", "/aircraft/makers", "/aircraft/boeing-737", "/aircraft/boeing-737/boeing-737-800"],
}
NO_FIND = ["/", "/about", "/airlines", "/aircraft", "/aircraft/groups", "/airports", "/airports/dedicated", "/airports/globe", "/airports/SFO/globe"]


def seed(db_path):
    delta(db_path)
    aircraft_fixtures(db_path)


@pytest.mark.parametrize("kind, path", [(k, p) for k, paths in FIND.items() for p in paths])
def test_each_sections_pages_have_its_find_box_under_the_title(ds, db_path, kind, path):
    seed(db_path)
    r = get(ds, path)
    assert r.status_code == 200, path
    boxes = re.findall(r'<input id="find"[^>]*>', r.text)
    assert len(boxes) == 1 and f'data-find="{kind}"' in boxes[0], path
    assert 'id="find-list"' in r.text and "/static/charts/find.js" in r.text
    title = re.search(r'<h1[ >]|id="title"', r.text).start()
    box = r.text.index('class="find"')
    after = [m.start() for m in re.finditer(r'class="intro"(?! id="subtitle")', r.text) if m.start() > title]  # a map has no intro: its box is in the picker row, as the airport map's is; an airport's name, its subtitle, may sit above the box
    assert title < box and (not after or box < after[0]), path


@pytest.mark.parametrize("path", NO_FIND)
def test_tables_maps_and_the_front_page_have_no_find_box(ds, db_path, path):
    seed(db_path)
    html = get(ds, path).text
    assert 'id="find"' not in html and "airline-search" not in html, path


def test_the_tables_filter_their_rows_and_say_so(ds):
    for path, field in (("/airlines", "airline-q"), ("/aircraft", "at-q")):
        assert re.search(rf'<label>Filter <input id="{field}" type="search"', get(ds, path).text), path


def test_airport_list_names_every_airport_flown_from_busiest_first(ds, db_path):
    put_airport_years(db_path, [dict(year=y, origin=o, origin_city_name=c, origin_wac=w, deps=d, seats=0, passengers=0, freight=0)
                                         for y, o, c, w, d in ((2019, "SFO", "San Francisco, CA", 91, 50), (2023, "SFO", "San Francisco, CA", 91, 60),
                                                               (2019, "LHR", "London, United Kingdom", 493, 70))])
    put(db_path, "airport_names", [dict(code="SFO", name="San Francisco, CA")])
    rows = get_json(ds, "/t100/airport_list.json?_shape=objects")["rows"]
    assert [(r["code"], r["place"], r["first_year"], r["last_year"], r["deps"]) for r in rows] == [
        ("SFO", "San Francisco, CA", 2019, 2023, 110), ("LHR", "London, United Kingdom", 2019, 2019, 70)]


def test_aircraft_list_names_each_aircraft_with_its_family_and_years(ds, db_path):
    aircraft_fixtures(db_path)
    put(db_path, "type_year", [dict(year=2020, aircraft_type="555", domestic=1, service_class="F", deps=0, seats=0, passengers=0, freight=0)])
    rows = get_json(ds, "/t100/aircraft_list.json?_shape=objects")["rows"]
    assert {(r["family"], r["name"], r["first_year"], r["last_year"]) for r in rows} == {
        ("Boeing 737", "Boeing 737-800", 2001, 2019), ("Unknown", "Type 999", 2019, 2019)}  # never flown: not offered


def test_airport_list_offers_an_airport_only_flown_to(ds, db_path):
    put_airport_years(db_path, [dict(year=2020, origin="ARR", origin_city_name="Arrivals, ST", origin_wac=34, deps=0, arrs=9)])
    assert [(r["code"], r["deps"]) for r in get_json(ds, "/t100/airport_list.json?_shape=objects")["rows"]] == [("ARR", 9)]
