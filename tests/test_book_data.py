import sqlite3

import pytest

from scripts.book.data import BookAirport, airport_facts, book_airports, ranks
from tests.helpers import _insert, add_airports, add_overrides

US = 34


def _year(year, airport, pax, freight, wac=US, pax_in=0, freight_in=0):
    return dict(year=year, airport=airport, city_name=None, wac=wac, deps=1, arrs=1, seats_out=0, seats_in=0,
                passengers_out=pax, passengers_in=pax_in, freight_out=freight, freight_in=freight_in)


def _route(origin, dest, pax, freight=0, deps=1, domestic_deps=None, year=2025):
    return dict(year=year, origin=origin, dest=dest, deps=deps, domestic_deps=deps if domestic_deps is None else domestic_deps,
                seats=0, passengers=pax, freight=freight)


def _carrier(group_id, group_name, pax, freight=0, domestic=1, airport="AAA", year=2025):
    return dict(year=year, airport=airport, wac=US, group_id=group_id, group_name=group_name, domestic=domestic, service_class="F",
                deps=1, arrs=1, seats_out=0, seats_in=0, passengers_out=pax, passengers_in=0, freight_out=freight, freight_in=0)


@pytest.fixture
def conn(db_path):
    _insert(db_path, "airport_dir_year", [
        # 2025: BBB and CCC tie on passengers; FFF is freight-only; NEW has no 1990; FOR is abroad
        _year(2025, "AAA", 600, 60, pax_in=400, freight_in=40), _year(2025, "BBB", 800, 50), _year(2025, "CCC", 800, 10),
        _year(2025, "FFF", 5, 5000), _year(2025, "NEW", 300, 0), _year(2025, "FOR", 99999, 99999, wac=500),
        _year(1990, "AAA", 500, 40), _year(1990, "BBB", 600, 30), _year(1990, "CCC", 100, 1), _year(1990, "FFF", 0, 2000),
        _year(2020, "AAA", 200, 80), _year(2020, "NEW", 100, 0),
    ])
    _insert(db_path, "route_year_totals", [
        _route("AAA", "BBB", 100, deps=12), _route("BBB", "AAA", 50, deps=12),
        _route("AAA", "CCC", 120, deps=23),
        _route("AAA", "FFF", 10, freight=900),
        _route("AAA", "NEW", 90), _route("AAA", "XXX", 80), _route("AAA", "YYY", 70),
        _route("AAA", "FOR", 60, deps=30, domestic_deps=0),
        _route("FFF", "CCC", 50, freight=100),
    ])
    _insert(db_path, "pair_distance", [dict(a="AAA", b="BBB", distance=500), dict(a="FOR", b="AAA", distance=4000)])
    _insert(db_path, "airport_names", [dict(code=c, name=f"{c.title()}ville, {c[:2]}") for c in ("AAA", "BBB", "CCC", "FFF", "NEW", "YYY")])
    _insert(db_path, "airport_market", [dict(code="AAA", market_id="M1"), dict(code="NEW", market_id="M1"), dict(code="BBB", market_id="M2")])
    _insert(db_path, "market_name", [dict(market_id="M1", name="Aaaville area"), dict(market_id="M2", name="Bbbville area")])
    add_overrides(db_path, [dict(code="AAA", name="Alpha International", city="Aaaville", country="United States", latitude=0, longitude=0)])
    add_airports(db_path, [dict(iata_code=c, name=n, city="", country="United States", latitude=0, longitude=0)
                           for c, n in (("AAA", "Old Alpha"), ("BBB", "Bravo Field"), ("CCC", "Charlie Airport"),
                                        ("FFF", "Freight Field"), ("NEW", "New Airport"), ("FOR", "Foreign Airport"))])
    _insert(db_path, "airport_carrier_dir_year", [
        _carrier("G1", "Delta Air Lines Inc.", 600), _carrier("G2", "Southwest Airlines Co. (incl. AirTran)", 300),
        _carrier("G3", "Foo Airways", 100, domestic=0), _carrier("G4", "Cargo Co.", 0, freight=100),
    ])
    c = sqlite3.connect(db_path)
    c.row_factory = sqlite3.Row
    yield c
    c.close()


def _facts(conn, code, top=50):
    entry = next(e for e in book_airports(conn, 2025, top, top) if e.code == code)
    return airport_facts(conn, entry, 1990, 2025)


def test_ranks_order_by_total_then_code(conn):
    r = ranks(conn, 2025, "passengers")
    assert r["AAA"] == 1 and r["BBB"] == 2 and r["CCC"] == 3
    assert "FOR" not in r
    assert ranks(conn, 2025, "freight")["FFF"] == 1


def test_book_airports_union_and_order(conn):
    entries = book_airports(conn, 2025, 2, 2)
    assert [e.code for e in entries] == ["AAA", "BBB", "FFF"]
    assert entries[0] == BookAirport("AAA", 1, 2, True, True)
    assert entries[1].in_passengers and not entries[1].in_freight
    assert entries[2] == BookAirport("FFF", 5, 1, False, True)


def test_facts_totals_and_ranks(conn):
    f = _facts(conn, "AAA")
    assert (f.passengers_first, f.passengers_last) == (500, 1000)
    assert (f.freight_first_lb, f.freight_last_lb) == (40, 100)
    assert (f.passenger_rank_first, f.passenger_rank_last) == (2, 1)
    assert (f.freight_rank_first, f.freight_rank_last) == (2, 2)
    assert f.name == "Alpha International" and f.place == "Aaaville, AA"
    assert f.passengers_2020 == 200


def test_facts_for_an_airport_with_no_first_year(conn):
    f = _facts(conn, "NEW")
    assert f.passengers_first is None and f.freight_first_lb is None and f.passenger_rank_first is None
    assert f.series[0].year == 2020


def test_destinations_add_both_directions(conn):
    f = _facts(conn, "AAA")
    assert f.destinations_by == "passengers"
    assert [d.code for d in f.destinations] == ["BBB", "CCC", "NEW", "XXX", "YYY"]
    assert f.destinations[0].passengers == 150


def test_freight_only_airport_ranks_destinations_by_freight(conn):
    f = _facts(conn, "FFF", top=2)   # FFF is 5th by passengers, so out of a top 2
    assert f.destinations_by == "freight"
    assert [d.code for d in f.destinations] == ["AAA", "CCC"]
    assert f.destinations[0].freight_lb == 900


def test_destination_without_a_name_falls_back(conn):
    labels = {d.code: d.label for d in _facts(conn, "AAA").destinations}
    assert labels["BBB"] == "Bravo Field"
    assert labels["YYY"] == "Yyyville, YY"
    assert labels["XXX"] == "XXX"


def test_places_need_24_flights_both_ways(conn):
    assert _facts(conn, "AAA").places == 2   # BBB (12 + 12) and FOR (30); not CCC (23)


def test_market_only_when_shared(conn):
    f = _facts(conn, "AAA")
    assert f.market == "Aaaville area" and f.market_airports == ["NEW"]
    b = _facts(conn, "BBB")
    assert b.market is None and b.market_airports == []


def test_top_airlines_shares_and_international_share(conn):
    f = _facts(conn, "AAA")
    assert f.airline_groups == 4
    assert [name for name, _ in f.top_airlines] == ["Delta Air Lines", "Southwest Airlines", "Foo Airways"]
    assert [share for _, share in f.top_airlines] == pytest.approx([0.6, 0.3, 0.1])
    assert f.international_share == pytest.approx(0.1)
    assert f.busiest_international.code == "FOR"


def test_longest_route_either_order(conn):
    assert _facts(conn, "AAA").longest_route == ("FOR", 4000)


def test_peak_year(conn):
    f = _facts(conn, "AAA")
    assert (f.peak_year, f.peak_passengers) == (2025, 1000)
