import sqlite3

import pytest

from build_database import great_circle_miles, rebuild_pair_distance, rebuild_route_year_totals
from tests.helpers import add_segments
from tests.test_rollup_queries import put

LAX = dict(id=1, iata_code="LAX", latitude=33.9425, longitude=-118.4081)
SFO = dict(id=2, iata_code="SFO", latitude=37.6190, longitude=-122.3750)


def seg(origin, dest, distance=337, year=2025):
    return dict(year=year, month=1, origin=origin, dest=dest, distance=distance, departures_performed=10, passengers=100)


def rebuild(db_path, **kwargs):
    conn = sqlite3.connect(db_path)
    rebuild_route_year_totals(conn)
    rebuild_pair_distance(conn, **kwargs)
    rows = conn.execute("SELECT a, b, distance, gc_distance FROM pair_distance ORDER BY a, b").fetchall()
    conn.close()
    return rows


def test_great_circle_miles_lax_sfo():
    assert round(great_circle_miles(33.9425, -118.4081, 37.6190, -122.3750)) == 338


def test_gc_distance_is_filled_from_coordinates(db_path):
    put(db_path, "openflights_airports", [LAX, SFO])
    add_segments(db_path, "t100_domestic", [seg("LAX", "SFO")])
    assert rebuild(db_path) == [("LAX", "SFO", 337, 338)]


def test_gc_distance_is_null_without_coordinates(db_path):
    put(db_path, "openflights_airports", [LAX])
    add_segments(db_path, "t100_domestic", [seg("LAX", "SFO")])
    assert rebuild(db_path) == [("LAX", "SFO", 337, None)]


def test_overrides_win_over_openflights(db_path):
    put(db_path, "openflights_airports", [LAX, SFO])
    put(db_path, "airport_overrides", [dict(code="SFO", name="Far away", latitude=0.0, longitude=0.0)])
    add_segments(db_path, "t100_domestic", [seg("LAX", "SFO")])
    assert rebuild(db_path)[0][3] > 5000


def test_duplicate_iata_takes_lowest_id(db_path):
    put(db_path, "openflights_airports", [LAX, SFO, dict(id=99, iata_code="SFO", latitude=0.0, longitude=0.0)])
    add_segments(db_path, "t100_domestic", [seg("LAX", "SFO")])
    assert rebuild(db_path)[0][3] == 338


def test_openflights_blank_codes_are_ignored(db_path):
    put(db_path, "openflights_airports", [LAX, SFO, dict(id=0, iata_code="\\N", latitude=0.0, longitude=0.0)])
    add_segments(db_path, "t100_domestic", [seg("LAX", "SFO")])
    assert rebuild(db_path)[0][3] == 338


def test_old_pair_distance_without_the_column_is_rebuilt(db_path):
    conn = sqlite3.connect(db_path)
    conn.execute("DROP TABLE pair_distance")
    conn.execute("CREATE TABLE pair_distance (a TEXT, b TEXT, distance INTEGER, PRIMARY KEY (a, b)) WITHOUT ROWID")
    conn.commit()
    conn.close()
    put(db_path, "openflights_airports", [LAX, SFO])
    add_segments(db_path, "t100_domestic", [seg("LAX", "SFO")])
    assert rebuild(db_path) == [("LAX", "SFO", 337, 338)]


def test_rebuild_fails_without_coordinates_when_required(db_path):
    add_segments(db_path, "t100_domestic", [seg("LAX", "SFO")])
    with pytest.raises(RuntimeError):
        rebuild(db_path, require_coordinates=True)
    assert rebuild(db_path) == [("LAX", "SFO", 337, None)]
