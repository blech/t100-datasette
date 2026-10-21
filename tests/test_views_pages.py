import re

from tests.helpers import get


def test_a_routes_table_has_its_own_page(ds):
    chart = get(ds, "/airports/ATL/LAX").text
    table = get(ds, "/airports/ATL/LAX/table")
    assert table.status_code == 200
    assert 'id="route-table"' in table.text and 'id="route-chart"' not in table.text
    assert 'id="route-chart"' in chart and 'id="route-table"' not in chart
    assert re.search(r'<li aria-current="page">table</li>', table.text)


def test_a_years_table_keeps_the_year(ds):
    r = get(ds, "/airports/ATL/LAX/2024/table")
    assert r.status_code == 200 and 'data-year="2024"' in r.text


def test_the_route_sentence_offers_the_other_direction_in_the_same_view(ds):
    assert 'href="/airports/LAX/ATL/2024"' in get(ds, "/airports/ATL/LAX/2024").text
    assert 'href="/airports/LAX/ATL/2024/table"' in get(ds, "/airports/ATL/LAX/2024/table").text
