from tests.helpers import add_segments
from tests.test_rollups import add_carriers, flight, query

AIRPORT_COLS = "deps, arrs, seats_out, seats_in, passengers_out, passengers_in, freight_out, freight_in"


def test_airport_dir_year_splits_out_and_in(db_path):
    add_segments(db_path, "t100_domestic", [flight("ATL", "LAX", deps=10, pax=1000, seats=1200, freight=5),
                                            flight("LAX", "ATL", deps=8, pax=900, seats=1000, freight=7)])
    rows = {r[0]: r[1:] for r in query(db_path, f"SELECT airport, {AIRPORT_COLS} FROM airport_dir_year WHERE year = 2019")}
    assert rows["ATL"] == (10, 8, 1200, 1000, 1000, 900, 5, 7)
    assert rows["LAX"] == (8, 10, 1000, 1200, 900, 1000, 7, 5)


def test_arrival_only_airport_has_a_row(db_path):
    add_segments(db_path, "t100_international", [flight("ATL", "LHR", deps=10, origin_city_name="Atlanta, GA",
                                                         dest_city_name="London, United Kingdom", dest_wac=493)])
    assert query(db_path, "SELECT deps, arrs, city_name, wac FROM airport_dir_year WHERE airport = 'LHR'") == [(0, 10, "London, United Kingdom", 493)]


def test_airport_carrier_dir_year_matches_airport_dir_year(db_path):
    add_carriers(db_path, ("19790", "A1", "Delta Air Lines Inc."), ("19977", "U1", "United Air Lines Inc."))
    add_segments(db_path, "t100_domestic", [flight("ATL", "LAX", carrier_entity="A1", **{"class": "F"}, deps=10, pax=1000),
                                            flight("LAX", "ATL", carrier_entity="U1", **{"class": "F"}, deps=8, pax=900),
                                            flight("ATL", "ORD", carrier_entity="U1", **{"class": "G"}, deps=3, pax=0, freight=40)])
    by_group = query(db_path, f"SELECT airport, year, SUM(deps), SUM(arrs), SUM(seats_out), SUM(seats_in), SUM(passengers_out), SUM(passengers_in), "
                              f"SUM(freight_out), SUM(freight_in) FROM airport_carrier_dir_year GROUP BY airport, year ORDER BY airport")
    totals = query(db_path, f"SELECT airport, year, {AIRPORT_COLS} FROM airport_dir_year ORDER BY airport")
    assert by_group == totals
    assert query(db_path, "SELECT group_id, deps, arrs FROM airport_carrier_dir_year WHERE airport = 'LAX' ORDER BY group_id") == [("delta", 0, 10), ("united", 8, 0)]


def test_carrier_pair_year_keeps_direction(db_path):
    add_carriers(db_path, ("19790", "A1", "Delta Air Lines Inc."))
    add_segments(db_path, "t100_domestic", [flight("LGA", "ATL", carrier_entity="A1", deps=10, month=3),
                                            flight("ATL", "LGA", carrier_entity="A1", deps=4, month=5),
                                            flight("ATL", "LGA", carrier_entity="A1", deps=2, month=9)])
    rows = query(db_path, "SELECT origin, dest, deps, first_month, last_month FROM carrier_pair_year ORDER BY origin")
    assert rows == [("ATL", "LGA", 6, 5, 9), ("LGA", "ATL", 10, 3, 3)]
