from tests.helpers import get


def test_route_page_renders_with_origin_and_destination(ds):
    r = get(ds, "/route/SFO/LHR")
    assert r.status_code == 200
    assert 'data-origin="SFO"' in r.text and 'data-dest="LHR"' in r.text and 'data-year=""' in r.text
    assert "/static/charts/routepage.js" in r.text


def test_route_year_page_carries_the_year(ds):
    r = get(ds, "/route/SFO/LHR/2019")
    assert r.status_code == 200 and 'data-year="2019"' in r.text
    assert "SFO → LHR in 2019" in r.text


def test_codes_are_normalised(ds):
    r = get(ds, "/route/sfo/lhr/2019")
    assert 'data-origin="SFO"' in r.text and 'data-dest="LHR"' in r.text


def test_bad_paths_are_404(ds):
    for path in ("/route/SFO", "/route/SFO/LH", "/route/SFO/LHR/201", "/route/SFO/LHR/20x9", "/route/SFO/LHR/2019/01"):
        assert get(ds, path).status_code == 404, path
