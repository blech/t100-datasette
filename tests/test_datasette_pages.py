import re

from plugins.t100_globe import crumb_label
from tests.helpers import get


def header(html):
    return html[html.index("<body"):html.index('<section class="content">')]


def test_the_database_page_has_the_site_header(ds):
    html = get(ds, "/t100").text
    top = header(html)
    assert "t100.husk.org" in top and '<p class="crumbs">' not in html and ">home<" not in html
    assert re.search(r'<li aria-current="page">data</li>', top)
    assert re.search(r'<li><a href="/">t100\.husk\.org</a></li>', top)
    for section in ("airports", "aircraft", "airlines", "about"):
        assert f'href="/{section}"' in top
    assert 'aria-current="true"' not in top
    assert re.search(r'<nav class="views" aria-label="Views"></nav>', top)  # empty: it only draws the header's rule


def test_a_table_page_has_data_then_the_table_in_the_trail(ds):
    top = header(get(ds, "/t100/airport_names").text)
    assert re.search(r'<li><a href="/t100">data</a></li>\s*<li aria-current="page">airport_names</li>', top)


def test_a_canned_query_page_has_the_header(ds):
    response = get(ds, "/t100/airports")
    assert response.status_code == 200
    assert "site-header" in header(response.text) and '<p class="crumbs">' not in response.text


def test_the_index_page_trail_is_the_site_name_alone(ds):
    top = header(get(ds, "/-/").text)
    assert re.search(r'<li aria-current="page">t100\.husk\.org</li>', top)
    assert top.count("<li") == 1 + 4  # the site name and the four sections


def test_only_t100_is_called_data():
    assert crumb_label("t100") == "data" and crumb_label("other") == "other"


def test_the_stylesheet_follows_app_css(ds):
    html = get(ds, "/t100").text
    assert html.index("/app.css") < html.index("/static/datasette/style.css")
    assert "/static/datasette/style.css" not in get(ds, "/about").text


def test_the_data_page_header_has_its_rule(ds):
    assert 'class="views"' in header(get(ds, "/t100").text)


def test_both_kinds_of_page_load_the_monospace_experiment(ds):
    import os
    for path in ("/about", "/t100"):
        html = get(ds, path).text
        assert "/static/common/fonts.css" in html and "/static/common/mono.js" in html, path
    css = open("static/common/fonts.css").read()
    for url in __import__("re").findall(r'url\("(/static/[^"]+)"\)', css):
        assert os.path.exists(url.lstrip("/")), url
