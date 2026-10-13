from tests.helpers import add_segments, get_json, make_datasette


def seg(origin, dest, year, deps, pax, seats=100, freight=0, month=1):
    return dict(year=year, month=month, origin=origin, dest=dest, departures_performed=deps,
                passengers=pax, seats=seats, freight=freight)


def rows(ds, origin="ATL"):
    body = get_json(ds, f"/t100/routes_by_year.json?origin={origin}&_shape=objects")
    assert body["truncated"] is False
    return {(r["dest"], r["year"]): r for r in body["rows"]}


def test_pair_in_both_tables_is_one_row_with_majority_service(ds, db_path):
    add_segments(db_path, "t100_domestic", [seg("ATL", "LAX", 2018, 100, 10000, month=1), seg("ATL", "LAX", 2018, 100, 12000, month=2)])
    add_segments(db_path, "t100_international", [seg("ATL", "LAX", 2018, 5, 13)])
    r = rows(ds)[("LAX", 2018)]
    assert r["deps"] == 205 and r["passengers"] == 22013
    assert r["service"] == "domestic"


def test_exact_tie_is_international(ds, db_path):
    add_segments(db_path, "t100_domestic", [seg("ATL", "XYZ", 2018, 10, 1)])
    add_segments(db_path, "t100_international", [seg("ATL", "XYZ", 2018, 10, 1)])
    assert rows(ds)[("XYZ", 2018)]["service"] == "international"


def test_freight_only_route_uses_departures_not_passengers(ds, db_path):
    add_segments(db_path, "t100_domestic", [seg("ATL", "FRT", 2020, 4, 0, seats=0, freight=9000)])
    r = rows(ds)[("FRT", 2020)]
    assert r["service"] == "domestic" and r["passengers"] == 0 and r["freight"] == 9000


def test_zero_departures_is_international_not_an_error(ds, db_path):
    add_segments(db_path, "t100_domestic", [seg("ATL", "ZER", 2020, 0, 0)])
    assert rows(ds)[("ZER", 2020)]["service"] == "international"


def test_other_origins_and_unknown_or_lowercase_origin(ds, db_path):
    add_segments(db_path, "t100_international", [seg("JFK", "LHR", 2019, 30, 6000), seg("ATL", "LHR", 2019, 10, 2000)])
    assert set(rows(ds, "ATL")) == {("LHR", 2019)}
    assert rows(ds, "nowhere") == {}
    assert rows(ds, "atl") == {}  # exact match; the page upper-cases


def test_ordered_by_year_then_dest(ds, db_path):
    add_segments(db_path, "t100_international", [seg("ATL", "ZZZ", 2000, 1, 1), seg("ATL", "AAA", 2001, 1, 1), seg("ATL", "AAA", 2000, 1, 1)])
    body = get_json(ds, "/t100/routes_by_year.json?origin=ATL&_shape=objects")
    assert [(r["year"], r["dest"]) for r in body["rows"]] == [(2000, "AAA"), (2000, "ZZZ"), (2001, "AAA")]


def test_destinations_map_domestic_flag_uses_same_rule(ds, db_path):
    add_segments(db_path, "t100_domestic", [seg("ATL", "LAX", 2018, 100, 10000)])
    add_segments(db_path, "t100_international", [seg("ATL", "LAX", 2018, 5, 13)])
    body = get_json(ds, "/t100/destinations_map.json?origin=ATL&_shape=objects")
    assert [r["domestic"] for r in body["rows"]] == [1]


def test_truncation_flag_is_reported(db_path):
    add_segments(db_path, "t100_international", [seg("ATL", f"D{i:02d}", 2019, 1, 1) for i in range(5)])
    ds = make_datasette(db_path, settings={"max_returned_rows": 3})
    body = get_json(ds, "/t100/routes_by_year.json?origin=ATL&_shape=objects")
    assert body["truncated"] is True and len(body["rows"]) == 3
