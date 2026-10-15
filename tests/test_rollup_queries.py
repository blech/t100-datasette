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
    put(db_path, "carrier_group_year", [dict(year=2019, group_id="DL", group_name="Delta", domestic=1, service_class="F",
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
