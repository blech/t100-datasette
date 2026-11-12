from tests.helpers import get_json
from tests.test_rollup_queries import put


def rows(ds, **args):
    q = "&".join(f"{k}={v}" for k, v in dict(year=2019, n=10, service="", **args).items())
    return get_json(ds, f"/t100/busiest_routes_year.json?_shape=objects&{q}")["rows"]


def test_each_pair_carries_its_distance_where_one_is_known_in_the_order_origin_before_dest(ds, db_path):
    put(db_path, "route_year_totals", [
        dict(year=2019, origin="SFO", dest="LAX", deps=9, domestic_deps=9, seats=0, passengers=900, freight=0),
        dict(year=2019, origin="LAX", dest="SFO", deps=9, domestic_deps=9, seats=0, passengers=800, freight=0),
        dict(year=2019, origin="AAA", dest="BBB", deps=1, domestic_deps=1, seats=0, passengers=5, freight=0)])
    put(db_path, "pair_distance", [dict(a="LAX", b="SFO", distance=337)])
    got = [(r["origin"], r["dest"], r["passengers"], r["distance"]) for r in rows(ds)]
    assert got == [("LAX", "SFO", 1700, 337), ("AAA", "BBB", 5, None)]
