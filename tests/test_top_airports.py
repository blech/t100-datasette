import sqlite3

from build_database import rebuild_airport_carrier_dir_year, rebuild_airport_dir_year, rebuild_route_year_totals
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
    rebuild_airport_dir_year(conn)
    rebuild_airport_carrier_dir_year(conn)
    rebuild_route_year_totals(conn)
    conn.close()


def top(ds, year=2025, dir="", service="", region=""):
    body = get_json(ds, f"/t100/top_airports.json?year={year}&dir={dir}&service={service}&region={region}&_shape=objects")
    assert body["truncated"] is False
    return {r["airport"]: r for r in body["rows"]}


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
    assert [r["airport"] for r in body["rows"]].count("ATL") == 1


def test_row_totals_cities_and_ordering(ds, db_path):
    add_segments(db_path, "t100_domestic", [
        us("ATL", 2025, 10, 100, seats=200, freight=3000, city="Atlanta, GA"),
        us("ATL", 2025, 5, 50, seats=100, freight=1000, city="Atlanta, GA"),
        us("BOS", 2025, 1, 500, seats=600, freight=10, city="Boston, MA"),
    ])
    body = get_json(ds, "/t100/top_airports.json?year=2025&_shape=objects")
    assert [r["airport"] for r in body["rows"]] == ["BOS", "ATL"]   # by passengers, descending
    atl = top(ds)["ATL"]
    assert (atl["city"], atl["deps"], atl["seats"], atl["passengers"], atl["freight"]) == ("Atlanta, GA", 15, 300, 150, 4000)


def test_destinations_count_routes_with_twelve_departures_that_year(ds, db_path):
    add_segments(db_path, "t100_domestic", [
        us("ATL", 2025, 12, 100, dest="BOS"),
        us("ATL", 2025, 6, 100, dest="DEN"), us("ATL", 2025, 6, 100, dest="DEN"),  # 12 across two segments
        us("ATL", 2025, 11, 100, dest="LAX"),  # under the cut-off
        us("ATL", 2024, 50, 100, dest="SEA"),  # another year
        us("BOS", 2025, 11, 100, dest="ATL"),  # none at all
    ])
    got = top(ds, dir="out")
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
        rebuild_airport_dir_year(conn)
        assert conn.execute(
            "SELECT airport, city_name, wac, year, deps, seats_out, passengers_out, freight_out FROM airport_dir_year WHERE airport = 'ATL'"
        ).fetchall() == [("ATL", "Atlanta, GA", 33, 2025, 12, 240, 120, 3500)]


def test_totals_match_the_view_for_every_airport_and_year(db_path):
    _add(db_path, "t100_domestic", [us("ATL", 2024, 3, 30), us("ATL", 2025, 4, 40), us("BOS", 2025, 5, 50)])
    _add(db_path, "t100_international", [us("BOS", 2025, 1, 10)])
    conn = sqlite3.connect(db_path)
    rebuild_airport_dir_year(conn)
    expected = conn.execute("SELECT origin, year, SUM(departures_performed), SUM(passengers) FROM t100 GROUP BY origin, year ORDER BY 1, 2").fetchall()
    got = conn.execute("SELECT airport, year, deps, passengers_out FROM airport_dir_year WHERE deps > 0 ORDER BY 1, 2").fetchall()
    assert got == expected


def test_all_years_adds_up_every_year_and_counts_destinations_flown_12_times_in_some_year(ds, db_path):
    add_segments(db_path, "t100_domestic", [
        us("ATL", 2019, 12, 100, seats=200, dest="BOS", city="Atlanta, GA"),
        us("ATL", 2024, 20, 300, seats=400, dest="BOS", city="Atlanta, GA"),   # BOS again: counted once
        us("ATL", 2024, 6, 50, seats=100, dest="DEN", city="Atlanta, GA"),     # never 12 in a year
        us("ATL", 2025, 12, 10, seats=20, dest="SEA", city="Atlanta, Georgia"),  # the newest name is the one shown
    ])
    for year in ("all", ""):
        atl = top(ds, year, dir="out")["ATL"]
        assert (atl["deps"], atl["passengers"], atl["seats"], atl["dests"]) == (50, 460, 720, 2), year
        assert atl["city"] == "Atlanta, Georgia"


def arriving(origin, airport, year, deps, pax):
    row = seg(origin, airport, year, deps, pax)
    row.update(dest_wac=33, dest_city_name=f"{airport} City")
    return row


def test_top_airports_ranks_on_both_by_default(ds, db_path):
    add_segments(db_path, "t100_domestic", [us("X", 2025, 10, 10, dest="Q"), arriving("Q", "X", 2025, 100, 100), us("Y", 2025, 60, 60, dest="Q")])
    assert list(top(ds))[:2] == ["X", "Y"]
    assert list(top(ds, dir="out"))[:2] == ["Y", "X"]
    assert top(ds)["X"]["passengers"] == 110 and top(ds, dir="in")["X"]["passengers"] == 100
    assert [top(ds, dir=d)["X"]["dests"] for d in ("", "out", "in")] == [1, 0, 1]   # Q: 110 both ways (24+), 10 out (under 12), 100 in


def mixed_service(db_path):
    """ATL flies domestic to BOS (20 departures) and international to LHR (12); SEA flies only domestic; each route appears once."""
    add_segments(db_path, "t100_domestic", [us("ATL", 2025, 20, 2000, seats=3000, freight=100, dest="BOS"), us("SEA", 2025, 15, 1500, dest="BOS")])
    add_segments(db_path, "t100_international", [us("ATL", 2025, 12, 900, seats=1200, freight=700, dest="LHR")])


def test_service_counts_only_the_domestic_or_international_routes(ds, db_path):
    mixed_service(db_path)
    atl = {s: top(ds, service=s)["ATL"] for s in ("", "all", "domestic", "international")}
    assert (atl["domestic"]["deps"], atl["domestic"]["passengers"], atl["domestic"]["seats"], atl["domestic"]["freight"]) == (20, 2000, 3000, 100)
    assert (atl["international"]["deps"], atl["international"]["passengers"], atl["international"]["seats"], atl["international"]["freight"]) == (12, 900, 1200, 700)
    assert atl[""] == atl["all"] and atl["all"]["deps"] == 32 and atl["all"]["passengers"] == 2900   # no service means every route


def test_an_airport_with_no_routes_of_a_service_is_left_out(ds, db_path):
    mixed_service(db_path)
    assert set(top(ds, service="international")) == {"ATL"}
    assert set(top(ds, service="domestic")) == {"ATL", "SEA"}


def test_totals_follow_the_file_and_destinations_follow_the_route_rule(ds, db_path):
    # BOS has 30 departures in the domestic file and 5 in the international: its traffic splits by file, but the matrices call the
    # route domestic (most departures), so it is a domestic destination only
    add_segments(db_path, "t100_domestic", [us("ATL", 2025, 30, 3000, dest="BOS")])
    add_segments(db_path, "t100_international", [us("ATL", 2025, 5, 500, dest="BOS")])
    dom, intl = (top(ds, dir="out", service=s)["ATL"] for s in ("domestic", "international"))
    assert (dom["passengers"], dom["dests"]) == (3000, 1)
    assert (intl["passengers"], intl["dests"]) == (500, 0)


def test_destinations_count_only_the_service_asked_for(ds, db_path):
    mixed_service(db_path)
    add_segments(db_path, "t100_domestic", [us("ATL", 2025, 30, 300, dest="DEN")])
    assert [top(ds, dir="out", service=s)["ATL"]["dests"] for s in ("", "domestic", "international")] == [3, 2, 1]


def test_service_with_a_direction_and_all_years(ds, db_path):
    mixed_service(db_path)
    add_segments(db_path, "t100_international", [us("ATL", 2019, 12, 400, dest="LHR"), arriving("LHR", "ATL", 2025, 40, 4000)])
    assert top(ds, "all", dir="out", service="international")["ATL"]["passengers"] == 1300      # 2025 and 2019, leaving only
    assert top(ds, 2025, dir="in", service="international")["ATL"]["passengers"] == 4000
    assert top(ds, 2025, service="international")["ATL"]["passengers"] == 4900                   # both ways


def abroad(db_path):
    """LHR (outside the US) flies to JFK 20 times and back 30, and to BOS 12 times; JFK also flies domestic to ATL."""
    to_us = lambda dest, deps, pax: dict(seg("LHR", dest, 2025, deps, pax), origin_wac=491, origin_city_name="London, United Kingdom", dest_wac=22, dest_city_name=f"{dest} City")
    from_us = dict(seg("JFK", "LHR", 2025, 30, 3000), origin_wac=22, origin_city_name="New York, NY", dest_wac=491, dest_city_name="London, United Kingdom")
    add_segments(db_path, "t100_international", [to_us("JFK", 20, 2000), from_us, to_us("BOS", 12, 600)])
    add_segments(db_path, "t100_domestic", [us("JFK", 2025, 40, 4000, dest="ATL")])


def test_region_abroad_lists_airports_outside_the_us_by_their_flights_to_and_from_it(ds, db_path):
    abroad(db_path)
    assert set(top(ds, region="abroad")) == {"LHR"}
    assert set(top(ds)) == set(top(ds, region="us")) == {"BOS", "JFK"}   # the US airports with flights to LHR or others; LHR is not one
    lhr = top(ds, region="abroad")["LHR"]
    assert (lhr["city"], lhr["deps"], lhr["passengers"], lhr["dests"]) == ("London, United Kingdom", 62, 5600, 1)   # JFK; BOS has only 12 flights, under the 24 both ways


def test_region_abroad_counts_each_direction_as_the_flights_to_or_from_the_us(ds, db_path):
    abroad(db_path)
    assert top(ds, dir="out", region="abroad")["LHR"]["passengers"] == 2600   # to the US: departures from LHR
    assert top(ds, dir="in", region="abroad")["LHR"]["passengers"] == 3000    # from the US: arrivals at LHR
    assert [top(ds, dir=d, region="abroad")["LHR"]["dests"] for d in ("", "out", "in")] == [1, 2, 1]   # 12 or more one way (JFK and BOS leaving, JFK arriving), 24 both ways (JFK)


def test_every_flight_at_an_airport_abroad_is_international(ds, db_path):
    abroad(db_path)
    assert top(ds, service="international", region="abroad")["LHR"]["passengers"] == 5600
    assert top(ds, service="domestic", region="abroad") == {}
