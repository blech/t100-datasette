import json

import pytest

from plugins import t100_assets
from tests.helpers import ROOT, get, make_datasette


@pytest.fixture
def ds(db_path):
    return make_datasette(db_path)


@pytest.fixture
def no_bundle(monkeypatch, tmp_path):
    """No static/dist/manifest.json, as in development or after a failed build."""
    monkeypatch.setattr(t100_assets, "DIST", tmp_path / "dist")


@pytest.fixture
def bundle(monkeypatch, tmp_path):
    """A manifest as scripts/bundle.mjs writes it."""
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "manifest.json").write_text(json.dumps({
        "charts/rollup.js": {"file": "/static/dist/charts/rollup-AAAAAAAA.js", "imports": ["/static/dist/chunks/chunk-BBBBBBBB.js"]},
    }))
    monkeypatch.setattr(t100_assets, "DIST", dist)


def test_static_files_get_a_short_cache_lifetime_capped_by_the_sites_default(db_path):
    assert get(make_datasette(db_path, {"default_cache_ttl": 86400}), "/static/nav/main.js").headers["cache-control"] == "public, max-age=300"
    assert get(make_datasette(db_path, {"default_cache_ttl": 5}), "/static/nav/main.js").headers["cache-control"] == "public, max-age=5"


def test_only_static_files_are_touched(ds):
    assert "max-age=300" not in get(ds, "/about").headers.get("cache-control", "")


@pytest.fixture
def dist_files():
    """Real files under static/dist/ (which is built output, not committed), removed afterwards."""
    dist = ROOT / "static" / "dist"
    made = []

    def make(name, text="export {};"):
        dist.mkdir(exist_ok=True)
        (dist / name).write_text(text)
        made.append(dist / name)

    yield make
    for path in made:
        path.unlink()


def test_hashed_bundle_files_are_cached_for_a_year_and_the_manifest_is_not(ds, dist_files):
    dist_files("zz_test-ABCD1234.js")
    dist_files("zz_test-ABCD1234.js.map", "{}")
    dist_files("zz_test_manifest.json", "{}")
    assert get(ds, "/static/dist/zz_test-ABCD1234.js").headers["cache-control"] == "public, max-age=31536000, immutable"
    assert get(ds, "/static/dist/zz_test-ABCD1234.js.map").headers["cache-control"] == "public, max-age=31536000, immutable"
    assert get(ds, "/static/dist/zz_test_manifest.json").headers["cache-control"] == "no-cache"


def test_a_modules_whole_import_graph_is_found_entry_first_without_duplicates():
    graph = t100_assets.module_graph("/static/charts/rollup.js")
    assert graph[0] == "/static/charts/rollup.js"
    assert len(graph) == len(set(graph)) > 15
    assert "/static/charts/vendor/plot.js" in graph  # absolute specifier
    assert "/static/common/small.js" in graph  # reached only through ../../ from charts/src/matrix.js
    assert t100_assets.module_graph("/static/nope.js") == []


def test_without_a_bundle_scripts_load_from_source_and_preload_the_import_graph(no_bundle):
    assert t100_assets.script_url("charts/rollup.js") == "/static/charts/rollup.js"
    links = t100_assets.modulepreload("/static/charts/rollup.js")
    assert '<link rel="modulepreload" href="/static/charts/rollup.js">' in links
    assert '<link rel="modulepreload" href="/static/charts/vendor/plot.js">' in links


def test_with_a_bundle_scripts_load_from_it_and_preload_its_chunks(bundle):
    assert t100_assets.script_url("charts/rollup.js") == "/static/dist/charts/rollup-AAAAAAAA.js"
    links = t100_assets.modulepreload("/static/charts/rollup.js")  # either spelling of the entry
    assert links.splitlines() == ['  <link rel="modulepreload" href="/static/dist/charts/rollup-AAAAAAAA.js">',
                                  '  <link rel="modulepreload" href="/static/dist/chunks/chunk-BBBBBBBB.js">']
    assert t100_assets.script_url("charts/other.js") == "/static/charts/other.js"  # an entry the manifest lacks falls back to source


def test_pages_use_and_preload_their_scripts(ds):
    for path in ("/airports/over-time", "/aircraft/over-time"):
        html = get(ds, path).text
        for entry in ("charts/rollup.js", "nav/main.js", "charts/find.js"):
            assert f'<link rel="modulepreload" href="{t100_assets.script_url(entry)}">' in html
        assert f'<script type="module" src="{t100_assets.script_url("charts/rollup.js")}"></script>' in html
