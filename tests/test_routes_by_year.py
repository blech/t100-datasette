from tests.helpers import add_segments, get_json, make_datasette


def seg(origin, dest, year, deps, pax, seats=100, freight=0, month=1):
    return dict(year=year, month=month, origin=origin, dest=dest, departures_performed=deps,
                passengers=pax, seats=seats, freight=freight)


def rows(ds, origin="ATL", min_deps=None):
    extra = "" if min_deps is None else f"&min_deps={min_deps}"
    body = get_json(ds, f"/t100/routes_by_year.json?origin={origin}{extra}&_shape=objects")
    assert body["truncated"] is False
    return {(r["dest"], r["year"]): r for r in body["rows"]}


def test_pair_in_both_tables_is_one_row_with_majority_service(ds, db_path):
    add_segments(db_path, "t100_domestic", [seg("ATL", "LAX", 2018, 100, 10000, month=1), seg("ATL", "LAX", 2018, 100, 12000, month=2)])
    add_segments(db_path, "t100_international", [seg("ATL", "LAX", 2018, 5, 13)])
    r = rows(ds)[("LAX", 2018)]
    assert r["deps"] == 205 and r["passengers"] == 22013
    assert r["service"] == "domestic"


def test_exact_tie_is_international(ds, db_path):
    add_segments(db_path, "t100_domestic", [seg("ATL", "XYZ", 2018, 12, 1)])
    add_segments(db_path, "t100_international", [seg("ATL", "XYZ", 2018, 12, 1)])
    assert rows(ds)[("XYZ", 2018)]["service"] == "international"


def test_freight_only_route_uses_departures_not_passengers(ds, db_path):
    add_segments(db_path, "t100_domestic", [seg("ATL", "FRT", 2020, 12, 0, seats=0, freight=9000)])
    r = rows(ds)[("FRT", 2020)]
    assert r["service"] == "domestic" and r["passengers"] == 0 and r["freight"] == 9000


def test_route_year_with_no_flights_and_no_traffic_is_not_returned(ds, db_path):
    add_segments(db_path, "t100_domestic", [seg("ATL", "ZER", 2020, 0, 0)])
    add_segments(db_path, "t100_domestic", [seg("ATL", "REAL", 2020, 3, 10)])
    assert set(rows(ds, min_deps=0)) == {("REAL", 2020)}


def test_zero_departures_with_traffic_is_kept_and_international(ds, db_path):
    add_segments(db_path, "t100_domestic", [seg("ATL", "CHT", 2020, 0, 40)])
    r = rows(ds, min_deps=0)[("CHT", 2020)]
    assert r["passengers"] == 40 and r["service"] == "international"


def test_other_origins_and_unknown_or_lowercase_origin(ds, db_path):
    add_segments(db_path, "t100_international", [seg("JFK", "LHR", 2019, 30, 6000), seg("ATL", "LHR", 2019, 12, 2000)])
    assert set(rows(ds, "ATL")) == {("LHR", 2019)}
    assert rows(ds, "nowhere") == {}
    assert rows(ds, "atl") == {}  # exact match; the page upper-cases


def test_ordered_by_year_then_dest(ds, db_path):
    add_segments(db_path, "t100_international", [seg("ATL", "ZZZ", 2000, 12, 1), seg("ATL", "AAA", 2001, 12, 1), seg("ATL", "AAA", 2000, 12, 1)])
    body = get_json(ds, "/t100/routes_by_year.json?origin=ATL&_shape=objects")
    assert [(r["year"], r["dest"]) for r in body["rows"]] == [(2000, "AAA"), (2000, "ZZZ"), (2001, "AAA")]


def test_destinations_map_domestic_flag_uses_same_rule(ds, db_path):
    add_segments(db_path, "t100_domestic", [seg("ATL", "LAX", 2018, 100, 10000)])
    add_segments(db_path, "t100_international", [seg("ATL", "LAX", 2018, 5, 13)])
    body = get_json(ds, "/t100/destinations_map.json?origin=ATL&_shape=objects")
    assert [r["domestic"] for r in body["rows"]] == [1]


def test_truncation_flag_is_reported(db_path):
    add_segments(db_path, "t100_international", [seg("ATL", f"D{i:02d}", 2019, 12, 1) for i in range(5)])
    ds = make_datasette(db_path, settings={"max_returned_rows": 3})
    body = get_json(ds, "/t100/routes_by_year.json?origin=ATL&_shape=objects")
    assert body["truncated"] is True and len(body["rows"]) == 3


def test_route_year_under_twelve_departures_is_omitted_by_default(ds, db_path):
    add_segments(db_path, "t100_international", [seg("ATL", "ONE", 2025, 1, 2), seg("ATL", "ELV", 2025, 11, 900), seg("ATL", "TWL", 2025, 12, 900)])
    assert set(rows(ds)) == {("TWL", 2025)}


def test_departures_threshold_counts_both_tables_and_all_months(ds, db_path):
    add_segments(db_path, "t100_domestic", [seg("ATL", "SUM", 2025, 4, 400, month=1), seg("ATL", "SUM", 2025, 3, 300, month=2)])
    add_segments(db_path, "t100_international", [seg("ATL", "SUM", 2025, 5, 500, month=3)])
    assert rows(ds)[("SUM", 2025)]["deps"] == 12


def test_min_deps_parameter_overrides_default(ds, db_path):
    add_segments(db_path, "t100_international", [seg("ATL", "ONE", 2025, 1, 2), seg("ATL", "FIV", 2025, 5, 200), seg("ATL", "TWL", 2025, 12, 900)])
    assert set(rows(ds, min_deps=1)) == {("ONE", 2025), ("FIV", 2025), ("TWL", 2025)}
    assert set(rows(ds, min_deps=5)) == {("FIV", 2025), ("TWL", 2025)}
    assert set(rows(ds, min_deps=13)) == set()
    assert set(rows(ds, min_deps="")) == {("TWL", 2025)}


def test_destinations_year_parameter_limits_years_and_blank_means_all(ds, db_path):
    add_segments(db_path, "t100_domestic", [seg("ATL", "LAX", 2018, 12, 100), seg("ATL", "LAX", 2019, 12, 100)])
    def dates(extra):
        body = get_json(ds, f"/t100/destinations.json?origin=ATL{extra}&_shape=objects")
        return {r["date"][:4] for r in body["rows"]}
    assert dates("") == {"2018", "2019"}
    assert dates("&year=") == {"2018", "2019"}
    assert dates("&year=2019") == {"2019"}
