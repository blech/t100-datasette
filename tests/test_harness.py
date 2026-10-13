import sqlite3

from build_database import SEGMENT_TABLES
from tests.helpers import add_segments, get_json


def test_view_unions_both_tables_with_domestic_flag(db_path):
    add_segments(db_path, "t100_international", [{"year": 2020, "month": 1, "origin": "JFK", "dest": "LHR", "departures_performed": 5}])
    add_segments(db_path, "t100_domestic", [{"year": 2020, "month": 1, "origin": "JFK", "dest": "LAX", "departures_performed": 7}])
    conn = sqlite3.connect(db_path)
    rows = conn.execute("select domestic, dest from t100 order by dest").fetchall()
    assert rows == [(1, "LAX"), (0, "LHR")]


def test_tables_exist(db_path):
    conn = sqlite3.connect(db_path)
    names = {r[0] for r in conn.execute("select name from sqlite_master where type='table'")}
    assert set(SEGMENT_TABLES) <= names
    assert {"carriers", "aircraft_types", "openflights_airports", "airport_overrides"} <= names


def test_datasette_serves_existing_canned_query(ds, db_path):
    add_segments(db_path, "t100_domestic", [{"year": 2025, "month": 1, "origin": "ATL", "origin_wac": 34, "origin_city_name": "Atlanta, GA", "dest": "LAX", "departures_performed": 3, "passengers": 100, "seats": 150, "freight": 0}])
    body = get_json(ds, "/t100/top_us_airports.json?year=2025&_shape=objects")
    assert body["rows"][0]["origin"] == "ATL"
