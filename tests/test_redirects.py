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
]


@pytest.mark.parametrize("old,new", OLD)
def test_old_urls_redirect_permanently_keeping_the_query(ds, old, new):
    r = get(ds, old)
    assert r.status_code == 301
    assert r.headers["location"] == new


def test_old_routes_index_goes_to_the_landing_page(ds):
    r = get(ds, "/routes?theme=night")
    assert r.status_code == 302 and r.headers["location"] == "/?theme=night"


@pytest.mark.parametrize("path", ["/globe/toolong", "/routes/toolong", "/route/SFO", "/route/SFO/LH", "/route/SFO/LHR/20x9"])
def test_old_urls_that_never_worked_are_still_404(ds, path):
    assert get(ds, path).status_code == 404


def test_the_all_airports_globe_keeps_its_place(ds):
    assert get(ds, "/globe").status_code == 200


def test_datasette_own_pages_are_not_shadowed(ds):
    assert get(ds, "/t100").status_code == 200
    assert get(ds, "/t100/routes_by_year.json?origin=ATL").status_code == 200
