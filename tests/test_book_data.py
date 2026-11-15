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


def build_world(db_path):
    """A small world of airports and routes for the book's tests; also used by test_book_cli."""
    _insert(db_path, "airport_dir_year", [
        # 2025: BBB and CCC tie on passengers; FFF is freight-only; NEW has no 1990; FOR is abroad
        _year(2025, "AAA", 600, 60, pax_in=400, freight_in=40), _year(2025, "BBB", 800, 50), _year(2025, "CCC", 800, 10),
        _year(2025, "FFF", 5, 5000), _year(2025, "NEW", 300, 0), _year(2025, "FOR", 99999, 99999, wac=500),
        _year(1990, "AAA", 500, 40), _year(1990, "BBB", 600, 30), _year(1990, "CCC", 100, 1), _year(1990, "FFF", 0, 2000),
        _year(2020, "AAA", 200, 80), _year(2020, "NEW", 100, 0),
        _year(2025, "TNY", 5, 0), _year(2025, "FR2", 999, 0, wac=500),   # in AAA's market, but under 1% of AAA's passengers
    ])
    _insert(db_path, "route_year_totals", [
        _route("AAA", "BBB", 100, deps=12), _route("BBB", "AAA", 50, deps=12),
        _route("AAA", "CCC", 120, deps=23),
        _route("AAA", "FFF", 10, freight=900),
        _route("AAA", "NEW", 90), _route("AAA", "XXX", 80), _route("AAA", "YYY", 70),
        _route("AAA", "FOR", 60, deps=30, domestic_deps=0),
        _route("AAA", "TNY", 65, deps=2, domestic_deps=1),   # a domestic route with an international flight on it
        _route("FFF", "CCC", 50, freight=100),
        _route("FFF", "FOR", 0, freight=300, domestic_deps=0), _route("FFF", "FR2", 40, freight=0, domestic_deps=0),
        _route("BBB", "FR2", 0, freight=0, domestic_deps=0),
    ])
    _insert(db_path, "pair_distance", [dict(a="AAA", b="BBB", distance=500), dict(a="FOR", b="AAA", distance=4000)])
    _insert(db_path, "airport_names", [dict(code=c, name=f"{c.title()}ville, {c[:2]}") for c in ("AAA", "BBB", "CCC", "FFF", "NEW", "YYY")])
    _insert(db_path, "airport_market", [dict(code="AAA", market_id="M1"), dict(code="NEW", market_id="M1"), dict(code="TNY", market_id="M1"), dict(code="BBB", market_id="M2")])
    _insert(db_path, "market_name", [dict(market_id="M1", name="Aaaville area"), dict(market_id="M2", name="Bbbville area")])
    add_overrides(db_path, [dict(code="AAA", name="Alpha International", city="Aaaville", country="United States", latitude=0, longitude=0)])
    add_airports(db_path, [dict(iata_code=c, name=n, city="", country="Freedonia" if c == "FOR" else "United States", latitude=0, longitude=0)
                           for c, n in (("AAA", "Old Alpha"), ("BBB", "Bravo Field"), ("CCC", "Charlie Airport"),
                                        ("FFF", "Freight Field"), ("NEW", "New Airport"), ("FOR", "Foreign Airport"))])
    _insert(db_path, "airport_carrier_dir_year", [
        _carrier("G1", "Delta Air Lines Inc.", 600), _carrier("G2", "Southwest Airlines Co. (incl. AirTran)", 300),
        _carrier("G3", "Foo Airways", 100, domestic=0), _carrier("G4", "Cargo Co.", 0, freight=100),
        # FFF, a freight airport: its airlines rank by freight
        _carrier("G5", "Parcel Air Inc.", 0, freight=3000, airport="FFF"), _carrier("G6", "Box Lines", 0, freight=1500, domestic=0, airport="FFF"),
        _carrier("G1", "Delta Air Lines Inc.", 5, freight=500, airport="FFF"),
    ])


@pytest.fixture
def conn(db_path):
    build_world(db_path)
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
    totals = {s.year: (s.passengers, s.freight_lb) for s in f.series}
    assert totals[1990] == (500, 40) and totals[2025] == (1000, 100) and totals[2020] == (200, 80)
    assert (f.passenger_rank_first, f.passenger_rank_last) == (2, 1)
    assert (f.freight_rank_first, f.freight_rank_last) == (2, 2)
    assert f.name == "Alpha International" and f.place == "Aaaville, AA"


def test_facts_for_an_airport_with_no_first_year(conn):
    f = _facts(conn, "NEW")
    assert f.passenger_rank_first is None and f.freight_rank_first is None
    assert f.series[0].year == 2020


def test_destinations_add_both_directions(conn):
    f = _facts(conn, "AAA")
    assert f.measure == "passengers"
    assert [d.code for d in f.destinations] == ["BBB", "CCC", "NEW", "XXX", "YYY"]   # TNY (65) and FOR (60) are 6th and 7th
    assert f.destinations[0].passengers == 150


def test_freight_only_airport_ranks_destinations_by_freight(conn):
    f = _facts(conn, "FFF", top=2)   # FFF is 5th by passengers, so out of a top 2
    assert f.measure == "freight"
    assert [d.code for d in f.destinations] == ["AAA", "FOR", "CCC"]   # not FR2: no freight
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
    assert f.market == "Aaaville area" and f.market_airports == ["NEW"]   # not TNY: under 1% of AAA's passengers
    b = _facts(conn, "BBB")
    assert b.market is None and b.market_airports == []


def test_top_airlines_shares(conn):
    f = _facts(conn, "AAA")
    assert f.airline_groups == 4
    assert [name for name, _ in f.top_airlines] == ["Delta Air Lines", "Southwest Airlines", "Foo Airways"]
    assert [share for _, share in f.top_airlines] == pytest.approx([0.6, 0.3, 0.1])
    assert f.other_airlines_share is None   # no fifth airline with passengers


def test_top_four_airlines_then_the_others(db_path):
    build_world(db_path)
    _insert(db_path, "airport_carrier_dir_year", [_carrier("G7", "Extra One", 50), _carrier("G8", "Extra Two", 50)])
    f = _facts(sqlite3.connect(db_path), "AAA")
    assert [name for name, _ in f.top_airlines] == ["Delta Air Lines", "Southwest Airlines", "Foo Airways", "Extra One"]
    assert f.other_airlines_share == pytest.approx(50 / 1100)


def test_destinations_abroad_carry_their_country(conn):
    assert all(d.country is None for d in _facts(conn, "AAA").destinations)   # all in the US
    fff = {d.code: d.country for d in _facts(conn, "FFF", top=2).destinations}
    assert fff["FOR"] == "Freedonia" and fff["AAA"] is None



def test_freight_airport_figures_are_in_freight(conn):
    f = _facts(conn, "FFF", top=2)
    assert f.measure == "freight"
    assert [name for name, _ in f.top_airlines] == ["Parcel Air", "Box Lines", "Delta Air Lines"]
    assert [share for _, share in f.top_airlines] == pytest.approx([0.6, 0.3, 0.1])


def test_freight_airport_market_floor_is_in_freight(db_path):
    build_world(db_path)
    _insert(db_path, "airport_dir_year", [_year(2025, "FCO", 9000, 40), _year(2025, "FC2", 1, 60)])
    _insert(db_path, "airport_market", [dict(code="FFF", market_id="M3"), dict(code="FCO", market_id="M3"), dict(code="FC2", market_id="M3")])
    _insert(db_path, "market_name", [dict(market_id="M3", name="Fffville area")])
    c = sqlite3.connect(db_path)
    f = _facts(c, "FFF", top=2)
    assert f.market_airports == ["FC2"]   # 60 lb is over 1% of FFF's 5,000; FCO's 40 isn't, whatever its passengers
