from tests.helpers import add_segments, get_json
from tests.test_routes_by_year import seg


def us(origin, year, deps, pax, seats=100, freight=0, city=None):
    row = seg(origin, "ZZZ", year, deps, pax, seats=seats, freight=freight)
    row.update(origin_wac=33, origin_city_name=city or f"{origin} City")
    return row


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
