import pytest

from tests.helpers import add_segments, get, make_datasette
from tests.test_routes_by_year import seg

TABLES = ["t100_domestic", "t100_international"]


@pytest.fixture
def ds(db_path):
    add_segments(db_path, "t100_international", [seg("ATL", "LHR", 2019, 12, 2000)])
    return make_datasette(db_path)


@pytest.mark.parametrize("table", TABLES)
@pytest.mark.parametrize("ext", ["", ".json"])
@pytest.mark.parametrize("query", ["_next=5", "origin=ATL&_next=1234&month=5", "_facet=month", "_facet_array=x", "_facet_date=y"])
def test_deep_paging_and_facets_on_the_big_tables_are_refused(ds, table, ext, query):
    r = get(ds, f"/t100/{table}{ext}?{query}")
    assert r.status_code == 403
    assert "text/plain" in r.headers["content-type"]
    assert "paging" in r.text.lower()


@pytest.mark.parametrize("table", TABLES)
def test_the_first_page_of_a_big_table_still_works(ds, table):
    assert get(ds, f"/t100/{table}?origin=ATL").status_code == 200
    assert get(ds, f"/t100/{table}.json?origin=ATL&_size=5").status_code == 200


def test_canned_queries_and_site_pages_are_not_affected(ds):
    assert get(ds, "/t100/routes_by_year.json?origin=ATL&_shape=objects").status_code == 200
    assert get(ds, "/airports/ATL?_next=1").status_code == 200


def test_robots_txt_keeps_crawlers_out_of_the_data_pages_only(ds):
    r = get(ds, "/robots.txt")
    assert r.status_code == 200 and "text/plain" in r.headers["content-type"]
    lines = r.text.splitlines()
    assert "User-agent: *" in lines
    assert "Disallow: /t100/" in lines
    assert "Disallow: /" not in lines
