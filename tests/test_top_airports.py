import sqlite3

from build_database import rebuild_airport_year_totals
from tests.helpers import add_segments as _add, get_json
from tests.test_routes_by_year import seg


def add_segments(db_path, table, rows):
    _add(db_path, table, rows)
    rebuilt(db_path)


def us(origin, year, deps, pax, seats=100, freight=0, city=None):
    row = seg(origin, "ZZZ", year, deps, pax, seats=seats, freight=freight)
    row.update(origin_wac=33, origin_city_name=city or f"{origin} City")
    return row


def rebuilt(db_path):
    conn = sqlite3.connect(db_path)
    rebuild_airport_year_totals(conn)
    conn.close()


def top(ds, year=2025):
    body = get_json(ds, f"/t100/top_airports.json?year={year}&_shape=objects")
    assert body["truncated"] is False
    return {r["origin"]: r for r in body["rows"]}


def test_includes_top_twenty_for_each_measure_and_nothing_else(ds, db_path):
    # 30 airports: passengers, seats and departures rise with i; freight falls with i
    add_segments(db_path, "t100_domestic", [
        us(f"A{i:02d}", 2025, deps=100 + i, pax=1000 * (i + 1), seats=2000 * (i + 1), freight=1000 * (30 - i))
        for i in range(30)
    ])
    got = set(top(ds))
    by_volume = {f"A{i:02d}" for i in range(10, 30)}   # top 20 of passengers, seats and departures
    by_freight = {f"A{i:02d}" for i in range(0, 20)}   # top 20 of freight
    assert got == by_volume | by_freight


def test_airports_in_several_top_twenties_appear_once(ds, db_path):
    add_segments(db_path, "t100_domestic", [us("ATL", 2025, 500, 9000, seats=9000, freight=50), us("XYZ", 2025, 5, 10)])
    body = get_json(ds, "/t100/top_airports.json?year=2025&_shape=objects")
    assert [r["origin"] for r in body["rows"]].count("ATL") == 1


def test_row_totals_cities_and_ordering(ds, db_path):
    add_segments(db_path, "t100_domestic", [
        us("ATL", 2025, 10, 100, seats=200, freight=3000, city="Atlanta, GA"),
        us("ATL", 2025, 5, 50, seats=100, freight=1000, city="Atlanta, GA"),
        us("BOS", 2025, 1, 500, seats=600, freight=10, city="Boston, MA"),
    ])
    body = get_json(ds, "/t100/top_airports.json?year=2025&_shape=objects")
    assert [r["origin"] for r in body["rows"]] == ["BOS", "ATL"]   # by passengers, descending
    atl = top(ds)["ATL"]
    assert (atl["origin_city_name"], atl["deps"], atl["seats"], atl["passengers"], atl["freight"]) == ("Atlanta, GA", 15, 300, 150, 4000)


def test_only_the_requested_year_and_us_origins(ds, db_path):
    foreign = us("LHR", 2025, 99, 9999)
    foreign["origin_wac"] = 491
    add_segments(db_path, "t100_domestic", [us("ATL", 2025, 1, 1), us("OLD", 2019, 99, 9999)])
    add_segments(db_path, "t100_international", [foreign])
    assert set(top(ds, 2025)) == {"ATL"}
    assert set(top(ds, 2019)) == {"OLD"}


def test_rebuild_combines_both_tables_and_is_repeatable(db_path):
    dom = us("ATL", 2025, 10, 100, seats=200, freight=3000, city="Atlanta, GA")
    intl = us("ATL", 2025, 2, 20, seats=40, freight=500, city="Atlanta, GA")
    _add(db_path, "t100_domestic", [dom])
    _add(db_path, "t100_international", [intl])
    conn = sqlite3.connect(db_path)
    for _ in range(2):  # a second rebuild replaces rather than adds
        rebuild_airport_year_totals(conn)
        assert conn.execute(
            "SELECT origin, origin_city_name, origin_wac, year, deps, seats, passengers, freight FROM airport_year_totals"
        ).fetchall() == [("ATL", "Atlanta, GA", 33, 2025, 12, 240, 120, 3500)]


def test_totals_match_the_view_for_every_airport_and_year(db_path):
    _add(db_path, "t100_domestic", [us("ATL", 2024, 3, 30), us("ATL", 2025, 4, 40), us("BOS", 2025, 5, 50)])
    _add(db_path, "t100_international", [us("BOS", 2025, 1, 10)])
    conn = sqlite3.connect(db_path)
    rebuild_airport_year_totals(conn)
    expected = conn.execute("SELECT origin, year, SUM(departures_performed), SUM(passengers) FROM t100 GROUP BY origin, year ORDER BY 1, 2").fetchall()
    got = conn.execute("SELECT origin, year, deps, passengers FROM airport_year_totals ORDER BY 1, 2").fetchall()
    assert got == expected
