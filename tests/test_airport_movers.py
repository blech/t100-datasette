import pytest

from tests.helpers import get_json, put_airport_years


def put(db_path, year, code, passengers, passengers_in=0, wac=34):
    put_airport_years(db_path, [dict(year=year, origin=code, origin_city_name=f"{code} City, ST", origin_wac=wac, deps=1, seats=1,
                                     passengers=passengers, passengers_in=passengers_in, freight=0)])


def movers(ds, from_year=1990, to_year=2025, min_value=0, measure=""):
    url = f"/t100/airport_movers.json?_shape=objects&from_year={from_year}&to_year={to_year}&min_value={min_value}&measure={measure}"
    return {r["airport"]: r for r in get_json(ds, url)["rows"]}


def series(db_path, code, **by_year):
    for year, passengers in by_year.items():
        put(db_path, int(year[1:]), code, passengers)


def test_growth_is_the_ratio_of_passengers_and_is_compared_with_the_median_airport(ds, db_path):
    for code, before, after in (("AAA", 100, 200), ("BBB", 100, 100), ("CCC", 100, 50)):
        series(db_path, code, y1990=before, y2025=after)
    rows = movers(ds)
    assert [rows[c]["ratio"] for c in ("AAA", "BBB", "CCC")] == [2.0, 1.0, 0.5]
    assert {r["median_ratio"] for r in rows.values()} == {1.0}
    assert [rows[c]["vs_median"] for c in ("AAA", "BBB", "CCC")] == [2.0, 1.0, 0.5]
    assert rows["AAA"]["value_from"] == 100 and rows["AAA"]["value_to"] == 200 and rows["AAA"]["city"] == "AAA City, ST"


def test_the_median_of_an_even_number_of_airports_is_the_mean_of_the_middle_two(ds, db_path):
    for code, after in (("AAA", 100), ("BBB", 200), ("CCC", 300), ("DDD", 1000)):
        series(db_path, code, y1990=100, y2025=after)
    assert {r["median_ratio"] for r in movers(ds).values()} == {2.5}


def test_passengers_are_counted_both_ways(ds, db_path):
    put(db_path, 1990, "AAA", 60, 40)
    put(db_path, 2025, "AAA", 150, 150)
    row = movers(ds)["AAA"]
    assert (row["value_from"], row["value_to"], row["ratio"]) == (100, 300, 3.0)


def test_airports_below_the_minimum_in_the_first_year_are_left_out_and_do_not_move_the_median(ds, db_path):
    series(db_path, "BIG", y1990=1000, y2025=1000)
    series(db_path, "TINY", y1990=10, y2025=1000)
    rows = movers(ds, min_value=500)
    assert list(rows) == ["BIG"] and rows["BIG"]["median_ratio"] == 1.0


def test_an_airport_with_no_passengers_in_the_last_year_has_a_ratio_of_nothing(ds, db_path):
    series(db_path, "GONE", y1990=100)
    series(db_path, "STAY", y1990=100, y2025=100)
    rows = movers(ds)
    assert rows["GONE"]["value_to"] == 0 and rows["GONE"]["ratio"] == 0 and rows["GONE"]["city"] == "GONE City, ST"


def test_airports_outside_the_us_are_left_out(ds, db_path):
    put(db_path, 1990, "LHR", 100, wac=493)
    put(db_path, 2025, "LHR", 500, wac=493)
    series(db_path, "AAA", y1990=100, y2025=100)
    assert list(movers(ds)) == ["AAA"]


def test_the_peak_is_the_busiest_year_in_the_range_and_the_latest_year_wins_a_tie(ds, db_path):
    series(db_path, "STL", y1990=100, y2000=300, y2010=300, y2025=150)
    series(db_path, "OUT", y1990=100, y2025=100)
    put(db_path, 1980, "OUT", 9999)  # before the range
    rows = movers(ds)
    assert (rows["STL"]["peak_year"], rows["STL"]["peak_value"], rows["STL"]["vs_peak"]) == (2010, 300, 0.5)
    assert (rows["OUT"]["peak_value"], rows["OUT"]["vs_peak"]) == (100, 1.0)  # the 1980 figure is outside the range


def test_the_range_is_the_years_asked_for(ds, db_path):
    series(db_path, "AAA", y1990=100, y2005=400, y2019=200, y2025=900)
    assert movers(ds, 2005, 2019)["AAA"]["ratio"] == 0.5
    assert movers(ds, 2019, 2025)["AAA"]["ratio"] == 4.5


@pytest.mark.parametrize("from_year, to_year", [("", 2025), (1990, ""), ("x", "y")])
def test_missing_or_bad_years_give_no_rows_and_no_error(ds, db_path, from_year, to_year):
    series(db_path, "AAA", y1990=100, y2025=200)
    assert movers(ds, from_year, to_year) == {}


def test_rows_come_back_fastest_growing_first(ds, db_path):
    for code, after in (("SLOW", 50), ("FAST", 500), ("MID", 100)):
        series(db_path, code, y1990=100, y2025=after)
    rows = get_json(ds, "/t100/airport_movers.json?_shape=objects&from_year=1990&to_year=2025&min_value=0")["rows"]
    assert [r["airport"] for r in rows] == ["FAST", "MID", "SLOW"]


def movers_series(ds, from_year=1990, to_year=2025, min_value=0, measure=""):
    url = f"/t100/airport_movers_series.json?_shape=objects&from_year={from_year}&to_year={to_year}&min_value={min_value}&measure={measure}"
    return [(r["airport"], r["year"], r["value"]) for r in get_json(ds, url)["rows"]]


def test_the_series_gives_every_year_in_the_range_of_the_airports_the_movers_query_lists(ds, db_path):
    series(db_path, "AAA", y1990=100, y2000=150, y2010=180, y2025=200)
    series(db_path, "TINY", y1990=10, y2000=500, y2025=500)  # below the minimum in the first year: not listed, so no lines
    series(db_path, "NEW", y2000=900, y2025=900)  # nothing in the first year
    put(db_path, 1980, "AAA", 7)  # before the range
    put_airport_years(db_path, [dict(year=2000, origin="LHR", origin_wac=493, deps=1, seats=1, passengers=9, freight=0)])
    assert movers_series(ds, min_value=50) == [("AAA", 1990, 100), ("AAA", 2000, 150), ("AAA", 2010, 180), ("AAA", 2025, 200)]


def test_the_series_counts_both_ways_and_has_no_row_for_a_year_the_airport_had_nothing(ds, db_path):
    put(db_path, 1990, "AAA", 60, 40)
    put(db_path, 2025, "AAA", 10, 5)
    assert movers_series(ds) == [("AAA", 1990, 100), ("AAA", 2025, 15)]


def test_an_airport_with_under_one_percent_left_is_marked_lost_and_is_not_in_the_median(ds, db_path):
    for code, after in (("AAA", 100), ("BBB", 200), ("CCC", 300)):
        series(db_path, code, y1990=100, y2025=after)
    series(db_path, "DET", y1990=1000, y2025=9)  # 0.9%
    series(db_path, "LOW", y1990=1000, y2025=10)  # 1%: a fall, but not lost
    rows = movers(ds)
    assert {c: rows[c]["lost"] for c in rows} == {"AAA": 0, "BBB": 0, "CCC": 0, "DET": 1, "LOW": 0}
    # AAA 1, BBB 2, CCC 3 and LOW 0.01 have a median of 1.5; with DET it would be 1
    assert {r["median_ratio"] for r in rows.values()} == {1.5}
    assert rows["DET"]["ratio"] == pytest.approx(0.009)


def test_an_airport_with_nothing_in_the_last_year_is_lost(ds, db_path):
    series(db_path, "GONE", y1990=100)
    series(db_path, "STAY", y1990=100, y2025=100)
    rows = movers(ds)
    assert rows["GONE"]["lost"] == 1 and rows["STAY"]["lost"] == 0


def flights(db_path, code, year, deps, arrs, passengers=999):
    put_airport_years(db_path, [dict(year=year, origin=code, origin_city_name=f"{code} City, ST", origin_wac=34, deps=deps, arrs=arrs, seats=1,
                                     passengers=passengers, freight=0)])


def test_flights_are_departures_and_arrivals_and_passengers_play_no_part(ds, db_path):
    flights(db_path, "AAA", 1990, 60, 40)
    flights(db_path, "AAA", 2025, 150, 150, passengers=1)
    row = movers(ds, measure="flights")["AAA"]
    assert (row["value_from"], row["value_to"], row["ratio"]) == (100, 300, 3.0)
    assert movers(ds)["AAA"]["ratio"] < 1  # passengers: 999 then, 1 now (the default measure)


def test_flights_have_their_own_minimum_and_series(ds, db_path):
    flights(db_path, "BIG", 1990, 600, 400)
    flights(db_path, "BIG", 2000, 700, 700)
    flights(db_path, "BIG", 2025, 800, 800)
    flights(db_path, "SMALL", 1990, 10, 10)
    flights(db_path, "SMALL", 2025, 100, 100)
    assert list(movers(ds, min_value=500, measure="flights")) == ["BIG"]
    assert movers_series(ds, min_value=500, measure="flights") == [("BIG", 1990, 1000), ("BIG", 2000, 1400), ("BIG", 2025, 1600)]


def test_an_unknown_measure_is_passengers(ds, db_path):
    flights(db_path, "AAA", 1990, 60, 40, passengers=100)
    flights(db_path, "AAA", 2025, 1500, 1500, passengers=200)
    assert movers(ds, measure="bogus")["AAA"]["ratio"] == 2.0 and movers(ds, measure="")["AAA"]["ratio"] == 2.0


def route(db_path, year, a, b, ab=0, ba=0):
    from tests.helpers import _insert
    _insert(db_path, "route_year_totals", [dict(year=year, origin=o, dest=d, deps=n, domestic_deps=n, seats=0, passengers=0, freight=0)
                                           for o, d, n in ((a, b, ab), (b, a, ba)) if n])


def destinations_data(db_path):
    for year in (1990, 2025):
        for code in ("HUB", "AAA", "BBB", "CCC"):
            put(db_path, year, code, 1)
        put(db_path, year, "LHR", 1, wac=493)
    route(db_path, 1990, "HUB", "AAA", 12, 12)  # a destination: 24 flights both ways, 12 or more one way
    route(db_path, 1990, "HUB", "BBB", 11, 12)  # 23 both ways: not one
    route(db_path, 2025, "HUB", "AAA", 12, 12)
    route(db_path, 2025, "HUB", "BBB", 11, 13)  # 24 both ways, 13 one way
    route(db_path, 2025, "HUB", "CCC", 24, 0)  # 24 one way, none back
    route(db_path, 2025, "HUB", "LHR", 12, 12)  # a destination abroad counts, though LHR is not listed itself


def test_destinations_are_the_other_airports_with_enough_flights_both_ways(ds, db_path):
    destinations_data(db_path)
    rows = movers(ds, measure="destinations")
    assert set(rows) == {"HUB", "AAA"}  # BBB and CCC have none in 1990, LHR is not a US airport
    assert (rows["HUB"]["value_from"], rows["HUB"]["value_to"], rows["HUB"]["ratio"]) == (1, 4, 4.0)
    assert (rows["AAA"]["value_from"], rows["AAA"]["value_to"], rows["AAA"]["ratio"]) == (1, 1, 1.0)
    assert rows["HUB"]["city"] == "HUB City, ST" and rows["HUB"]["median_ratio"] == 2.5


def test_a_pair_is_counted_once_whichever_way_its_flights_are_listed(ds, db_path):
    destinations_data(db_path)
    route(db_path, 2025, "AAA", "CCC", 0, 30)  # listed from CCC's side only
    rows = movers(ds, measure="destinations")
    assert rows["AAA"]["value_to"] == 2


def test_a_flight_from_an_airport_to_itself_is_not_a_destination(ds, db_path):
    destinations_data(db_path)
    route(db_path, 1990, "HUB", "HUB", 50)  # a sightseeing loop
    route(db_path, 2025, "HUB", "HUB", 50)
    rows = movers(ds, measure="destinations")
    assert (rows["HUB"]["value_from"], rows["HUB"]["value_to"]) == (1, 4)
    assert ("HUB", 1990, 1) in movers_series(ds, measure="destinations")


def test_destinations_by_year_for_the_lines(ds, db_path):
    destinations_data(db_path)
    assert movers_series(ds, measure="destinations") == [("AAA", 1990, 1), ("AAA", 2025, 1), ("HUB", 1990, 1), ("HUB", 2025, 4)]


def test_destinations_have_their_own_minimum(ds, db_path):
    destinations_data(db_path)
    assert list(movers(ds, min_value=2, measure="destinations")) == []
