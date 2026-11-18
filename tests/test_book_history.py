import sqlite3

import pytest

from scripts.book.history import (airline_history, airport_history, all_ranks, distance_row, great_circle_miles, rank_history,
                                  weighted_median)
from tests.helpers import _insert, add_airports, add_overrides, add_segments

US = 34


def _year(year, airport, pax, freight=0, wac=US):
    return dict(year=year, airport=airport, city_name=None, wac=wac, deps=1, arrs=1, seats_out=0, seats_in=0,
                passengers_out=pax, passengers_in=0, freight_out=freight, freight_in=0)


def _pair(airline_id, pax, freight=0, year=2025, origin="AAA", dest="BBB", group="g"):
    return dict(group_id=group, airline_id=airline_id, year=year, origin=origin, dest=dest, deps=1, seats=0, passengers=pax,
                freight=freight, first_month=1, last_month=12, domestic_deps=1)


def _route(origin, dest, pax, freight=0, deps=30, year=2025):
    return dict(year=year, origin=origin, dest=dest, deps=deps, domestic_deps=deps, seats=0, passengers=pax, freight=freight)


def _scheduled_routes(db_path, routes):
    """Routes, and segments saying all their flights were scheduled (class F)."""
    _insert(db_path, "route_year_totals", routes)
    add_segments(db_path, "t100_domestic", [dict(year=r["year"], month=1, origin=r["origin"], dest=r["dest"], departures_performed=r["deps"],
                                                 passengers=0, freight=0, **{"class": "F"}) for r in routes])


@pytest.fixture
def conn(db_path):
    c = sqlite3.connect(db_path)
    yield c
    c.close()


# ranks


def test_all_ranks_cover_every_year_and_both_measures(db_path, conn):
    _insert(db_path, "airport_dir_year", [_year(1990, "AAA", 10, 1), _year(1990, "BBB", 20, 5), _year(1991, "AAA", 30, 1),
                                          _year(1991, "BBB", 20, 0), _year(1991, "FOR", 99, 99, wac=500)])
    ranks = all_ranks(conn, 1990, 1991)
    assert ranks[("passengers", 1990)] == {"BBB": 1, "AAA": 2}
    assert ranks[("passengers", 1991)] == {"AAA": 1, "BBB": 2}   # abroad isn't ranked
    assert ranks[("freight", 1991)] == {"AAA": 1}   # no freight, no freight rank


def test_rank_history_is_a_rank_or_none_for_each_year(db_path, conn):
    _insert(db_path, "airport_dir_year", [_year(1990, "AAA", 10), _year(1990, "BBB", 20), _year(1992, "AAA", 30)])
    ranks = all_ranks(conn, 1990, 1992)
    assert rank_history(ranks, "AAA", "passengers", 1990, 1992) == [(1990, 2), (1991, None), (1992, 1)]


# airlines: unmerged, by airline_id


def _names(db_path, *names):
    _insert(db_path, "carrier_group", [dict(airline_id=a, group_id="g", group_name="G", airline_name=n) for a, n in names])


def test_top_four_over_all_years_then_the_others(db_path, conn):
    _names(db_path, ("1", "Alpha Air Lines Inc."), ("2", "Beta Airways"), ("3", "Gamma Air"), ("4", "Delta Air Lines Inc."),
           ("5", "Epsilon Air"), ("6", "Zeta Air"))
    _insert(db_path, "carrier_pair_year", [
        # 1990: 1 and 5 big; 2025: 2, 3, 4 and 6
        _pair("1", 500, year=1990), _pair("5", 400, year=1990), _pair("6", 100, year=1990),
        _pair("2", 300), _pair("3", 300), _pair("4", 250, origin="BBB", dest="AAA"), _pair("6", 150),
        _pair("9", 999, origin="BBB", dest="CCC"),   # not at AAA
    ])
    h = airline_history(conn, "AAA", "passengers", 1990, 2025)
    assert [line.name for line in h.lines] == ["Alpha Air Lines", "Epsilon Air", "Beta Airways", "Gamma Air"]   # over 1990-2025
    alpha = h.lines[0]
    assert alpha.shares[1990] == pytest.approx(0.5) and alpha.shares[2025] == 0 and alpha.last_share == 0
    assert 2000 not in alpha.shares   # no traffic at all that year: no point
    assert h.others_count == 2   # Delta and Zeta: six airlines seen, less the four
    assert h.others.shares[1990] == pytest.approx(0.1)
    assert h.others.last_share == pytest.approx(400 / 1000)


def test_airlines_by_freight_from_a_first_year(db_path, conn):
    _names(db_path, ("1", "Parcel Air"), ("2", "Box Air"))
    _insert(db_path, "carrier_pair_year", [_pair("1", 0, freight=900, year=1990), _pair("2", 0, freight=100, year=2003),
                                           _pair("1", 50, freight=100, year=2003)])
    h = airline_history(conn, "AAA", "freight", 2003, 2025)
    assert [line.name for line in h.lines] == ["Parcel Air", "Box Air"]   # 2003 on: 1990's 900 doesn't count
    assert h.lines[1].shares == {2003: pytest.approx(0.5)} and h.lines[1].last_share is None
    assert h.others is None and h.others_count == 0


def test_an_airline_doing_business_as_another_goes_by_its_own_name(db_path, conn):
    _names(db_path, ("1", "Sun Country Airlines d/b/a MN Airlines"))
    _insert(db_path, "carrier_pair_year", [_pair("1", 10)])
    assert airline_history(conn, "AAA", "passengers", 1990, 2025).lines[0].name == "Sun Country Airlines"


def test_an_airline_without_a_group_name_falls_back_to_its_carrier_name(db_path, conn):
    _insert(db_path, "carriers", [dict(airline_id="7", name="Westair Airlines Inc.")])
    _insert(db_path, "carrier_pair_year", [_pair("7", 10), _pair("8", 10)])
    assert {line.name for line in airline_history(conn, "AAA", "passengers", 1990, 2025).lines} == {"Westair Airlines", "8"}


# distances


def test_great_circle_miles():
    assert great_circle_miles(0, 0, 0, 1) == pytest.approx(69.09, abs=0.01)
    assert great_circle_miles(37.62, -122.38, 40.64, -73.78) == pytest.approx(2580, abs=2)   # SFO-JFK; BTS has 2,586


def test_weighted_median_is_where_half_the_weight_is_reached():
    assert weighted_median([(100, 1), (200, 1), (900, 3)]) == 900
    assert weighted_median([(100, 3), (200, 1), (900, 1)]) == 100
    assert weighted_median([(100, 1), (200, 1)]) == 100
    assert weighted_median([]) is None


def _places(db_path):
    """Along the equator: BBB 1 degree east of AAA (69 miles), CCC 10, DDD 100, ABR 50 (abroad); NOC has no coordinates."""
    add_overrides(db_path, [dict(code="AAA", name="Alpha", city="", country="United States", latitude=0, longitude=0)])
    add_airports(db_path, [dict(iata_code=c, name=f"{c} Field", city="", country=country, latitude=0, longitude=lon)
                           for c, lon, country in (("AAA", 50, "United States"), ("BBB", 1, "United States"),
                                                   ("CCC", 10, "United States"), ("DDD", 100, "United States"),
                                                   ("ABR", 50, "Freedonia"))])
    _insert(db_path, "airport_names", [dict(code="BBB", name="Bville, BB"), dict(code="DDD", name="Dville, DD")])
    _insert(db_path, "airport_dir_year", [_year(2025, "ABR", 1, wac=500)])


def test_distance_ends_need_24_flights_and_the_median_weighs_the_load(db_path, conn):
    _places(db_path)
    _scheduled_routes(db_path, [
        _route("AAA", "BBB", 10, deps=12), _route("BBB", "AAA", 10, deps=12),   # 24 both ways: the shortest
        _route("AAA", "CCC", 100, deps=23),   # 23 flights: not an end, but counted in the median
        _route("AAA", "DDD", 5, deps=20),   # further, but too few flights to be the longest
        _route("ABR", "AAA", 1, deps=40),   # the longest, and abroad
        _route("AAA", "NOC", 1000, deps=99),   # no coordinates: left out
        _route("AAA", "DDD", 999, deps=99, year=2024),
    ])
    row = distance_row(conn, "AAA", "passengers", 2025)
    assert (row.shortest.code, row.shortest.label, round(row.shortest.miles)) == ("BBB", "Bville, BB", 69)
    assert (row.longest.code, row.longest.label, round(row.longest.miles)) == ("ABR", "ABR Field, Freedonia", 3455)
    assert round(row.median) == 691   # CCC: 100 of 126 passengers


def test_distance_row_by_freight_ignores_routes_without_freight(db_path, conn):
    _places(db_path)
    _scheduled_routes(db_path, [_route("AAA", "BBB", 100, freight=0), _route("AAA", "DDD", 0, freight=50)])
    row = distance_row(conn, "AAA", "freight", 2025)
    assert row.shortest.code == row.longest.code == "DDD"
    assert row.longest.label == "Dville, DD"


def test_a_year_without_routes_has_an_empty_row(db_path, conn):
    _places(db_path)
    row = distance_row(conn, "AAA", "passengers", 1990)
    assert row.shortest is None and row.longest is None and row.median is None


def _segment(origin, dest, cls, deps, year=2025, month=1):
    return dict(year=year, month=month, origin=origin, dest=dest, departures_performed=deps, passengers=0, freight=0,
                **{"class": cls})


def test_an_end_needs_24_scheduled_flights(db_path, conn):
    """DFW-DAL in 2025: 31 flights, 26 of them non-scheduled (class L) and empty."""
    _places(db_path)
    _insert(db_path, "route_year_totals", [_route("AAA", "BBB", 10, deps=31), _route("AAA", "CCC", 10, deps=30),
                                           _route("AAA", "DDD", 10, deps=30)])
    add_segments(db_path, "t100_domestic", [
        _segment("AAA", "BBB", "F", 5), _segment("BBB", "AAA", "L", 26),   # 5 scheduled: not an end
        _segment("AAA", "CCC", "F", 20), _segment("CCC", "AAA", "F", 4, month=2),   # 24 both ways, over two months
        _segment("AAA", "DDD", "F", 30), _segment("AAA", "DDD", "G", 0)])
    row = distance_row(conn, "AAA", "passengers", 2025)
    assert row.shortest.code == "CCC" and row.longest.code == "DDD"
    assert round(row.median) == 691   # every route's passengers still count in the median


def test_scheduled_flights_abroad_count_too(db_path, conn):
    _places(db_path)
    _insert(db_path, "route_year_totals", [_route("AAA", "BBB", 10, deps=30), _route("ABR", "AAA", 10, deps=30)])
    add_segments(db_path, "t100_domestic", [_segment("AAA", "BBB", "F", 30)])
    add_segments(db_path, "t100_international", [_segment("ABR", "AAA", "F", 30)])
    assert distance_row(conn, "AAA", "passengers", 2025).longest.code == "ABR"


def test_a_freight_end_counts_scheduled_cargo_flights(db_path, conn):
    _places(db_path)
    _insert(db_path, "route_year_totals", [_route("AAA", "BBB", 0, freight=50, deps=30), _route("AAA", "DDD", 0, freight=50, deps=30)])
    add_segments(db_path, "t100_domestic", [_segment("AAA", "BBB", "G", 30), _segment("AAA", "DDD", "P", 30),
                                            _segment("AAA", "CCC", "L", 30)])
    _insert(db_path, "route_year_totals", [_route("AAA", "CCC", 0, freight=50, deps=30)])
    row = distance_row(conn, "AAA", "freight", 2025)
    # P, non-scheduled all-cargo, counts: Amazon's and DHL's networks are filed as P. L, passenger charters, doesn't
    assert (row.shortest.code, row.longest.code) == ("BBB", "DDD")


def test_a_passenger_end_doesnt_count_cargo_flights(db_path, conn):
    _places(db_path)
    _insert(db_path, "route_year_totals", [_route("AAA", "BBB", 10, deps=30)])
    add_segments(db_path, "t100_domestic", [_segment("AAA", "BBB", "G", 30)])
    assert distance_row(conn, "AAA", "passengers", 2025).shortest is None


def test_a_known_bad_route_is_left_out_entirely(db_path, conn, monkeypatch):
    import scripts.book.history as history
    monkeypatch.setattr(history, "BAD_ROUTES", {frozenset(("AAA", "DDD"))})
    _places(db_path)
    _scheduled_routes(db_path, [_route("AAA", "CCC", 10), _route("DDD", "AAA", 1000, deps=40)])
    row = distance_row(conn, "AAA", "passengers", 2025)
    assert row.longest.code == "CCC" and round(row.median) == 691   # DDD's passengers aren't in the median either


def test_sju_tumut_is_a_known_bad_route():
    from scripts.book.history import BAD_ROUTES
    assert frozenset(("SJU", "TUM")) in BAD_ROUTES


# one airport's history, as its page draws it


def _entry(code="AAA", passengers=True, freight=False):
    from scripts.book.data import BookAirport
    return BookAirport(code, 1 if passengers else None, 1 if freight else None, passengers, freight)


def test_history_draws_the_page_measure_first_and_the_other_only_when_in_the_book(db_path, conn):
    _insert(db_path, "airport_dir_year", [_year(1990, "AAA", 10, 5), _year(2025, "AAA", 10, 5)])
    ranks = all_ranks(conn, 1990, 2025)
    assert list(airport_history(conn, _entry(), ranks, 1990, 2025).ranks) == ["passengers"]
    both = airport_history(conn, _entry(freight=True), ranks, 1990, 2025).ranks
    assert list(both) == ["passengers", "freight"]
    assert list(airport_history(conn, _entry(passengers=False, freight=True), ranks, 1990, 2025).ranks) == ["freight"]


def test_freight_history_starts_in_2003(db_path, conn):
    _insert(db_path, "airport_dir_year", [_year(1990, "AAA", 0, 5), _year(2025, "AAA", 0, 5)])
    ranks = all_ranks(conn, 1990, 2025)
    h = airport_history(conn, _entry(passengers=False, freight=True), ranks, 1990, 2025)
    assert h.ranks["freight"][0] == (2003, None) and h.ranks["freight"][-1] == (2025, 1)
    assert [r.year for r in h.distances] == [2003, 2025]
    p = airport_history(conn, _entry(freight=True), ranks, 1990, 2025)
    assert p.ranks["passengers"][0][0] == 1990 and p.ranks["freight"][0][0] == 2003
    assert [r.year for r in p.distances] == [1990, 2025]


def test_a_flight_back_to_its_own_airport_is_no_end(db_path, conn):
    _places(db_path)
    _scheduled_routes(db_path, [_route("AAA", "AAA", 100, deps=40), _route("AAA", "CCC", 10)])
    row = distance_row(conn, "AAA", "passengers", 2025)
    assert row.shortest.code == "CCC" and round(row.median) == 691
