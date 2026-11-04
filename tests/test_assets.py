import pytest

from plugins import t100_assets
from tests.helpers import add_segments, get, make_datasette


@pytest.fixture
def ds(db_path):
    return make_datasette(db_path)


def test_static_files_get_a_short_cache_lifetime_capped_by_the_sites_default(db_path):
    assert get(make_datasette(db_path, {"default_cache_ttl": 86400}), "/static/nav/main.js").headers["cache-control"] == "public, max-age=300"
    assert get(make_datasette(db_path, {"default_cache_ttl": 5}), "/static/nav/main.js").headers["cache-control"] == "public, max-age=5"


def test_only_static_files_are_touched(ds):
    assert "max-age=300" not in get(ds, "/about").headers.get("cache-control", "")


def test_a_modules_whole_import_graph_is_found_entry_first_without_duplicates():
    graph = t100_assets.module_graph("/static/charts/rollup.js")
    assert graph[0] == "/static/charts/rollup.js"
    assert len(graph) == len(set(graph)) > 15
    assert "/static/charts/vendor/plot.js" in graph  # absolute specifier
    assert "/static/common/small.js" in graph  # reached only through ../../ from charts/src/matrix.js
    assert t100_assets.module_graph("/static/nope.js") == []


def test_pages_preload_their_modules(ds):
    for path in ("/airports/over-time", "/aircraft/over-time"):
        html = get(ds, path).text
        assert '<link rel="modulepreload" href="/static/charts/rollup.js">' in html
        assert '<link rel="modulepreload" href="/static/nav/main.js">' in html
