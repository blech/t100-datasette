import sqlite3

from build_database import rebuild_derived_tables, rebuild_route_year_totals
from tests.helpers import add_segments, get_json
from tests.test_routes_by_year import rows as routes_by_year, seg


def load(db_path):
    add_segments(db_path, "t100_domestic", [
        seg("ATL", "LAX", 2025, 100, 10000, month=1), seg("ATL", "LAX", 2025, 100, 12000, month=2),
        seg("ATL", "XYZ", 2025, 12, 1),       # a tie with the international table: international
        seg("ATL", "FEW", 2025, 11, 500),     # under 12 departures: left out
        seg("ATL", "FRT", 2025, 12, 0, seats=0, freight=9000),
        seg("DEN", "ATL", 2025, 40, 4000), seg("ATL", "LAX", 2024, 50, 5000)])
    add_segments(db_path, "t100_international", [
        seg("ATL", "LAX", 2025, 5, 13), seg("ATL", "XYZ", 2025, 12, 1), seg("ATL", "LHR", 2025, 300, 60000)])
    conn = sqlite3.connect(db_path)
    rebuild_route_year_totals(conn)
    conn.close()


def domestic(ds, year=2025):
    body = get_json(ds, f"/t100/domestic_routes.json?year={year}&_shape=objects&_size=max")
    assert body["truncated"] is False
    return body["rows"]


def test_route_year_totals_sums_both_tables_and_counts_domestic_departures(db_path):
    load(db_path)
    conn = sqlite3.connect(db_path)
    row = conn.execute("SELECT deps, domestic_deps, passengers FROM route_year_totals WHERE year = 2025 AND origin = 'ATL' AND dest = 'LAX'").fetchone()
    conn.close()
    assert row == (205, 200, 22013)


def test_domestic_routes_match_each_airports_routes_with_international_hidden(ds, db_path):
    load(db_path)
    got = domestic(ds)
    for origin in ["ATL", "DEN"]:
        page = {r["dest"]: r for (dest, year), r in routes_by_year(ds, origin).items() if year == 2025 and r["service"] == "domestic"}
        mine = {r["dest"]: r for r in got if r["origin"] == origin}
        assert set(mine) == set(page), origin
        for dest, r in mine.items():
            assert (r["deps"], r["seats"], r["passengers"], r["freight"], r["service"]) == (
                page[dest]["deps"], page[dest]["seats"], page[dest]["passengers"], page[dest]["freight"], "domestic"), (origin, dest)


def test_domestic_routes_are_for_one_year(ds, db_path):
    load(db_path)
    assert [(r["origin"], r["dest"], r["deps"]) for r in domestic(ds, 2024)] == [("ATL", "LAX", 50)]


def test_rebuild_derived_tables_builds_route_year_totals(db_path):
    load(db_path)
    conn = sqlite3.connect(db_path)
    counts = rebuild_derived_tables(conn)
    conn.close()
    assert counts["route_year_totals"] == 7
