import re

import pytest
import yaml

from tests.helpers import add_segments, get, get_json
from tests.test_rollup_queries import put
from tests.test_views_pages import delta

INVENTORY = ["top_airports", "top_us_airports", "airport_size", "routes_by_year", "airport_changes", "route", "route_year", "type_table",
             "maker_by_year", "engines_by_year", "family_detail", "airline_table", "carrier_group_by_year", "carrier_group_detail",
             "carrier_route_by_year", "carrier_route_changes", "carrier_routes_year"]

AIRLINES = {"united": ("19977", "U1", "United Air Lines Inc.", "United (incl. Continental)"),
            "delta": ("19790", "D1", "Delta Air Lines Inc.", "Delta (incl. Northwest)")}


def seed(db_path):
    for group, (airline, entity, name, group_name) in AIRLINES.items():
        put(db_path, "carriers", [dict(airline_id=airline, carrier_entity=entity, unique_carrier_entity=entity, name=name,
                                       unique_carrier_name=name, start_date_source="1/1/1990 12:00:00 AM")])
        put(db_path, "carrier_group", [dict(airline_id=airline, group_id=group, group_name=group_name, airline_name=name)])
        put(db_path, "family_detail_year", [dict(family="Boeing 737", year=2019, subfamily="737-800", group_id=group, group_name=group_name,
                                                 domestic=1, service_class="F", deps=10, seats=1000, passengers=800, freight=0)])
    put(db_path, "aircraft_types", [dict(ac_typeid="622", ac_group="6", name="Boeing 737-800")])
    add_segments(db_path, "t100_domestic", [
        dict(year=2019, month=m, origin="SFO", dest="JFK", carrier_entity=e, aircraft_type="622", departures_performed=10,
             passengers=1000, seats=1500, freight=0, **{"class": "F"})
        for m in (1, 2) for e in ("U1", "D1")
    ])


def rows(ds, path):
    sep = "&" if "?" in path else "?"
    return get_json(ds, f"{path}{sep}_shape=objects")["rows"]


@pytest.mark.parametrize("path, key", [
    ("/t100/route.json?origin=SFO&dest=JFK", "group_id"),
    ("/t100/route_year.json?origin=SFO&dest=JFK&year=2019", "group_id"),
    ("/t100/airport_size.json?origin=SFO", "group_id"),
    ("/t100/airport_changes.json?origin=SFO&a=2019&b=2019", "group_id"),
    ("/t100/family_detail.json?family=Boeing+737", "group_id"),
])
def test_an_empty_group_means_every_airline_and_a_group_narrows(ds, db_path, path, key):
    seed(db_path)
    assert {r[key] for r in rows(ds, path + "&group=")} == {"united", "delta"}
    assert {r[key] for r in rows(ds, path + "&group=united")} == {"united"}
    assert rows(ds, path + "&group=nope") == []


def test_each_linked_query_has_a_title_and_description():
    queries = yaml.safe_load(open("datasette.yml"))["databases"]["t100"]["queries"]
    for name in INVENTORY:
        assert queries[name].get("title") and queries[name].get("description"), name


def test_a_data_page_is_titled_by_its_query_not_its_sql(ds):
    html = get(ds, "/t100/route?origin=SFO&dest=JFK&group=&_hide_sql=1").text
    assert "<title>t100: WITH" not in html and "Every carrier and aircraft on a route, by year" in html


SCROLLING = ["/airports", "/airports/SFO", "/airports/SFO/destinations", "/airports/SFO/changes", "/airports/SFO/JFK", "/airports/SFO/JFK/2019/table",
             "/aircraft", "/aircraft/makers", "/aircraft/engines", "/aircraft/boeing-737", "/airlines", "/airlines/over-time",
             "/airlines/delta", "/airlines/delta/routes", "/airlines/delta/changes"]
FOOTER_LINK = '<span class="data-link" hidden><a id="data-link" href="">This page\'s data</a> · </span>'


def footer(html):
    return re.search(r'<footer class="site-footer">.*?</footer>', html, re.S).group(0)


def test_every_scrolling_page_has_the_data_link_in_its_footer(ds, db_path):
    delta(db_path)
    put(db_path, "family_year", [dict(family="Boeing 737", year=2019, domestic=1, service_class="F", deps=1)])
    for path in SCROLLING:
        r = get(ds, path)
        assert r.status_code == 200, path
        f = footer(r.text)
        assert FOOTER_LINK in f and f.index(FOOTER_LINK) < f.index("About the data"), path


def test_the_maps_have_the_data_link_in_their_controls(ds, db_path):
    delta(db_path)
    for path in ("/airports/globe", "/airports/SFO/globe", "/airlines/delta/globe"):
        html = get(ds, path).text
        assert re.search(r'id="theme"[^>]*></select>\s*<a id="data-link" class="data-link" href="" hidden>This map\'s data</a>', html), path


def test_the_route_notes_no_longer_carry_a_raw_data_link(ds):
    for path in ("/airports/SFO/JFK", "/airports/SFO/JFK/table", "/airports/SFO/JFK/2019"):
        html = get(ds, path).text
        assert "Raw data table" not in html and 'id="raw-link"' not in html, path


def test_the_about_page_explains_the_data_links(ds):
    html = get(ds, "/about").text
    source = html[html.index('id="source"'):]
    assert "This page's data" in source and "group" in source and "/t100/t100" in source


def test_the_front_and_about_pages_have_no_stray_separator(ds):
    for path in ("/", "/about"):
        text = " ".join(re.sub(r"<[^>]+>", " ", footer(get(ds, path).text)).split())
        assert "· ·" not in text, path


def test_datasettes_own_pages_have_no_theme_menu_or_data_link_in_their_footer(ds):
    for path in ("/t100", "/t100/t100", "/t100/route?origin=SFO&dest=JFK&group="):
        f = footer(get(ds, path).text)
        assert 'id="theme"' not in f and 'id="data-link"' not in f, path
        assert "About the data" in f and "· ·" not in " ".join(re.sub(r"<[^>]+>", " ", f).split()), path
    assert 'id="theme"' in footer(get(ds, "/airports").text)


@pytest.mark.parametrize("query, table, row", [
    ("type_table", "type_year", dict(year=2019, aircraft_type="622", domestic=1, service_class="F", deps=10, seats=1500, passengers=1000, freight=0)),
    ("airline_table", "carrier_group_year", dict(year=2019, group_id="delta", group_name="Delta (incl. Northwest)", airline_id="19790", domestic=1,
                                                 service_class="F", deps=10, seats=1500, passengers=1000, freight=0)),
])
def test_an_empty_year_means_all_years_as_all_does(ds, db_path, query, table, row):
    put(db_path, table, [row, {**row, "year": 2020, "deps": 5}])
    empty, everything = rows(ds, f"/t100/{query}.json?year="), rows(ds, f"/t100/{query}.json?year=all")
    assert empty == everything and sum(r["deps"] for r in empty) == 15


def test_the_descriptions_say_what_an_empty_year_does():
    queries = yaml.safe_load(open("datasette.yml"))["databases"]["t100"]["queries"]
    for name in ("type_table", "airline_table"):
        assert "Leave year empty for all years." in queries[name]["description"], name
    for name in ("top_airports", "route_year", "carrier_routes_year"):
        assert "Give a year." in queries[name]["description"], name
    assert queries["type_table"]["description"].startswith("One row per aircraft type,")
