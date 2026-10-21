import sqlite3

from tests.helpers import add_segments, get_json


def put(db_path, table, rows):
    conn = sqlite3.connect(db_path)
    for row in rows:
        conn.execute(f"INSERT INTO {table} ({', '.join(row)}) VALUES ({', '.join('?' for _ in row)})", list(row.values()))
    conn.commit()
    conn.close()


def fam(year, family, domestic, service_class, deps):
    return dict(year=year, family=family, aircraft_class="Narrowbody jet", domestic=domestic, service_class=service_class,
                deps=deps, seats=deps * 100, passengers=deps * 80, freight=0)


def test_family_by_year_labels_service_and_kind_and_merges_classes(ds, db_path):
    put(db_path, "family_year", [fam(2019, "Boeing 737", 1, "F", 10), fam(2019, "Boeing 737", 1, "L", 5),
                                 fam(2019, "Boeing 737", 0, "G", 2), fam(2019, "Boeing 737", 1, "P", 1)])
    body = get_json(ds, "/t100/family_by_year.json?_shape=objects")
    got = {(r["service"], r["kind"]): r["deps"] for r in body["rows"]}
    assert got == {("domestic", "passenger"): 15, ("international", "freight"): 2, ("domestic", "freight"): 1}


def test_carrier_group_by_year_keeps_the_group_name(ds, db_path):
    put(db_path, "carrier_group_year", [dict(year=2019, airline_id="19790", group_id="DL", group_name="Delta", domestic=1, service_class="F",
                                             deps=4, seats=400, passengers=300, freight=0)])
    row = get_json(ds, "/t100/carrier_group_by_year.json?_shape=objects")["rows"][0]
    assert (row["group_id"], row["group_name"], row["kind"], row["passengers"]) == ("DL", "Delta", "passenger", 300)


def test_engines_by_year_keeps_the_distance_band(ds, db_path):
    put(db_path, "aircraft_group_band_year", [dict(year=2019, aircraft_group="6", distance_band=3000, domestic=0, service_class="F",
                                                   deps=7, seats=700, passengers=500, freight=0)])
    row = get_json(ds, "/t100/engines_by_year.json?_shape=objects")["rows"][0]
    assert (row["aircraft_group"], row["distance_band"], row["deps"]) == ("6", 3000, 7)


def test_family_detail_returns_one_family_split_by_version_and_airline(ds, db_path):
    def detail(family, subfamily, deps):
        return dict(family=family, year=2019, subfamily=subfamily, group_id="DL", group_name="Delta", domestic=1, service_class="F",
                    deps=deps, seats=0, passengers=0, freight=0)
    put(db_path, "family_detail_year", [detail("Boeing 737", "737 NG", 5), detail("Boeing 737", "737 MAX", 2), detail("Boeing 747", "747", 9)])
    body = get_json(ds, "/t100/family_detail.json?family=Boeing+737&_shape=objects")
    assert {(r["subfamily"], r["group_name"], r["deps"]) for r in body["rows"]} == {("737 NG", "Delta", 5), ("737 MAX", "Delta", 2)}


def test_carrier_route_changes_compares_two_years_per_pair(ds, db_path):
    row = lambda year, dest, deps: dict(group_id="vx", airline_id="21171", year=year, origin="SFO", dest=dest, deps=deps, seats=0, passengers=0, freight=0, first_month=1, last_month=12)
    put(db_path, "carrier_route_year", [row(2017, "DEN", 300), row(2017, "LAX", 900), row(2019, "LAX", 800), row(2019, "PDX", 200), row(2017, "TINY", 3)])
    rows = get_json(ds, "/t100/carrier_route_changes.json?_shape=objects&group=vx&a=2017&b=2019")["rows"]
    assert [(r["dest"], r["deps_a"], r["deps_b"]) for r in rows] == [("LAX", 900, 800), ("DEN", 300, 0), ("TINY", 3, 0), ("PDX", 0, 200)]
    assert get_json(ds, "/t100/carrier_route_counts.json?_shape=objects&group=vx&min=12")["rows"] == [{"year": 2017, "pairs": 2}, {"year": 2019, "pairs": 2}]


def test_airline_queries_cover_a_whole_group_or_one_member(ds, db_path):
    put(db_path, "carrier_group", [dict(airline_id="21171", group_id="alaska", group_name="Alaska (incl. Virgin America)", airline_name="Virgin America"),
                                   dict(airline_id="19930", group_id="alaska", group_name="Alaska (incl. Virgin America)", airline_name="Alaska Airlines Inc.")])
    row = lambda airline, dest, deps: dict(group_id="alaska", airline_id=airline, year=2017, origin="LAX", dest=dest, deps=deps, seats=0, passengers=deps, freight=0, first_month=1, last_month=12)
    put(db_path, "carrier_route_year", [row("21171", "BOS", 8), row("19930", "BOS", 8), row("19930", "SEA", 20)])
    counts = lambda airline: get_json(ds, f"/t100/carrier_route_counts.json?_shape=objects&group=alaska&airline={airline}&min=12")["rows"]
    assert counts("") == [{"year": 2017, "pairs": 2}]  # LAX-BOS reaches 12 only with both airlines added up
    assert counts("19930") == [{"year": 2017, "pairs": 1}]
    assert counts("21171") == []
    rows = get_json(ds, "/t100/carrier_routes_year.json?_shape=objects&group=alaska&airline=&year=2017")["rows"]
    assert sorted((r["airline"], r["dest"]) for r in rows) == [("Alaska Airlines Inc.", "BOS"), ("Alaska Airlines Inc.", "SEA"), ("Virgin America", "BOS")]
    one = get_json(ds, "/t100/carrier_routes_year.json?_shape=objects&group=alaska&airline=21171&year=2017")["rows"]
    assert [(r["airline"], r["dest"]) for r in one] == [("Virgin America", "BOS")]


def test_airline_list_offers_each_group_and_each_member_of_a_merged_one(ds, db_path):
    put(db_path, "carrier_group", [dict(airline_id="21171", group_id="alaska", group_name="Alaska (incl. Virgin America)", airline_name="Virgin America"),
                                   dict(airline_id="19930", group_id="alaska", group_name="Alaska (incl. Virgin America)", airline_name="Alaska Airlines Inc."),
                                   dict(airline_id="20304", group_id="20304", group_name="SkyWest Airlines Inc.", airline_name="SkyWest Airlines Inc.")])
    year = lambda airline, group, name, deps: dict(year=2017, group_id=group, group_name=name, airline_id=airline, domestic=1, service_class="F", deps=deps, seats=0, passengers=0, freight=0)
    put(db_path, "carrier_group_year", [year("21171", "alaska", "Alaska (incl. Virgin America)", 5), year("19930", "alaska", "Alaska (incl. Virgin America)", 50), year("20304", "20304", "SkyWest Airlines Inc.", 9)])
    rows = get_json(ds, "/t100/airline_list.json?_shape=objects")["rows"]
    assert [(r["id"], r["name"], r["parent"]) for r in rows] == [
        ("alaska", "Alaska (incl. Virgin America)", ""), ("19930", "Alaska Airlines Inc.", "Alaska (incl. Virgin America)"),
        ("20304", "SkyWest Airlines Inc.", ""), ("21171", "Virgin America", "Alaska (incl. Virgin America)")]


def test_route_page_counts_each_segment_once_however_many_lookup_rows_an_airline_entity_has(ds, db_path):
    # BTS repeats an entity once per name and start date, and sometimes exactly; a plain join counted each segment once per row
    lookup = lambda name, start: dict(airline_id="19950", carrier_entity="19756", unique_carrier_entity="19756", name=name, start_date_source=start)
    put(db_path, "carriers", [lookup("Rosenbalm Aviation Inc.", "1/1/1990 12:00:00 AM"), lookup("Rosenbalm Aviation Inc.", "1/1/1990 12:00:00 AM"),
                              lookup("Flagship Express Services", "7/1/1991 12:00:00 AM")])
    put(db_path, "aircraft_types", [dict(ac_typeid="852", ac_group="8", name="DC-8-63F")])
    seg = lambda year, month, deps: dict(year=year, month=month, origin="LHR", dest="PHL", carrier_entity="19756", aircraft_type="852", departures_performed=deps, passengers=0, seats=0, freight=0)
    add_segments(db_path, "t100_international", [seg(1991, 2, 5), seg(1991, 8, 3)])
    rows = get_json(ds, "/t100/route.json?_shape=objects&origin=LHR&dest=PHL")["rows"]
    assert sorted((r["carrier"], r["deps"]) for r in rows) == [("Flagship Express Services", 3), ("Rosenbalm Aviation Inc.", 5)]  # each name for its own months
    monthly = get_json(ds, "/t100/route_year.json?_shape=objects&origin=LHR&dest=PHL&year=1991")["rows"]
    assert [(r["month"], r["carrier"], r["deps"]) for r in monthly] == [("02", "Rosenbalm Aviation Inc.", 5), ("08", "Flagship Express Services", 3)]


def test_route_page_keeps_segments_whose_carrier_is_missing_from_the_lookup(ds, db_path):
    put(db_path, "aircraft_types", [dict(ac_typeid="852", ac_group="8", name="DC-8-63F")])
    add_segments(db_path, "t100_international", [dict(year=2019, month=1, origin="LHR", dest="PHL", carrier_entity="NOPE", aircraft_type="852", departures_performed=4, passengers=0, seats=0, freight=0)])
    rows = get_json(ds, "/t100/route.json?_shape=objects&origin=LHR&dest=PHL")["rows"]
    assert [(r["carrier"], r["deps"]) for r in rows] == [(None, 4)]


def ty(year, aircraft_type, domestic, service_class, deps):
    return dict(year=year, aircraft_type=aircraft_type, domestic=domestic, service_class=service_class,
                deps=deps, seats=deps * 100, passengers=deps * 80, freight=deps * 1000)


def test_type_table_gives_each_type_its_year_and_its_span(ds, db_path):
    put(db_path, "aircraft_types", [dict(ac_typeid="614", ac_group="6", name="Boeing 737-800", maker="Boeing", kind="Jet, twin-engine"),
                                    dict(ac_typeid="091", ac_group="0", name="Float/Amphib Turbine", maker=None, kind="Piston, single-engine")])
    put(db_path, "aircraft_family", [dict(aircraft_type="614", name="Boeing 737-800", family="Boeing 737", subfamily="737 NG", aircraft_class="Narrowbody jet", fallback=0)])
    put(db_path, "type_year", [ty(2001, "614", 1, "F", 4), ty(2019, "614", 1, "F", 10), ty(2019, "614", 0, "G", 2),
                               ty(2019, "091", 1, "F", 1), ty(2019, "999", 1, "F", 3), ty(2019, "unknown", 1, "F", 5)])
    rows = {r["type_id"]: r for r in get_json(ds, "/t100/type_table.json?_shape=objects&year=2019")["rows"]}
    assert rows["614"]["deps"] == 12 and rows["614"]["family"] == "Boeing 737" and rows["614"]["maker"] == "Boeing"
    assert (rows["614"]["first_year"], rows["614"]["last_year"]) == (2001, 2019)
    assert rows["091"]["maker"] == "Unknown maker" and rows["091"]["family"] == "Unknown"
    assert rows["999"]["name"] == "Type 999" and rows["unknown"]["name"] == "Type not reported"
    assert sum(r["deps"] for r in rows.values()) == 21
    other = {r["type_id"]: r for r in get_json(ds, "/t100/type_table.json?_shape=objects&year=2001")["rows"]}
    assert other["614"]["deps"] == 4 and other["091"]["deps"] == 0


def test_maker_by_year_labels_service_and_kind_and_names_unknown_makers(ds, db_path):
    put(db_path, "aircraft_types", [dict(ac_typeid="614", ac_group="6", name="Boeing 737-800", maker="Boeing", kind="Jet, twin-engine"),
                                    dict(ac_typeid="091", ac_group="0", name="Float/Amphib Turbine", maker=None, kind="Piston, single-engine")])
    put(db_path, "type_year", [ty(2019, "614", 1, "F", 10), ty(2019, "614", 1, "L", 5), ty(2019, "614", 0, "G", 2), ty(2019, "091", 1, "F", 1)])
    rows = get_json(ds, "/t100/maker_by_year.json?_shape=objects")["rows"]
    got = {(r["maker"], r["service"], r["kind"]): r["deps"] for r in rows}
    assert got == {("Boeing", "domestic", "passenger"): 15, ("Boeing", "international", "freight"): 2, ("Unknown maker", "domestic", "passenger"): 1}
    assert {r["aircraft_kind"] for r in rows} == {"Jet, twin-engine", "Piston, single-engine"}


def test_type_table_can_add_up_every_year(ds, db_path):
    put(db_path, "aircraft_types", [dict(ac_typeid="614", ac_group="6", name="Boeing 737-800", maker="Boeing", kind="Jet, twin-engine")])
    put(db_path, "type_year", [ty(2001, "614", 1, "F", 4), ty(2019, "614", 1, "F", 10), ty(2019, "614", 0, "G", 2)])
    row = get_json(ds, "/t100/type_table.json?_shape=objects&year=all")["rows"][0]
    assert (row["deps"], row["first_year"], row["last_year"]) == (16, 2001, 2019)
    assert get_json(ds, "/t100/type_table.json?_shape=objects&year=2001")["rows"][0]["deps"] == 4
