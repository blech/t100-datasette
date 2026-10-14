import re

import pytest

from tests.helpers import get
from tests.test_rollup_queries import fam, put


@pytest.mark.parametrize("path, kind", [("/aircraft", "aircraft"), ("/carriers", "carriers")])
def test_page_renders_with_its_kind_and_assets(ds, path, kind):
    r = get(ds, path)
    assert r.status_code == 200
    assert f'data-kind="{kind}"' in r.text
    assert "/static/charts/rollup.js" in r.text
    assert 'id="heatmap"' in r.text and 'id="label-tip"' in r.text


@pytest.mark.parametrize("path", ["/aircraft", "/carriers"])
def test_settings_read_as_one_sentence(ds, path):
    html = get(ds, path).text
    sentence = re.search(r'<p class="chart-sentence">(.*?)</p>', html, re.S).group(1)
    assert re.findall(r'<select id="([^"]+)"', sentence) == ["heat-measure", "heat-kind", "heat-service", "heat-n", "heat-rank"]
    assert 'id="heat-scale"' in html


def test_engine_story_has_its_own_page_and_the_aircraft_page_links_to_it(ds):
    html = get(ds, "/aircraft/engines").text
    for id_ in ["engine-chart", "engine-measure", "engine-kind", "engine-band"]:
        assert f'id="{id_}"' in html
    assert "/static/charts/engines.js" in html
    assert 'href="/aircraft"' in html
    aircraft = get(ds, "/aircraft").text
    assert "engine-chart" not in aircraft and 'href="/aircraft/engines"' in aircraft


def test_breadcrumbs_and_landing_links(ds):
    assert 'aria-current="page">aircraft<' in get(ds, "/aircraft").text
    landing = get(ds, "/").text
    assert 'href="/aircraft"' in landing and 'href="/carriers"' in landing and 'href="/aircraft/engines"' in landing


def test_a_family_page_is_found_by_its_slug(ds, db_path):
    put(db_path, "family_year", [fam(2019, "DC-9 / MD-80 / MD-90", 1, "F", 3)])
    r = get(ds, "/aircraft/dc-9-md-80-md-90")
    assert r.status_code == 200
    assert 'data-family="DC-9 / MD-80 / MD-90"' in r.text
    assert "/static/charts/family.js" in r.text
    assert 'aria-current="page">DC-9 / MD-80 / MD-90<' in r.text


def test_an_unknown_family_is_404_and_engines_is_not_a_family(ds):
    assert get(ds, "/aircraft/no-such-plane").status_code == 404
    assert "engine-chart" in get(ds, "/aircraft/engines").text
