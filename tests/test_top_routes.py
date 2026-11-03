import re
import sqlite3

import build_database
from build_database import rebuild_pair_distance, rebuild_route_year_totals, rebuild_top_route_year
from tests.helpers import add_segments, get, get_json


def seg(origin, dest, year, pax, month=1, distance=300):
    return dict(year=year, month=month, origin=origin, dest=dest, distance=distance, departures_performed=pax // 10,
                seats=pax * 2, passengers=pax, freight=0)


def load(db_path, monkeypatch, top=1):
    """With a top of 1: AAA-BBB is the busiest over all years and in 2023 and 2024, CCC-DDD in 2025, GGG-HHH of the long haul;
    EEE-FFF is second in 2025 and third over all years."""
    monkeypatch.setattr(build_database, "TOP_ROUTES", top)
    add_segments(db_path, "t100_domestic", [
        seg("AAA", "BBB", 2023, 100, distance=290), seg("AAA", "BBB", 2024, 600), seg("BBB", "AAA", 2024, 400),
        *(seg("CCC", "DDD", 2025, 20, month=m) for m in range(1, 13)),
        *(seg("EEE", "FFF", 2025, 10, month=m) for m in range(1, 13)),
        seg("GGG", "HHH", 2025, 30, distance=3100)])
    conn = sqlite3.connect(db_path)
    rebuild_route_year_totals(conn)
    rebuild_pair_distance(conn)
    rebuild_top_route_year(conn)
    conn.close()


def table(db_path, sql):
    conn = sqlite3.connect(db_path)
    rows = conn.execute(sql).fetchall()
    conn.close()
    return rows


def test_pair_distance_is_both_directions_in_the_last_year_flown(db_path, monkeypatch):
    load(db_path, monkeypatch)
    assert table(db_path, "SELECT a, b, distance FROM pair_distance WHERE a = 'AAA'") == [("AAA", "BBB", 300)]


def test_top_route_year_keeps_the_busiest_in_some_year_or_over_all_years_in_each_band_with_their_ranks(db_path, monkeypatch):
    load(db_path, monkeypatch)
    rows = table(db_path, "SELECT a, b, year, service, distance, band, passengers, year_rank, overall_rank FROM top_route_year ORDER BY a, year")
    assert rows == [("AAA", "BBB", 2023, "domestic", 300, 0, 100, 1, 1), ("AAA", "BBB", 2024, "domestic", 300, 0, 1000, 1, 1),
                    ("CCC", "DDD", 2025, "domestic", 300, 0, 240, 1, 2), ("GGG", "HHH", 2025, "domestic", 3100, 3000, 30, 1, 1)]


def test_top_route_year_keeps_more_with_a_longer_list(db_path, monkeypatch):
    load(db_path, monkeypatch, top=2)
    assert table(db_path, "SELECT year_rank, overall_rank FROM top_route_year WHERE a = 'EEE'") == [(2, 3)]


def test_route_band_year_counts_every_pair(db_path, monkeypatch):
    load(db_path, monkeypatch)
    assert table(db_path, "SELECT year, service, band, passengers FROM route_band_year ORDER BY year, band") == [
        (2023, "domestic", 0, 100), (2024, "domestic", 0, 1000), (2025, "domestic", 0, 360), (2025, "domestic", 3000, 30)]


def test_top_routes_by_year_gives_the_pairs_then_the_totals(ds, db_path, monkeypatch):
    load(db_path, monkeypatch)
    body = get_json(ds, "/t100/top_routes_by_year.json?_shape=objects")
    assert body["truncated"] is False
    got = [(r["origin"], r["dest"], r["year"], r["distance"], r["band"], r["passengers"], r["rest"]) for r in body["rows"] if r["year"] == 2025]
    assert got == [("CCC", "DDD", 2025, 300, 0, 240, 0), ("GGG", "HHH", 2025, 3100, 3000, 30, 0),
                   ("", "", 2025, 0, 0, 360, 1), ("", "", 2025, 3000, 3000, 30, 1)]


def test_the_routes_matrix_page(ds):
    r = get(ds, "/airports/routes")
    assert r.status_code == 200
    assert 'data-kind="toproutes"' in r.text and 'id="matrix"' in r.text and "/static/charts/rollup.js" in r.text
    assert "<h1>Routes over time</h1>" in r.text
    assert '<a href="/airports">airports</a>' in r.text and 'aria-current="page">routes<' in r.text
    sentences = re.findall(r'<p class="chart-sentence">(.*?)</p>', r.text, re.S)
    assert re.findall(r'<select id="([^"]+)"', sentences[0]) == ["matrix-measure", "matrix-service", "matrix-n", "matrix-rank"]
    assert re.findall(r'<select id="([^"]+)"', sentences[1]) == ["matrix-from", "matrix-to"]


def test_routes_by_year_gives_each_other_airports_distance_whichever_end_it_is(ds, db_path, monkeypatch):
    load(db_path, monkeypatch)
    for origin, dest in (("AAA", "BBB"), ("BBB", "AAA")):
        rows = get_json(ds, f"/t100/routes_by_year.json?origin={origin}&dir=&min_deps=1&_shape=objects")["rows"]
        assert {(r["dest"], r["year"], r["distance"]) for r in rows} == {(dest, 2023, 300), (dest, 2024, 300)}


def test_top_routes_by_year_sends_the_pairs_ranked_in_the_year_asked_and_each_years_busiest(ds, db_path, monkeypatch):
    load(db_path, monkeypatch, top=3)
    pairs = lambda year: {(r["origin"], r["dest"]) for r in get_json(ds, f"/t100/top_routes_by_year.json?year={year}&_shape=objects")["rows"] if not r["rest"]}
    busiest = {("AAA", "BBB"), ("CCC", "DDD"), ("GGG", "HHH")}  # each the busiest of its band in some year
    assert pairs("") == pairs(2025) == busiest | {("EEE", "FFF")}
    assert pairs(2023) == busiest  # EEE-FFF didn't fly in 2023
