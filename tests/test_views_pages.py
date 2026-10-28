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
    # only in one-way mode: both ways, the direction menu stands in for it
    assert 'href="/airports/LAX/ATL/2024?dir=out"' in get(ds, "/airports/ATL/LAX/2024?dir=out").text
    assert 'href="/airports/LAX/ATL/2024/table?dir=out"' in get(ds, "/airports/ATL/LAX/2024/table?dir=out").text


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


def test_an_airlines_routes_have_their_own_page(ds, db_path):
    delta(db_path)
    r = get(ds, "/airlines/delta/routes")
    assert r.status_code == 200
    assert 'id="matrix"' in r.text and 'data-kind="routes"' in r.text and "/static/charts/rollup.js" in r.text
    assert 'id="matrix-kind"' not in r.text and 'id="matrix-service"' in r.text and 'name="scale"' in r.text
    assert 'data-group="delta"' in r.text and 'data-airline=""' in r.text and 'data-latest-year="2019"' in r.text
    assert re.search(r'<li aria-current="page">routes</li>', r.text)
    assert re.search(r'<a href="/airlines/delta">Over time</a> · <strong aria-current="page">Routes</strong>', r.text)


def test_a_members_routes_page_queries_the_member_and_ranks_by_its_last_year(ds, db_path):
    put(db_path, "carrier_group", [dict(airline_id="19386", group_id="delta", group_name="Delta (incl. Northwest)", airline_name="Northwest Airlines Inc.")])
    put(db_path, "carrier_group_year", [dict(year=2008, airline_id="19386", group_id="delta", group_name="Delta (incl. Northwest)", domestic=1,
                                             service_class="F", deps=4, seats=400, passengers=300, freight=0)])
    r = get(ds, "/airlines/19386/routes")
    assert r.status_code == 200
    assert 'data-group="delta"' in r.text and 'data-airline="19386"' in r.text and 'data-latest-year="2008"' in r.text
    assert ">2008 only<" in r.text


def test_an_unknown_airlines_routes_are_not_found(ds):
    assert get(ds, "/airlines/nope/routes").status_code == 404


def test_an_airlines_aircraft_have_their_own_page(ds, db_path):
    delta(db_path)
    r = get(ds, "/airlines/delta/aircraft")
    assert r.status_code == 200
    assert 'id="matrix"' in r.text and 'data-kind="fleet"' in r.text and "/static/charts/rollup.js" in r.text
    assert 'id="matrix-kind"' in r.text and 'id="matrix-service"' in r.text and 'name="scale"' in r.text
    assert 'data-group="delta"' in r.text and 'data-airline=""' in r.text and 'data-latest-year="2019"' in r.text
    assert re.search(r'<li aria-current="page">aircraft</li>', r.text)
    assert re.search(r'<a href="/airlines/delta/routes">Routes</a> · <strong aria-current="page">Aircraft</strong>', r.text)


def test_a_members_aircraft_page_shows_that_member_alone(ds, db_path):
    put(db_path, "carrier_group", [dict(airline_id="19386", group_id="delta", group_name="Delta (incl. Northwest)", airline_name="Northwest Airlines Inc.")])
    put(db_path, "carrier_group_year", [dict(year=2008, airline_id="19386", group_id="delta", group_name="Delta (incl. Northwest)", domestic=1,
                                             service_class="F", deps=4, seats=400, passengers=300, freight=0)])
    r = get(ds, "/airlines/19386/aircraft")
    assert r.status_code == 200
    assert 'data-group="delta"' in r.text and 'data-airline="19386"' in r.text and ">2008 only<" in r.text
    assert 'One of the airlines counted together as <a href="/airlines/delta/aircraft">Delta (incl. Northwest)</a>' in r.text
    assert "counted for the whole of" not in r.text
    assert "with Delta (incl. Northwest) picked out" in r.text  # the family and aircraft pages pick out groups, not their members


def test_an_unknown_airlines_aircraft_are_not_found(ds):
    assert get(ds, "/airlines/nope/aircraft").status_code == 404
