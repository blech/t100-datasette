import pytest

from tests.helpers import get

# every URL the site has used before keeps working: permanent redirects to the airport-first paths
OLD = [
    ("/globe/ATL", "/airports/ATL/globe"),
    ("/globe/atl?year=2020&theme=night", "/airports/atl/globe?year=2020&theme=night"),
    ("/routes/ATL", "/airports/ATL"),
    ("/routes/ATL?measure=deps&service=domestic", "/airports/ATL?measure=deps&service=domestic"),
    ("/route/ATL/LAX", "/airports/ATL/LAX"),
    ("/route/ATL/LAX/2019?split=aircraft", "/airports/ATL/LAX/2019?split=aircraft"),
    ("/carriers", "/airlines"),
    ("/carriers?measure=deps", "/airlines?measure=deps"),
    ("/carriers/delta", "/airlines/delta"),
    ("/carriers/delta/globe?year=2019&compare=2010", "/airlines/delta/globe?year=2019&compare=2010"),
    ("/globe", "/airports/globe"),
    ("/globe?year=2020&theme=night", "/airports/globe?year=2020&theme=night"),
    ("/routes", "/airports"),
    ("/routes?theme=night", "/airports?theme=night"),
    ("/aircraft/table?year=2019", "/aircraft?year=2019"),
    ("/airlines?scale=busiest&n=25", "/airlines/over-time?scale=busiest&n=25"),
    ("/airlines?n=10", "/airlines/over-time?n=10"),
    ("/airlines?rank=latest&measure=deps", "/airlines/over-time?rank=latest&measure=deps"),
    ("/airlines?scale=absolute", "/airlines/over-time?scale=absolute"),
    ("/airports/ATL?n=10", "/airports/ATL/destinations?n=10"),
]


@pytest.mark.parametrize("old,new", OLD)
def test_old_urls_redirect_permanently_keeping_the_query(ds, old, new):
    r = get(ds, old)
    assert r.status_code == 301
    assert r.headers["location"] == new


@pytest.mark.parametrize("path", ["/globe/toolong", "/routes/toolong", "/route/SFO", "/route/SFO/LH", "/route/SFO/LHR/20x9"])
def test_old_urls_that_never_worked_are_still_404(ds, path):
    assert get(ds, path).status_code == 404


def test_the_all_airports_globe_lives_under_airports(ds):
    assert get(ds, "/airports/globe").status_code == 200


def test_datasette_own_pages_are_not_shadowed(ds):
    assert get(ds, "/t100").status_code == 200
    assert get(ds, "/t100/routes_by_year.json?origin=ATL").status_code == 200


@pytest.mark.parametrize("path", ["/airlines", "/airlines?measure=seats&year=2019", "/airlines?flights=freight&service=domestic"])
def test_the_airlines_table_keeps_the_settings_it_reads(ds, path):
    r = get(ds, path)
    assert r.status_code == 200 and 'id="airline-table"' in r.text
