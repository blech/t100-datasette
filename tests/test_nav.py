import re

from tests.helpers import get


def crumbs(ds, path):
    """The breadcrumb trail as [(label, href or None)], current page last."""
    html = get(ds, path).text
    nav = re.search(r'<nav class="crumbs".*?</nav>', html, re.S).group(0)
    items = re.findall(r"<li[^>]*>(.*?)</li>", nav, re.S)
    out = []
    for item in items:
        m = re.search(r'<a href="([^"]*)">([^<]*)</a>', item)
        out.append((m.group(2), m.group(1)) if m else (re.sub(r"<[^>]+>", "", item).strip(), None))
    return out


def test_landing_is_just_the_site_name(ds):
    assert crumbs(ds, "/") == [("t100.husk.org", None)]


def test_globe_trails(ds):
    assert crumbs(ds, "/globe") == [("t100.husk.org", "/"), ("globe", None)]
    assert crumbs(ds, "/globe/ATL") == [("t100.husk.org", "/"), ("globe", "/globe"), ("ATL", None)]


def test_routes_trail(ds):
    assert crumbs(ds, "/routes/ATL") == [("t100.husk.org", "/"), ("routes", "/routes"), ("ATL", None)]


def test_route_trails_end_at_the_year_when_there_is_one(ds):
    assert crumbs(ds, "/route/ATL/LAX") == [
        ("t100.husk.org", "/"), ("routes", "/routes"), ("ATL", "/routes/ATL"), ("LAX", None)]
    assert crumbs(ds, "/route/atl/lax/2024") == [
        ("t100.husk.org", "/"), ("routes", "/routes"), ("ATL", "/routes/ATL"), ("LAX", "/route/ATL/LAX"), ("2024", None)]


def test_current_page_is_marked_and_the_trail_is_labelled(ds):
    html = get(ds, "/routes/ATL").text
    assert 'aria-label="Breadcrumb"' in html
    assert re.search(r'<li aria-current="page">ATL</li>', html)


def test_every_page_has_one_theme_chooser_and_the_shared_scripts(ds):
    for path in ["/", "/globe", "/globe/ATL", "/routes/ATL", "/route/ATL/LAX"]:
        html = get(ds, path).text
        assert html.count('id="theme"') == 1, path
        assert "/static/nav/main.js" in html and "/static/nav/style.css" in html, path

