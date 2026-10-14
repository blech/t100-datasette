import sqlite3

from tests.helpers import get_json


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


def test_carrier_route_changes_compares_two_years_per_pair(ds, db_path):
    row = lambda year, dest, deps: dict(group_id="vx", year=year, origin="SFO", dest=dest, deps=deps, seats=0, passengers=0, freight=0, first_month=1, last_month=12)
    put(db_path, "carrier_route_year", [row(2017, "DEN", 300), row(2017, "LAX", 900), row(2019, "LAX", 800), row(2019, "PDX", 200), row(2017, "TINY", 3)])
    rows = get_json(ds, "/t100/carrier_route_changes.json?_shape=objects&group=vx&a=2017&b=2019&min=12")["rows"]
    assert [(r["dest"], r["deps_a"], r["deps_b"]) for r in rows] == [("LAX", 900, 800), ("DEN", 300, 0), ("PDX", 0, 200)]
    assert get_json(ds, "/t100/carrier_route_counts.json?_shape=objects&group=vx&min=12")["rows"] == [{"year": 2017, "pairs": 2}, {"year": 2019, "pairs": 2}]
