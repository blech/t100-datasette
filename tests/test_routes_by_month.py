from tests.helpers import add_segments, get_json
from tests.test_routes_by_year import seg


def fetch(ds, origin="ATL", year=2019, min_deps=None):
    extra = "" if min_deps is None else f"&min_deps={min_deps}"
    body = get_json(ds, f"/t100/routes_by_month.json?origin={origin}&year={year}{extra}&_shape=objects")
    assert body["truncated"] is False
    return body["rows"]


def test_only_requested_year_and_origin(ds, db_path):
    add_segments(db_path, "t100_international", [
        seg("ATL", "LHR", 2019, 12, 2000, month=3),
        seg("ATL", "LHR", 2018, 99, 9999, month=3),
        seg("JFK", "LHR", 2019, 99, 9999, month=3),
    ])
    rows = fetch(ds)
    assert [(r["dest"], r["month"], r["deps"]) for r in rows] == [("LHR", 3, 12)]


def test_service_decided_per_month_and_ordered(ds, db_path):
    add_segments(db_path, "t100_domestic", [seg("ATL", "LAX", 2019, 50, 5000, month=1), seg("ATL", "LAX", 2019, 1, 10, month=2)])
    add_segments(db_path, "t100_international", [seg("ATL", "LAX", 2019, 2, 5, month=1), seg("ATL", "LAX", 2019, 9, 90, month=2)])
    rows = fetch(ds)
    assert [(r["month"], r["service"]) for r in rows] == [(1, "domestic"), (2, "international")]


def test_unknown_year_is_empty(ds, db_path):
    assert fetch(ds, year=1850) == []


def test_month_with_no_flights_and_no_traffic_is_not_returned(ds, db_path):
    add_segments(db_path, "t100_domestic", [seg("ATL", "ZER", 2019, 0, 0, month=1), seg("ATL", "REAL", 2019, 12, 5, month=1)])
    assert [r["dest"] for r in fetch(ds)] == ["REAL"]


def test_every_month_of_a_route_passing_the_year_threshold_is_kept(ds, db_path):
    add_segments(db_path, "t100_domestic", [seg("ATL", "SEA", 2019, 5, 500, month=1), seg("ATL", "SEA", 2019, 4, 400, month=2), seg("ATL", "SEA", 2019, 3, 300, month=3)])
    assert [(r["month"], r["deps"]) for r in fetch(ds)] == [(1, 5), (2, 4), (3, 3)]


def test_route_under_the_year_threshold_has_no_months(ds, db_path):
    add_segments(db_path, "t100_domestic", [seg("ATL", "SEA", 2019, 6, 600, month=1), seg("ATL", "SEA", 2019, 5, 500, month=2)])
    assert fetch(ds) == []


def test_threshold_is_per_requested_year(ds, db_path):
    add_segments(db_path, "t100_domestic", [seg("ATL", "SEA", 2018, 50, 5000, month=1), seg("ATL", "SEA", 2019, 2, 100, month=1)])
    assert fetch(ds) == []


def test_min_deps_parameter_applies_to_months(ds, db_path):
    add_segments(db_path, "t100_domestic", [seg("ATL", "SEA", 2019, 2, 100, month=1)])
    assert [r["dest"] for r in fetch(ds, min_deps=1)] == ["SEA"]
    assert fetch(ds, min_deps=3) == []
