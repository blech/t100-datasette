import sqlite3

from build_database import rebuild_derived_tables, rebuild_search_index
from tests.helpers import add_airports, put_airport_years
from tests.test_rollup_pages import aircraft_fixtures
from tests.test_rollup_queries import put


def index(db_path):
    conn = sqlite3.connect(db_path)
    rebuild_search_index(conn)
    rows = {(r[0], r[1]): dict(zip(("label", "hint", "terms", "code", "rank"), r[2:]))
            for r in conn.execute("SELECT kind, href, label, hint, terms, code, rank FROM search_index")}
    conn.close()
    return rows


def airport_year(code, city, deps, arrs=0, year=2019):
    return dict(year=year, origin=code, origin_city_name=city, origin_wac=1, deps=deps, arrs=arrs)


def test_a_foreign_airport_is_indexed_by_code_city_and_country(db_path):
    put_airport_years(db_path, [airport_year("LHR", "London, United Kingdom", 70)])
    put(db_path, "airport_names", [dict(code="LHR", name="London, United Kingdom")])
    row = index(db_path)[("airport", "/airports/LHR")]
    assert row["code"] == "LHR" and row["label"] == "LHR" and row["rank"] == 70
    assert {"lhr", "london", "kingdom"} <= set(row["terms"].split())
    assert row["hint"].endswith("2019–2019")


def test_an_airport_with_only_a_code_is_still_indexed(db_path):
    put_airport_years(db_path, [airport_year("ZZZ", None, 3)])
    row = index(db_path)[("airport", "/airports/ZZZ")]
    assert "zzz" in row["terms"].split() and row["hint"] == "2019–2019"


def test_icao_code_name_and_country_come_from_openflights(db_path):
    put_airport_years(db_path, [airport_year("KEF", "Reykjavik, Iceland", 9)])
    add_airports(db_path, [dict(iata_code="KEF", icao_code="BIKF", name="Keflavik International Airport", city="Keflavik", country="Iceland")])
    terms = set(index(db_path)[("airport", "/airports/KEF")]["terms"].split())
    assert {"bikf", "keflavik", "international", "iceland"} <= terms


def test_airlines_and_their_merged_members_both_appear(db_path):
    put(db_path, "carrier_group_year", [dict(year=y, airline_id=a, group_id="delta", group_name="Delta (incl. Northwest)", domestic=1,
                                             service_class="F", deps=d, seats=0, passengers=0, freight=0)
                                        for y, a, d in ((2019, "19790", 4), (1999, "19805", 2))])
    put(db_path, "carrier_group", [dict(airline_id="19790", group_id="delta", group_name="Delta (incl. Northwest)", airline_name="Delta Air Lines"),
                                   dict(airline_id="19805", group_id="delta", group_name="Delta (incl. Northwest)", airline_name="Northwest Airlines")])
    put(db_path, "carriers", [dict(airline_id="19790", carrier="DL", unique_carrier="DL", name="Delta Air Lines Inc.")])
    rows = index(db_path)
    assert rows[("airline", "/airlines/delta")]["rank"] == 6
    assert "northwest" in rows[("airline", "/airlines/19805")]["terms"].split()
    assert rows[("airline", "/airlines/19790")]["code"] == "DL"
    assert "dl" in rows[("airline", "/airlines/19790")]["terms"].split()


def test_aircraft_families_and_types_are_indexed_once_each(db_path):
    aircraft_fixtures(db_path)
    rows = index(db_path)
    assert ("aircraft", "/aircraft/boeing-737") in rows and ("aircraft", "/aircraft/boeing-737/boeing-737-800") in rows
    assert rows[("aircraft", "/aircraft/boeing-737")]["hint"].startswith("Family")


def test_a_type_named_as_its_family_is_indexed_once_as_the_family(db_path):
    put(db_path, "aircraft_types", [dict(ac_typeid="717", ac_group="6", name="Boeing 717", maker="Boeing")])
    put(db_path, "aircraft_family", [dict(aircraft_type="717", name="Boeing 717", family="Boeing 717", subfamily="717", aircraft_class="Narrowbody jet", fallback=0)])
    put(db_path, "type_year", [dict(year=2019, aircraft_type="717", domestic=1, service_class="F", deps=5, seats=0, passengers=0, freight=0)])
    assert [h for k, h in index(db_path) if k == "aircraft"] == ["/aircraft/boeing-717"]


def test_aircraft_short_name_and_maker_are_searchable(db_path):
    aircraft_fixtures(db_path)
    conn = sqlite3.connect(db_path)
    conn.execute("UPDATE aircraft_types SET short_name = 'B737-8' WHERE ac_typeid = '614'")
    conn.commit()
    conn.close()
    row = index(db_path)[("aircraft", "/aircraft/boeing-737/boeing-737-800")]
    assert {"b737-8", "boeing"} <= set(row["terms"].split()) and row["code"] == "B737-8"


def test_a_type_never_flown_is_not_indexed(db_path):
    aircraft_fixtures(db_path)
    put(db_path, "type_year", [dict(year=2020, aircraft_type="555", domestic=1, service_class="F", deps=0, seats=0, passengers=0, freight=0)])
    assert not [h for k, h in index(db_path) if h.endswith("type-555")]


def test_rebuild_is_repeatable_and_part_of_the_full_rebuild(db_path):
    aircraft_fixtures(db_path)
    conn = sqlite3.connect(db_path)
    first = rebuild_search_index(conn)
    assert first > 0 and rebuild_search_index(conn) == first
    rebuilt = rebuild_derived_tables(conn)  # from the (empty) segments, so the fixtures' rows go
    assert rebuilt["search_index"] == conn.execute("SELECT COUNT(*) FROM search_index").fetchone()[0]
    conn.close()


def put_group(db_path, group_id, group_name, members):
    """members: [(airline_id, carrier code, departures)]"""
    put(db_path, "carrier_group_year", [dict(year=2019, airline_id=a, group_id=group_id, group_name=group_name, domestic=1, service_class="F",
                                             deps=d, seats=0, passengers=0, freight=0) for a, c, d in members])
    put(db_path, "carriers", [dict(airline_id=a, carrier=c, unique_carrier=c, name=c) for a, c, d in members])


def test_a_merged_groups_code_is_its_busiest_members_and_every_members_code_finds_it(db_path):
    put_group(db_path, "united", "United (incl. Continental)", [("19704", "CO", 2), ("19977", "UA", 4)])
    row = index(db_path)[("airline", "/airlines/united")]
    assert row["code"] == "UA" and {"co", "ua"} <= set(row["terms"].split())


def test_an_airline_that_never_flew_is_not_indexed(db_path):
    put_group(db_path, "21205", "Inter Island Airways", [("21205", "II", 0)])
    assert not [h for k, h in index(db_path) if k == "airline"]


def market(db_path, ids, names):
    put(db_path, "airport_market", [dict(code=c, market_id=m) for c, m in ids])
    put(db_path, "market_name", [dict(market_id=m, name=n) for m, n in names])


def test_a_market_with_two_or_more_airports_is_indexed_as_a_city_but_a_one_airport_market_is_not(db_path):
    put_airport_years(db_path, [airport_year("SEA", "Seattle, WA", 90), airport_year("BFI", "Seattle, WA", 10), airport_year("BOI", "Boise, ID", 20)])
    market(db_path, [("SEA", "30559"), ("BFI", "30559"), ("BOI", "30000")], [("30559", "Seattle, WA"), ("30000", "Boise, ID")])
    rows = index(db_path)
    city = rows[("city", "/airports/cities/30559")]
    assert city["label"] == "Seattle, WA" and city["rank"] == 100 and city["code"] == ""
    assert city["hint"] == "SEA, BFI · 2019–2019"  # its busiest airport first
    assert {"seattle", "wa", "sea", "bfi"} <= set(city["terms"].split())
    assert ("city", "/airports/cities/30000") not in rows  # Boise is just BOI
