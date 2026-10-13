from tests.helpers import add_segments, get_json
from tests.test_routes_by_year import seg


def fetch(ds, origin="ATL", year=2019):
    body = get_json(ds, f"/t100/routes_by_month.json?origin={origin}&year={year}&_shape=objects")
    assert body["truncated"] is False
    return body["rows"]


def test_only_requested_year_and_origin(ds, db_path):
    add_segments(db_path, "t100_international", [
        seg("ATL", "LHR", 2019, 10, 2000, month=3),
        seg("ATL", "LHR", 2018, 99, 9999, month=3),
        seg("JFK", "LHR", 2019, 99, 9999, month=3),
    ])
    rows = fetch(ds)
    assert [(r["dest"], r["month"], r["deps"]) for r in rows] == [("LHR", 3, 10)]


def test_service_decided_per_month_and_ordered(ds, db_path):
    add_segments(db_path, "t100_domestic", [seg("ATL", "LAX", 2019, 50, 5000, month=1), seg("ATL", "LAX", 2019, 1, 10, month=2)])
    add_segments(db_path, "t100_international", [seg("ATL", "LAX", 2019, 2, 5, month=1), seg("ATL", "LAX", 2019, 9, 90, month=2)])
    rows = fetch(ds)
    assert [(r["month"], r["service"]) for r in rows] == [(1, "domestic"), (2, "international")]


def test_unknown_year_is_empty(ds, db_path):
    assert fetch(ds, year=1850) == []


def test_month_with_no_flights_and_no_traffic_is_not_returned(ds, db_path):
    add_segments(db_path, "t100_domestic", [seg("ATL", "ZER", 2019, 0, 0, month=1), seg("ATL", "REAL", 2019, 2, 5, month=1)])
    assert [r["dest"] for r in fetch(ds)] == ["REAL"]
