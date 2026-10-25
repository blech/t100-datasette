import sqlite3

from build_database import rebuild_derived_tables, rebuild_aircraft_family, rebuild_aircraft_type_labels, rebuild_carrier_groups, rebuild_type_year
from tests.helpers import add_segments
from tests.test_routes_by_year import seg


def add_types(db_path, *types):
    conn = sqlite3.connect(db_path)
    conn.executemany("INSERT INTO aircraft_types (ac_typeid, ac_group, name) VALUES (?, ?, ?)", types)
    conn.commit()
    conn.close()


def add_carriers(db_path, *carriers):
    conn = sqlite3.connect(db_path)
    conn.executemany("INSERT INTO carriers (airline_id, unique_carrier_entity, unique_carrier_name) VALUES (?, ?, ?)", carriers)
    conn.commit()
    conn.close()


def flight(origin="ATL", dest="LAX", year=2019, deps=10, pax=1000, seats=1500, freight=0, **extra):
    row = seg(origin, dest, year, deps, pax, seats=seats, freight=freight)
    row.update(extra)
    return row


def query(db_path, sql, rebuild=rebuild_derived_tables):
    conn = sqlite3.connect(db_path)
    rebuild(conn)
    rows = conn.execute(sql).fetchall()
    conn.close()
    return rows


TYPES = [("614", "6", "Boeing 737-800"), ("839", "6", "Boeing B737 Max 800"), ("612", "6", "Boeing 737-700/700LR/Max 7"),
         ("359", "6", "Airbus Industrie A350-900"), ("900", "3", "Eurocompter As350 B2 Astar"), ("901", "4", "Mystery Turbo 9")]


def families(db_path):
    add_types(db_path, *TYPES)
    return {r[0]: r[1:] for r in query(db_path, "SELECT aircraft_type, family, subfamily, aircraft_class, fallback FROM aircraft_family", rebuild_aircraft_family)}


def test_737_variants_roll_up_to_one_family_with_generation_subfamilies(db_path):
    got = families(db_path)
    assert got["614"] == ("Boeing 737", "737 NG", "Narrowbody jet", 0)
    assert got["839"] == ("Boeing 737", "737 MAX", "Narrowbody jet", 0)


def test_the_lumped_700_max7_type_is_filed_under_ng(db_path):
    assert families(db_path)["612"][1] == "737 NG (incl. MAX 7)"


def test_a350_rule_does_not_catch_a_helicopter(db_path):
    got = families(db_path)
    assert got["359"][0] == "Airbus A350"
    assert got["900"][0] != "Airbus A350"


def test_unmatched_types_fall_back_on_the_bts_group_and_are_flagged(db_path):
    assert families(db_path)["901"] == ("Other turboprop, one or two engines", "", "Turboprop", 1)


def leftovers(db_path, *types):
    """Families for (type id, BTS group, name, maker) rows, with the maker set as rebuild_aircraft_type_labels would."""
    add_types(db_path, *[t[:3] for t in types])
    conn = sqlite3.connect(db_path)
    conn.executemany("UPDATE aircraft_types SET maker = ? WHERE ac_typeid = ?", [(t[3], t[0]) for t in types])
    conn.commit()
    conn.close()
    return {r[0]: r[1:] for r in query(db_path, "SELECT aircraft_type, family, aircraft_class, fallback, subfamily FROM aircraft_family", rebuild_aircraft_family)}


def test_unmatched_types_of_a_maker_with_two_or_more_form_a_family_whatever_their_kind(db_path):
    got = leftovers(db_path, ("801", "0", "Zork Z-1 Skylark", "Zork"), ("802", "4", "Zork Z-9 Turbo", "Zork"))
    assert got["801"] == ("Zork (other models)", "Piston", 1, "")
    assert got["802"] == ("Zork (other models)", "Piston", 1, "")   # one class for the family: a tie goes to the alphabetically first


def test_a_makers_single_unmatched_type_joins_the_per_kind_other(db_path):
    got = leftovers(db_path, ("803", "2", "Zork L-1049", "Zork"), ("804", "0", "Quux Q-3", "Quux"), ("805", "0", "Quux Q-4", "Quux"))
    assert got["803"][0] == "Other piston, four-engine"
    assert got["804"][0] == got["805"][0] == "Quux (other models)"


def test_unmatched_types_with_no_maker_join_the_per_kind_other(db_path):
    got = leftovers(db_path, ("806", "1", "Float/Amphib A", None), ("807", "1", "Float/Amphib B", None), ("808", "3", "Mystery Copter", ""))
    assert got["806"][0] == got["807"][0] == "Other piston, twin-engine"
    assert got["808"][0] == "Other helicopter"


def test_rule_matched_types_are_not_counted_as_leftovers(db_path):
    got = leftovers(db_path, ("614", "6", "Boeing 737-800", "Boeing"), ("809", "6", "Boeing Zeta", "Boeing"))
    assert got["614"][0] == "Boeing 737"
    assert got["809"][0] == "Other jet, twin-engine"


def test_rebuilding_twice_gives_the_same_families(db_path):
    first = leftovers(db_path, ("801", "0", "Zork Z-1 Skylark", "Zork"), ("802", "4", "Zork Z-9 Turbo", "Zork"), ("803", "2", "Zork L-1049", "Other"))
    conn = sqlite3.connect(db_path)
    rebuild_aircraft_family(conn)
    second = {r[0]: r[1:] for r in conn.execute("SELECT aircraft_type, family, aircraft_class, fallback, subfamily FROM aircraft_family")}
    assert first == second


def test_a_makers_family_of_mixed_kinds_has_one_class_and_rolls_up_into_family_year(db_path):
    add_types(db_path, ("801", "0", "Cessna 150/152"), ("802", "4", "Cessna C-441"), ("803", "0", "Cessna 172 Skyhawk"))
    add_segments(db_path, "t100_domestic", [flight(aircraft_type=t, **{"class": "F"}, deps=d) for t, d in (("801", 3), ("802", 4), ("803", 5))])
    conn = sqlite3.connect(db_path)
    rebuild_derived_tables(conn)
    classes = {r[0] for r in conn.execute("SELECT aircraft_class FROM aircraft_family WHERE family = 'Cessna (other models)'")}
    assert classes == {"Piston"}, "the most common class among the family's types"
    assert conn.execute("SELECT SUM(deps), COUNT(DISTINCT aircraft_class) FROM family_year WHERE family = 'Cessna (other models)'").fetchone() == (12, 1)


def test_family_year_splits_domestic_and_international_and_service_class(db_path):
    add_types(db_path, *TYPES)
    add_segments(db_path, "t100_domestic", [flight(aircraft_type="614", **{"class": "F"}, deps=10, pax=100, seats=150, freight=5),
                                            flight(aircraft_type="839", **{"class": "F"}, deps=3, pax=30, seats=45, freight=1),
                                            flight(aircraft_type="614", **{"class": "G"}, deps=2, pax=0, seats=0, freight=900)])
    add_segments(db_path, "t100_international", [flight(aircraft_type="614", **{"class": "F"}, deps=4, pax=40, seats=60, freight=2)])
    rows = query(db_path, "SELECT domestic, service_class, deps, seats, passengers, freight FROM family_year WHERE family='Boeing 737' AND year=2019 ORDER BY domestic, service_class")
    assert rows == [(0, "F", 4, 60, 40, 2), (1, "F", 13, 195, 130, 6), (1, "G", 2, 0, 0, 900)]


def test_family_year_keeps_segments_whose_type_is_unknown(db_path):
    add_segments(db_path, "t100_domestic", [flight(aircraft_type="999", **{"class": "F"}, deps=7)])
    assert query(db_path, "SELECT family, deps FROM family_year") == [("Unknown", 7)]


def test_family_year_totals_match_the_segment_tables(db_path):
    add_types(db_path, *TYPES)
    add_segments(db_path, "t100_domestic", [flight(aircraft_type="614", **{"class": "F"}), flight(aircraft_type="359", **{"class": "F"}, deps=5)])
    add_segments(db_path, "t100_international", [flight(aircraft_type="901", **{"class": "L"}, deps=2)])
    assert query(db_path, "SELECT SUM(deps) FROM family_year") == [(17,)]


def test_family_detail_year_splits_by_subfamily_and_carrier_group(db_path):
    add_types(db_path, *TYPES)
    add_carriers(db_path, ("19790", "A1", "Delta Air Lines Inc."), ("19386", "B1", "Northwest Airlines Inc."))
    add_segments(db_path, "t100_domestic", [
        flight(aircraft_type="614", carrier_entity="A1", **{"class": "F"}, deps=10, pax=100, seats=150, freight=5),
        flight(aircraft_type="614", carrier_entity="B1", **{"class": "F"}, deps=4, pax=40, seats=60, freight=1),
        flight(aircraft_type="839", carrier_entity="A1", **{"class": "F"}, deps=3, pax=30, seats=45, freight=0)])
    rows = query(db_path, "SELECT subfamily, group_id, deps, seats, passengers, freight FROM family_detail_year WHERE family='Boeing 737' ORDER BY subfamily")
    assert rows == [("737 MAX", "delta", 3, 45, 30, 0), ("737 NG", "delta", 14, 210, 140, 6)]


def test_aircraft_carrier_year_gives_each_aircraft_its_airline_groups(db_path):
    add_types(db_path, *TYPES)
    add_carriers(db_path, ("19790", "A1", "Delta Air Lines Inc."), ("19386", "B1", "Northwest Airlines Inc."))
    add_segments(db_path, "t100_domestic", [
        flight(aircraft_type="614", carrier_entity="A1", **{"class": "F"}, deps=10, pax=100, seats=150, freight=5),
        flight(aircraft_type="614", carrier_entity="B1", **{"class": "F"}, deps=4, pax=40, seats=60, freight=1),
        flight(aircraft_type="839", carrier_entity="A1", **{"class": "F"}, deps=3, pax=30, seats=45, freight=0)])
    rows = query(db_path, "SELECT aircraft, group_id, deps, seats, passengers, freight FROM aircraft_carrier_year ORDER BY aircraft")
    assert rows == [("614", "delta", 14, 210, 140, 6), ("839", "delta", 3, 45, 30, 0)]


def test_aircraft_carrier_year_totals_match_type_year_and_keep_unknowns(db_path):
    add_types(db_path, *TYPES)
    add_segments(db_path, "t100_domestic", [flight(aircraft_type="614", carrier_entity="NOPE", **{"class": "F"}, deps=2), flight(aircraft_type=None, carrier_entity="NOPE", **{"class": "G"}, deps=3)])
    assert query(db_path, "SELECT SUM(deps), SUM(freight) FROM aircraft_carrier_year") == query(db_path, "SELECT SUM(deps), SUM(freight) FROM type_year")
    assert {r[0] for r in query(db_path, "SELECT group_id FROM aircraft_carrier_year")} == {"unknown"}


def test_family_detail_year_totals_match_family_year(db_path):
    add_types(db_path, *TYPES)
    add_segments(db_path, "t100_domestic", [flight(aircraft_type="614", **{"class": "F"}), flight(aircraft_type="999", **{"class": "G"}, deps=5)])
    assert query(db_path, "SELECT SUM(deps), SUM(freight) FROM family_detail_year") == query(db_path, "SELECT SUM(deps), SUM(freight) FROM family_year")


def groups(db_path):
    add_carriers(db_path, ("19790", "A1", "Delta Air Lines Inc."), ("19386", "B1", "Northwest Airlines Inc."), ("19386", "B2", "Northwest Airlines Inc."), ("20304", "C1", "SkyWest Airlines Inc."))
    return {r[0]: r[1:] for r in query(db_path, "SELECT airline_id, group_id, group_name FROM carrier_group", rebuild_carrier_groups)}


def test_a_merged_carrier_maps_to_the_surviving_parent(db_path):
    got = groups(db_path)
    assert got["19386"] == got["19790"] == ("delta", "Delta (incl. Northwest)")


def test_each_airline_keeps_its_own_name_inside_its_group(db_path):
    add_carriers(db_path, ("19790", "A1", "Delta Air Lines Inc."), ("19386", "B1", "Northwest Airlines Inc."))
    names = dict(query(db_path, "SELECT airline_id, airline_name FROM carrier_group", rebuild_carrier_groups))
    assert names == {"19790": "Delta Air Lines Inc.", "19386": "Northwest Airlines Inc."}


def test_an_unmerged_carrier_is_its_own_group_under_its_own_name(db_path):
    assert groups(db_path)["20304"] == ("20304", "SkyWest Airlines Inc.")


def test_carrier_group_year_adds_up_across_entities_and_ignores_duplicate_lookup_rows(db_path):
    add_carriers(db_path, ("19790", "A1", "Delta Air Lines Inc."), ("19386", "B1", "Northwest Airlines Inc."), ("19386", "B1", "Northwest Airlines Inc."))
    add_segments(db_path, "t100_domestic", [flight(carrier_entity="A1", **{"class": "F"}, deps=10, pax=100), flight(carrier_entity="B1", **{"class": "F"}, deps=4, pax=40)])
    assert query(db_path, "SELECT group_id, group_name, SUM(deps), SUM(passengers) FROM carrier_group_year GROUP BY group_id") == [("delta", "Delta (incl. Northwest)", 14, 140)]
    assert query(db_path, "SELECT airline_id, deps FROM carrier_group_year ORDER BY airline_id") == [("19386", 4), ("19790", 10)]  # the members stay apart in the table


def test_distance_bands_use_lower_bounds(db_path):
    add_segments(db_path, "t100_domestic", [flight(distance=d, aircraft_group="6", **{"class": "F"}, deps=1) for d in (499, 500, 2999, 3000, 4999, 5000)])
    rows = query(db_path, "SELECT distance_band, deps FROM aircraft_group_band_year WHERE aircraft_group='6' ORDER BY distance_band")
    assert rows == [(0, 1), (500, 1), (1500, 1), (3000, 2), (5000, 1)]


def test_rebuilding_twice_gives_the_same_tables(db_path):
    add_types(db_path, *TYPES)
    add_carriers(db_path, ("19790", "A1", "Delta Air Lines Inc."))
    add_segments(db_path, "t100_domestic", [flight(aircraft_type="614", carrier_entity="A1", distance=1000, aircraft_group="6", **{"class": "F"})])
    conn = sqlite3.connect(db_path)
    first = rebuild_derived_tables(conn)
    second = rebuild_derived_tables(conn)
    assert first == second
    assert {"aircraft_family", "family_year", "carrier_group", "carrier_group_year", "aircraft_group_band_year", "family_detail_year", "aircraft_carrier_year"} <= set(first)


def test_carrier_route_year_joins_both_directions_and_both_merged_airlines(db_path):
    add_carriers(db_path, ("19790", "A1", "Delta Air Lines Inc."), ("19386", "B1", "Northwest Airlines Inc."))
    add_segments(db_path, "t100_domestic", [
        flight("SFO", "DEN", carrier_entity="A1", **{"class": "F"}, deps=10),
        flight("DEN", "SFO", carrier_entity="B1", **{"class": "F"}, deps=4)])
    rows = query(db_path, "SELECT group_id, airline_id, year, origin, dest, deps FROM carrier_route_year ORDER BY airline_id")
    assert rows == [("delta", "19386", 2019, "DEN", "SFO", 4), ("delta", "19790", 2019, "DEN", "SFO", 10)]


def test_carrier_route_year_counts_the_departures_filed_as_domestic(db_path):
    # a pair can sit in both BTS files; the airport map's rule needs how many of the departures were filed domestic
    add_carriers(db_path, ("19790", "A1", "Delta Air Lines Inc."))
    add_segments(db_path, "t100_domestic", [flight("HNL", "GUM", carrier_entity="A1", **{"class": "F"}, deps=3)])
    add_segments(db_path, "t100_international", [flight("GUM", "HNL", carrier_entity="A1", **{"class": "F"}, deps=9)])
    assert query(db_path, "SELECT deps, domestic_deps FROM carrier_route_year") == [(12, 3)]


def test_an_older_shape_of_a_derived_table_is_dropped_and_rebuilt(db_path):
    conn = sqlite3.connect(db_path)
    conn.execute("DROP TABLE carrier_group_year")
    conn.execute("CREATE TABLE carrier_group_year (year INTEGER, group_id TEXT, group_name TEXT, domestic INTEGER, service_class TEXT, deps INTEGER, seats INTEGER, passengers INTEGER, freight INTEGER)")
    conn.commit()
    rebuild_derived_tables(conn)
    assert "airline_id" in [r[1] for r in conn.execute("PRAGMA table_info(carrier_group_year)")]


def test_a_numeric_group_id_is_refused_because_it_would_collide_with_airline_page_urls(db_path, tmp_path):
    import pytest
    rules = tmp_path / "groups.csv"
    rules.write_text("airline_id,group_id,group_name,note\n19790,19999,Delta,\n")
    conn = sqlite3.connect(db_path)
    with pytest.raises(ValueError, match="19999"):
        rebuild_carrier_groups(conn, rules)


def test_aircraft_types_get_a_maker_from_their_name_and_a_kind_from_the_bts_group(db_path):
    add_types(db_path, ("614", "6", "Boeing 737-800"), ("320", "3", "Boeing Vertol BV-107"), ("760", "7", "Lockheed L-1011-01/100/200"),
              ("040", "0", "Dehavilland Dhc2 Beaver"), ("205", "2", "Dehavilland DH-114 Heron"), ("091", "0", "Float/Amphib Turbine"),
              ("697", "8", "Airbus Industrie A340"), ("724", "6", "A220-300 BD-500-1A11"))
    rows = dict((code, (maker, kind)) for code, maker, kind in query(
        db_path, "SELECT ac_typeid, maker, kind FROM aircraft_types", rebuild=lambda c: rebuild_aircraft_type_labels(c)))
    assert rows["614"] == ("Boeing", "Jet, twin-engine")
    assert rows["320"] == ("Boeing Vertol", "Helicopter")  # not Boeing
    assert rows["760"] == ("Lockheed", "Jet, three-engine")
    assert rows["040"][0] == "De Havilland Canada" and rows["205"][0] == "de Havilland"
    assert rows["091"] == (None, "Piston, single-engine")  # generic float/amphibian types name no maker
    assert rows["697"][1] == "Jet, four-engine"  # the A340 has a 6xx code; the group, not the code, says four engines
    assert rows["724"][0] == "Airbus"


def test_adding_the_label_columns_to_an_older_aircraft_types_table(db_path):
    conn = sqlite3.connect(db_path)
    conn.executescript("DROP TABLE aircraft_types; CREATE TABLE aircraft_types (ac_typeid TEXT, ac_group TEXT, name TEXT);"
                       "INSERT INTO aircraft_types VALUES ('614', '6', 'Boeing 737-800');")
    rebuild_aircraft_type_labels(conn)
    assert conn.execute("SELECT maker, kind FROM aircraft_types").fetchall() == [("Boeing", "Jet, twin-engine")]


def test_type_year_adds_up_to_the_segments_and_keeps_unknown_types(db_path):
    add_types(db_path, ("614", "6", "Boeing 737-800"))
    add_segments(db_path, "t100_domestic", [
        flight(aircraft_type="614", **{"class": "F"}, deps=10, pax=800, seats=1000),
        flight(aircraft_type="614", **{"class": "F"}, deps=5, pax=400, seats=500, month=2),
        flight(aircraft_type="999", **{"class": "F"}, deps=3),   # a type id BTS never defined
        flight(aircraft_type=None, **{"class": "G"}, deps=2, freight=4000),  # no type at all
    ])
    add_segments(db_path, "t100_international", [flight(aircraft_type="614", **{"class": "F"}, deps=1)])
    rows = query(db_path, "SELECT aircraft_type, domestic, service_class, deps, freight FROM type_year ORDER BY aircraft_type, domestic",
                 rebuild=rebuild_type_year)
    assert rows == [("614", 0, "F", 1, 0), ("614", 1, "F", 15, 0), ("999", 1, "F", 3, 0), ("unknown", 1, "G", 2, 4000)]
    total = query(db_path, "SELECT SUM(deps) FROM type_year", rebuild=rebuild_type_year)[0][0]
    assert total == 21


def test_type_year_is_part_of_the_full_rebuild(db_path):
    add_types(db_path, *TYPES)
    add_segments(db_path, "t100_domestic", [flight(aircraft_type="614", **{"class": "F"})])
    conn = sqlite3.connect(db_path)
    assert rebuild_derived_tables(conn)["type_year"] == 1

def test_big_families_split_into_the_versions_people_know(db_path):
    add_types(db_path, ("871", "8", "Airbus Industrie A340-300"), ("874", "8", "Airbus Industrie A340-600"), ("697", "8", "Airbus Industrie A340"),
              ("819", "8", "Boeing 747-400"), ("821", "8", "Boeing B747-8"), ("840", "8", "McDonnell Douglas DC-8-10"), ("856", "8", "McDonnell Douglas DC-8-63"),
              ("678", "6", "Embraer 190"), ("405", "4", "Beech 1900 A/B/C/D"), ("143", "1", "Convair CV-340/440"), ("459", "4", "SaAB-Fairchild 340/A"))
    got = {r[0]: r[1:3] for r in query(db_path, "SELECT aircraft_type, family, subfamily FROM aircraft_family", rebuild_aircraft_family)}
    assert [got[t] for t in ("871", "874", "697")] == [("Airbus A340", "A340-300"), ("Airbus A340", "A340-600"), ("Airbus A340", "A340 (model not given)")]
    assert got["819"] == ("Boeing 747", "747-400") and got["821"] == ("Boeing 747", "747-8")
    assert got["840"][1] == "DC-8 Series 10-50" and got["856"][1] == "DC-8 Series 60"
    # a version rule must not pull a type into another family: these stay where the family rules put them
    assert got["678"][0] == "Embraer E-Jet" and got["405"][0] == "Beech turboprops"
    assert got["143"] == ("Convair", "Convair 240/340/440") and got["459"] == ("Saab 340 / 2000", "Saab 340")


HELICOPTERS = [("364", "3", "BHT 206 L4 Long Ranger"), ("315", "3", "Bell B-206A"), ("366", "3", "Bell BHT 407"), ("368", "3", "Bell BHT 412"),
               ("345", "3", "Bell 212 Twin Two Twelve"), ("311", "3", "Bell B-47D"), ("317", "3", "HU-1H 204B"),
               ("390", "3", "Sikorsky S-76"), ("386", "3", "Sikorsky S-61N"), ("380", "3", "Sikorsky S-51"),
               ("340", "3", "Eurocompter As350 B2 Astar"), ("370", "3", "Air Bus Euro BO-105"), ("330", "3", "Boelkow BO-105C"), ("303", "3", "Sud Alouette"),
               ("325", "3", "Agusta A-119 Koala"), ("393", "3", "Agustawestland Aw139"), ("360", "3", "Robinson R44"),
               ("355", "3", "HughES-500/530"), ("350", "3", "Hughes 300"),
               ("320", "3", "Boeing Vertol BV-107"), ("396", "3", "Westland SR-N5 (Acv)"),
               ("020", "0", "Bellanca CH-300"), ("280", "2", "Sikorsky VS-44A (Amphibian)")]


def test_helicopters_are_grouped_by_maker_with_their_models_as_versions(db_path):
    add_types(db_path, *HELICOPTERS)
    got = {r[0]: r[1:4] for r in query(db_path, "SELECT aircraft_type, family, subfamily, aircraft_class FROM aircraft_family", rebuild_aircraft_family)}
    bell = {t: got[t][:2] for t in ("364", "315", "366", "368", "345", "311", "317")}
    assert bell == {"364": ("Bell helicopters", "Bell 206"), "315": ("Bell helicopters", "Bell 206"), "366": ("Bell helicopters", "Bell 407"),
                    "368": ("Bell helicopters", "Bell 412"), "345": ("Bell helicopters", "Bell 212"), "311": ("Bell helicopters", "Bell 47"),
                    "317": ("Bell helicopters", "Bell 204 (Huey)")}
    assert {t: got[t][:2] for t in ("390", "386", "380")} == {"390": ("Sikorsky helicopters", "S-76"), "386": ("Sikorsky helicopters", "S-61"),
                                                              "380": ("Sikorsky helicopters", "S-51")}
    assert {t: got[t][:2] for t in ("340", "370", "330", "303")} == {"340": ("Airbus helicopters", "AS350 (Eurocopter)"), "370": ("Airbus helicopters", "BO-105 (MBB)"),
                                                                     "330": ("Airbus helicopters", "BO-105 (MBB)"), "303": ("Airbus helicopters", "Alouette (Sud Aviation)")}
    assert {t: got[t][:2] for t in ("325", "393")} == {"325": ("Leonardo helicopters", "Agusta A119"), "393": ("Leonardo helicopters", "AgustaWestland AW139")}
    assert got["360"][:2] == ("Robinson helicopters", "R44")
    assert {t: got[t][:2] for t in ("355", "350")} == {"355": ("Hughes / MD helicopters", "500/530"), "350": ("Hughes / MD helicopters", "300")}
    assert all(got[t][2] == "Helicopter" for t, *_ in HELICOPTERS if t not in ("020", "280"))
    # makers with nothing flown since 1990 stay in the fallback; nothing is left in a family named just "Helicopters"
    assert got["320"][0] == got["396"][0] == "Other helicopter"
    assert "Helicopters" not in {f for f, *_ in got.values()}
    # "Bell" is a whole word, and Sikorsky's flying boat isn't a helicopter
    assert got["020"][0] != "Bell helicopters" and got["280"][0] != "Sikorsky helicopters"


def test_airport_market_gives_each_code_its_newest_bts_city_market(db_path):
    from build_database import rebuild_airport_market
    seg2 = lambda origin, dest, year, om, dm: dict(year=year, month=1, origin=origin, dest=dest, origin_city_market_id=om, dest_city_market_id=dm,
                                                   departures_performed=1, passengers=1, seats=1, freight=0)
    add_segments(db_path, "t100_domestic", [
        seg2("JFK", "LGA", 2024, "31703", "31703"), seg2("EWR", "JFK", 2024, "31703", "31703"),
        seg2("XYZ", "JFK", 2005, "10001", "31703"), seg2("XYZ", "JFK", 2020, "20002", "31703"),   # a code whose market changed
        seg2("JFK", "LHR", 2024, "31703", None),                                                   # a destination with no market
    ])
    got = dict(query(db_path, "SELECT code, market_id FROM airport_market", rebuild_airport_market))
    assert got == {"JFK": "31703", "LGA": "31703", "EWR": "31703", "XYZ": "20002"}


def test_airport_carrier_year_counts_passengers_at_the_airport_they_leave(db_path):
    add_carriers(db_path, ("19790", "A1", "Delta Air Lines Inc."))
    add_segments(db_path, "t100_domestic", [flight("ATL", "LAX", carrier_entity="A1", **{"class": "F"}, deps=10, pax=100)])
    assert query(db_path, "SELECT origin, group_id, passengers FROM airport_carrier_year") == [("ATL", "delta", 100)]


def test_airport_carrier_year_merges_airlines_into_their_group(db_path):
    add_carriers(db_path, ("19393", "W1", "Southwest Airlines Co."), ("20437", "T1", "AirTran Airways Corporation"))
    add_segments(db_path, "t100_domestic", [flight("BWI", "MCO", carrier_entity="W1", **{"class": "F"}, pax=700), flight("BWI", "ATL", carrier_entity="T1", **{"class": "F"}, pax=100)])
    assert query(db_path, "SELECT group_id, group_name, passengers FROM airport_carrier_year") == [("southwest", "Southwest (incl. AirTran)", 800)]


def test_airport_carrier_year_keeps_domestic_and_international_apart(db_path):
    add_carriers(db_path, ("19790", "A1", "Delta Air Lines Inc."))
    add_segments(db_path, "t100_domestic", [flight("ATL", "LAX", carrier_entity="A1", **{"class": "F"}, pax=100)])
    add_segments(db_path, "t100_international", [flight("ATL", "LHR", carrier_entity="A1", **{"class": "F"}, pax=30)])
    assert query(db_path, "SELECT domestic, passengers FROM airport_carrier_year ORDER BY domestic") == [(0, 30), (1, 100)]


def test_airport_carrier_year_keeps_a_carrier_missing_from_the_lookup_as_unknown(db_path):
    add_segments(db_path, "t100_domestic", [flight("ATL", "LAX", carrier_entity="ZZ", **{"class": "F"}, pax=5)])
    assert query(db_path, "SELECT group_id, group_name, passengers FROM airport_carrier_year") == [("unknown", "Unknown carrier", 5)]


def test_airport_carrier_year_adds_up_to_airport_year_totals(db_path):
    add_carriers(db_path, ("19790", "A1", "Delta Air Lines Inc."), ("19393", "W1", "Southwest Airlines Co."))
    add_segments(db_path, "t100_domestic", [flight("ATL", "LAX", carrier_entity="A1", **{"class": "F"}, deps=3, seats=300, pax=200, freight=7),
                                            flight("ATL", "DEN", carrier_entity="W1", **{"class": "F"}, deps=2, seats=200, pax=150, freight=1)])
    add_segments(db_path, "t100_international", [flight("ATL", "LHR", carrier_entity="A1", **{"class": "F"}, deps=1, seats=250, pax=90, freight=4)])
    mine = query(db_path, "SELECT year, origin, SUM(deps), SUM(seats), SUM(passengers), SUM(freight) FROM airport_carrier_year GROUP BY year, origin")
    theirs = query(db_path, "SELECT year, origin, deps, seats, passengers, freight FROM airport_year_totals")
    assert mine == theirs and mine[0][2:] == (6, 750, 440, 12)
