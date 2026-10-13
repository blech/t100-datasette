from tests.helpers import add_segments, get, make_datasette
from tests.test_routes_by_year import seg

PUBLIC = {"default_allow_sql": False, "allow_download": False, "default_cache_ttl": 86400}


def test_arbitrary_sql_is_blocked_but_canned_queries_work(db_path):
    add_segments(db_path, "t100_international", [seg("ATL", "LHR", 2019, 10, 2000)])
    # control: without the public settings, arbitrary SQL is allowed
    assert get(make_datasette(db_path), "/t100/-/query.json?sql=select+1").status_code == 200
    ds = make_datasette(db_path, settings=PUBLIC)
    assert get(ds, "/t100/-/query.json?sql=select+1").status_code == 403
    assert get(ds, "/t100/-/query?sql=select+1").status_code == 403
    ok = get(ds, "/t100/routes_by_year.json?origin=ATL&_shape=objects")
    assert ok.status_code == 200 and len(ok.json()["rows"]) == 1


def test_database_download_is_blocked(db_path):
    ds = make_datasette(db_path, settings=PUBLIC)
    assert get(ds, "/t100.db").status_code in (403, 404)


def test_cache_header_is_set_on_json(db_path):
    ds = make_datasette(db_path, settings=PUBLIC)
    header = get(ds, "/t100/airports.json?_shape=objects").headers.get("cache-control", "")
    assert "max-age=86400" in header
