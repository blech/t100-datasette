import re

from plugins.t100_globe import crumb_label
from tests.helpers import get


def header(html):
    return html[html.index("<body"):html.index('<section class="content">')]


def test_the_database_page_has_the_site_header(ds):
    html = get(ds, "/t100").text
    top = header(html)
    assert "t100.husk.org" in top and '<p class="crumbs">' not in html and ">home<" not in html
    assert re.search(r'<li><a href="/t100" aria-current="page">data</a></li>', top)  # always a link
    assert re.search(r'<li><a href="/">t100\.husk\.org</a></li>', top)
    for section in ("airports", "aircraft", "airlines", "about"):
        assert f'href="/{section}"' in top
    assert 'aria-current="true"' not in top


def test_the_views_line_is_never_empty_so_the_spacing_matches_the_site(ds):
    for path in ("/t100", "/t100/airport_names", "/t100/airports"):
        views = re.search(r'<nav class="views"[^>]*>(.*?)</nav>', header(get(ds, path).text), re.S).group(1)
        assert views.strip() == "&nbsp;"


def test_a_table_page_has_data_then_the_table_in_the_trail(ds):
    top = header(get(ds, "/t100/airport_names").text)
    assert re.search(r'<li><a href="/t100">data</a></li>\s*<li aria-current="page">airport_names</li>', top)


def test_a_canned_query_page_has_the_header(ds):
    response = get(ds, "/t100/airports")
    assert response.status_code == 200
    assert "site-header" in header(response.text) and '<p class="crumbs">' not in response.text


def test_a_page_with_no_database_has_the_site_name_alone_as_its_trail(ds):
    top = header(get(ds, "/-/versions").text)  # a Datasette page of its own, with no database
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


def test_both_kinds_of_page_load_the_monospace_font(ds):
    import os
    for path in ("/about", "/t100"):
        html = get(ds, path).text
        assert "/static/common/fonts.css" in html and "mono.js" not in html, path
    css = open("static/common/fonts.css").read()
    assert "data-mono" not in css and "B612 Mono" in css and "0.8125rem" in css
    for url in __import__("re").findall(r'url\("(/static/[^"]+)"\)', css):
        assert os.path.exists(url.lstrip("/")), url


def test_datasettes_own_index_goes_to_the_database_page(ds):
    # one database, so its index page says nothing the database page doesn't
    response = get(ds, "/-/")
    assert response.status_code == 302 and response.headers["location"] == "/t100"
    assert get(ds, "/-/versions").status_code == 200  # Datasette's other /-/ pages are untouched


def test_the_footer_credits_datasette_in_place_of_the_theme_menu(ds):
    for path in ("/t100", "/t100/airport_names"):
        f = re.search(r'<footer class="site-footer">.*?</footer>', get(ds, path).text, re.S).group(0)
        assert 'Powered by <a href="https://datasette.io/">Datasette</a>' in f and 'id="theme"' not in f
    assert "Powered by" not in get(ds, "/about").text
