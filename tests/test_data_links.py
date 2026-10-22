import pytest
import yaml

from tests.helpers import add_segments, get, get_json
from tests.test_rollup_queries import put

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
