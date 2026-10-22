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


from tests.test_rollup_pages import put


def delta(db_path):
    put(db_path, "carrier_group_year", [dict(year=2019, airline_id="19790", group_id="delta", group_name="Delta (incl. Northwest)", domestic=1,
                                             service_class="F", deps=4, seats=400, passengers=300, freight=0)])


def test_an_airlines_changes_have_their_own_page(ds, db_path):
    delta(db_path)
    over_time = get(ds, "/airlines/delta").text
    changes = get(ds, "/airlines/delta/changes")
    assert changes.status_code == 200
    assert 'id="change-table"' in changes.text and 'id="al-a"' in changes.text and 'id="size-chart"' not in changes.text
    assert 'id="size-chart"' in over_time and 'id="change-table"' not in over_time and 'id="al-a"' not in over_time
    assert re.search(r'<li aria-current="page">changes</li>', changes.text)


def test_an_unknown_airlines_changes_are_not_found(ds):
    assert get(ds, "/airlines/nope/changes").status_code == 404


def test_the_airline_maps_table_link_points_at_changes(ds, db_path):
    delta(db_path)
    assert 'href="/airlines/delta/changes"' in get(ds, "/airlines/delta/globe").text
