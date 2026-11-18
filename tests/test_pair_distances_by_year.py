from tests.helpers import add_segments, rolled_json
from tests.test_routes_by_year import seg
from tests.test_rollup_queries import put


def pairs(ds, year=2019):
    body = rolled_json(ds, f"/t100/pair_distances_by_year.json?year={year}&_shape=objects")
    assert body["truncated"] is False
    return {(r["a"], r["b"]): r for r in body["rows"]}


def test_one_row_per_pair_both_directions_together(ds, db_path):
    add_segments(db_path, "t100_domestic", [seg("LAX", "ATL", 2019, 30, 3000, freight=7), seg("ATL", "LAX", 2019, 20, 2000, freight=5)])
    r = pairs(ds)[("ATL", "LAX")]
    assert (r["deps"], r["passengers"], r["freight"]) == (50, 5000, 12)


def test_only_the_year_asked_for(ds, db_path):
    add_segments(db_path, "t100_domestic", [seg("ATL", "LAX", 2018, 10, 100), seg("ATL", "SFO", 2019, 10, 100)])
    assert set(pairs(ds)) == {("ATL", "SFO")}


def test_rows_carry_both_distances_and_none_without_one(ds, db_path):
    put(db_path, "pair_distance", [dict(a="ATL", b="LAX", distance=1946, gc_distance=1950)])
    add_segments(db_path, "t100_domestic", [seg("ATL", "LAX", 2019, 10, 100), seg("ATL", "ZZZ", 2019, 10, 100)])
    got = pairs(ds)
    assert (got[("ATL", "LAX")]["distance"], got[("ATL", "LAX")]["gc_distance"]) == (1946, 1950)
    assert got[("ATL", "ZZZ")]["gc_distance"] is None


def test_loops_and_pairs_with_nothing_are_left_out(ds, db_path):
    add_segments(db_path, "t100_domestic", [seg("ATL", "ATL", 2019, 10, 100), seg("ATL", "NIL", 2019, 0, 0), seg("ATL", "LAX", 2019, 1, 1)])
    assert set(pairs(ds)) == {("ATL", "LAX")}
