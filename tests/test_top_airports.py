import sqlite3

from build_database import rebuild_airport_year_totals, rebuild_route_year_totals
from tests.helpers import add_segments as _add, get_json
from tests.test_routes_by_year import seg


def add_segments(db_path, table, rows):
    _add(db_path, table, rows)
    rebuilt(db_path)


def us(origin, year, deps, pax, seats=100, freight=0, city=None, dest="ZZZ"):
    row = seg(origin, dest, year, deps, pax, seats=seats, freight=freight)
    row.update(origin_wac=33, origin_city_name=city or f"{origin} City")
    return row


def rebuilt(db_path):
    conn = sqlite3.connect(db_path)
    rebuild_airport_year_totals(conn)
    rebuild_route_year_totals(conn)
    conn.close()


def top(ds, year=2025):
    body = get_json(ds, f"/t100/top_airports.json?year={year}&_shape=objects")
    assert body["truncated"] is False
    return {r["origin"]: r for r in body["rows"]}


def test_includes_every_us_airport_of_the_year_for_the_page_to_rank(ds, db_path):
    # 30 airports: passengers and departures rise with i; freight falls with i; each has one destination
    add_segments(db_path, "t100_domestic", [
        us(f"A{i:02d}", 2025, deps=100 + i, pax=1000 * (i + 1), seats=2000 * (i + 1), freight=1000 * (30 - i))
        for i in range(30)
    ])
    assert set(top(ds)) == {f"A{i:02d}" for i in range(30)}   # the page picks its top 20 airports, or cities, itself


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


def test_destinations_count_routes_with_twelve_departures_that_year(ds, db_path):
    add_segments(db_path, "t100_domestic", [
        us("ATL", 2025, 12, 100, dest="BOS"),
        us("ATL", 2025, 6, 100, dest="DEN"), us("ATL", 2025, 6, 100, dest="DEN"),  # 12 across two segments
        us("ATL", 2025, 11, 100, dest="LAX"),  # under the cut-off
        us("ATL", 2024, 50, 100, dest="SEA"),  # another year
        us("BOS", 2025, 11, 100, dest="ATL"),  # none at all
    ])
    got = top(ds)
    assert got["ATL"]["dests"] == 2
    assert got["BOS"]["dests"] == 0


def test_includes_top_twenty_by_destinations(ds, db_path):
    # 21 airports with one big route each; the smallest by every measure flies to the most places
    rows = [us(f"A{i:02d}", 2025, deps=1000 + i, pax=10000 + i, freight=1000 + i) for i in range(21)]
    rows += [us("A00", 2025, 12, 0, dest=f"D{j:02d}") for j in range(5)]
    rows[0] = us("A00", 2025, deps=1, pax=1, freight=0)
    add_segments(db_path, "t100_domestic", rows)
    assert "A00" in top(ds)


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


def test_all_years_adds_up_every_year_and_counts_destinations_flown_12_times_in_some_year(ds, db_path):
    add_segments(db_path, "t100_domestic", [
        us("ATL", 2019, 12, 100, seats=200, dest="BOS", city="Atlanta, GA"),
        us("ATL", 2024, 20, 300, seats=400, dest="BOS", city="Atlanta, GA"),   # BOS again: counted once
        us("ATL", 2024, 6, 50, seats=100, dest="DEN", city="Atlanta, GA"),     # never 12 in a year
        us("ATL", 2025, 12, 10, seats=20, dest="SEA", city="Atlanta, Georgia"),  # the newest name is the one shown
    ])
    for year in ("all", ""):
        atl = top(ds, year)["ATL"]
        assert (atl["deps"], atl["passengers"], atl["seats"], atl["dests"]) == (50, 460, 720, 2), year
        assert atl["origin_city_name"] == "Atlanta, Georgia"
