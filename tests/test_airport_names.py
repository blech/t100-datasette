import sqlite3

from build_database import rebuild_airport_names, rebuild_derived_tables
from tests.helpers import add_airports, add_overrides, add_segments, get_json
from tests.test_routes_by_year import seg


def named(origin, dest, year, origin_name=None, dest_name=None, n=1):
    row = seg(origin, dest, year, 12, 100)
    row.update(origin_city_name=origin_name, dest_city_name=dest_name)
    return [dict(row) for _ in range(n)]


def names(db_path):
    conn = sqlite3.connect(db_path)
    rebuild_airport_names(conn)
    got = dict(conn.execute("SELECT code, name FROM airport_names"))
    conn.close()
    return got


def test_the_most_recent_year_wins(db_path):
    add_segments(db_path, "t100_domestic", named("RDU", "ATL", 2019, "Raleigh-Durham, NC", "Atlanta, GA") + named("RDU", "ATL", 2025, "Raleigh/Durham, NC", "Atlanta, GA"))
    assert names(db_path)["RDU"] == "Raleigh/Durham, NC"


def test_origin_and_destination_columns_both_name_airports(db_path):
    add_segments(db_path, "t100_international", named("JFK", "TLV", 2025, "New York, NY", "Tel Aviv, Israel"))
    got = names(db_path)
    assert got["JFK"] == "New York, NY" and got["TLV"] == "Tel Aviv, Israel"


def test_literal_NULL_is_ignored_even_when_it_is_the_newest(db_path):
    add_segments(db_path, "t100_international", named("JFK", "DOH", 2022, "New York, NY", "Doha, Qatar") + named("JFK", "DOH", 2023, "New York, NY", "NULL"))
    assert names(db_path)["DOH"] == "Doha, Qatar"


def test_an_airport_with_only_NULL_names_gets_no_entry(db_path):
    add_segments(db_path, "t100_international", named("JFK", "DOH", 2023, "New York, NY", "NULL"))
    assert "DOH" not in names(db_path)


def test_names_are_trimmed_and_commas_are_kept(db_path):
    add_segments(db_path, "t100_international", named("JFK", "UBN", 2025, "New York, NY", " Tosontsengel, Mongolia") + named("JFK", "BON", 2025, "New York, NY", "Bonaire, Bonaire, Sint Eustatius, and Saba"))
    got = names(db_path)
    assert got["UBN"] == "Tosontsengel, Mongolia"
    assert got["BON"] == "Bonaire, Bonaire, Sint Eustatius, and Saba"


def test_within_a_year_the_commonest_name_wins(db_path):
    add_segments(db_path, "t100_domestic", named("AAA", "BBB", 2025, "Old Name, NY", "B, NY", n=1) + named("AAA", "BBB", 2025, "New Name, NY", "B, NY", n=3))
    assert names(db_path)["AAA"] == "New Name, NY"


def test_rebuilding_replaces_rather_than_adds(db_path):
    add_segments(db_path, "t100_domestic", named("AAA", "BBB", 2025, "A, NY", "B, NY"))
    conn = sqlite3.connect(db_path)
    assert rebuild_airport_names(conn) == 2
    assert rebuild_airport_names(conn) == 2
    conn.close()


def test_rebuild_derived_tables_fills_both_derived_tables(db_path):
    add_segments(db_path, "t100_domestic", named("AAA", "BBB", 2025, "A, NY", "B, NY"))
    conn = sqlite3.connect(db_path)
    rebuild_derived_tables(conn)
    assert conn.execute("SELECT COUNT(*) FROM airport_names").fetchone()[0] == 2
    assert conn.execute("SELECT COUNT(*) FROM airport_year_totals").fetchone()[0] >= 1
    conn.close()


ATL = dict(iata_code="ATL", name="Hartsfield Jackson Atlanta International Airport", city="Atlanta", country="United States", latitude=33.6, longitude=-84.4)
RDU = dict(iata_code="RDU", name="Raleigh Durham International Airport", city="Raleigh-durham", country="United States", latitude=35.8, longitude=-78.8)


def test_airports_query_gives_the_bts_name_as_place_and_falls_back_to_city_and_country(ds, db_path):
    add_airports(db_path, [ATL, RDU])
    add_segments(db_path, "t100_domestic", named("RDU", "SEA", 2025, "Raleigh/Durham, NC", "Seattle, WA"))
    conn = sqlite3.connect(db_path)
    rebuild_airport_names(conn)
    conn.close()
    got = {r["code"]: r for r in get_json(ds, "/t100/airports.json?_shape=objects")["rows"]}
    assert got["RDU"]["place"] == "Raleigh/Durham, NC"
    assert got["ATL"]["place"] == "Atlanta, United States"   # not in the segment data: OpenFlights fallback
    assert got["RDU"]["city"] == "Raleigh-durham"            # raw columns are unchanged


def test_override_airports_get_a_place_too(ds, db_path):
    add_overrides(db_path, [dict(code="SEL", name="Seoul (all airports)", city="Seoul", country="South Korea", latitude=37.5, longitude=127.0)])
    add_segments(db_path, "t100_international", named("JFK", "SEL", 2000, "New York, NY", "Seoul, South Korea"))
    conn = sqlite3.connect(db_path)
    rebuild_airport_names(conn)
    conn.close()
    got = {r["code"]: r for r in get_json(ds, "/t100/airports.json?_shape=objects")["rows"]}
    assert got["SEL"]["place"] == "Seoul, South Korea"
